import { Media } from "../interfaces";
import Fuse from "fuse.js";
import { Note } from "../../api/vault/notes/notes.types";
import { SearchNotePreferences } from "../preferences";
import { getPreferenceValues } from "@raycast/api";
import { parseQuery } from "./parse";
import { evaluateQueryAST } from "./evaluate";
 
const reservedKeys = ["logic", "sort"];
const validLogicValues = ["and", "or"];
const validSortValues = ["az", "za", "mn", "mo", "cn", "co", "s"];
const validSearchModes = ["=", "~", ">"];
const pref = getPreferenceValues<SearchNotePreferences>();
let searchMode = pref.prefSearchMode;

export function searchFunction(notes: Note[], searchQuery: string): Note[] {
  const query = (searchQuery ?? "").trim();
  if (!query) return notes;

  // 1) Parse to AST safely
  let ast;
  try {
    ast = parseQuery(query);
  } catch {
    return notes; // graceful fallback on malformed query
  }

  // 2) Build docs: expose all note fields (custom props included) + stable id
  const docs = notes.map((n) => ({
    id: n.path,   // stable identifier for evaluator + mapping back
    ...n,         // exposes custom/frontmatter keys (e.g., index, status, locations, etc.)
  }));

  // 3) Evaluate (Fuse only kicks in for terms with ~; content is only used when the term targets it)
  //console.log("DOCS", JSON.stringify(docs.slice(0, 5), null, 2));
  const { hits } = evaluateQueryAST(ast, docs, {
    defaultFields: Array.isArray(pref.prefSearchScope)
      ? (pref.prefSearchScope as unknown as string[])
      : [pref.prefSearchScope || "title"],

    fieldMap: {
      // Aliases / reserved behavior
      file: (d: any) => [d.title, ...(d.aliases ?? [])],
      name: (d: any) => [d.title, ...(d.aliases ?? [])],
      // Optional: keep tag mapping explicit; otherwise the spread already exposes d.tags
      tag: (d: any) => d.tags,
      tags: (d: any) => d.tags,
      // Heavy fields (Fuse will only touch when a fuzzy term targets these fields)
      full: (d: any) => [d.content, d.path].filter(Boolean),
      content: (d: any) => d.content,
    },

    // Only applied to terms carrying ~
    fuzzy: { threshold: 0.35, minMatchCharLength: 2 },
  });

  // 4) Map back to Notes in ranked order
  const byId = new Map(notes.map((n) => [n.path, n] as const));
  return hits
    .map((h) => byId.get(h.id))
    .filter((n): n is Note => Boolean(n));
}



/**
 * Filters a list of notes according to the input search string. If the search string is empty, all notes are returned. It will match the notes title, path and content.
 *
 * @param notes - The notes to load the media for
 * @param input - Search input
 * @param byContent - If true, will use the content of the note to filter.
 * @returns - A list of notes filtered according to the input search string
 */
export function filterNotes(notes: Note[], pairs: { key: string; value: string }[]) {
  if (pairs.length === 0) return sortNotes(notes, pairs);

  let matchingSets: Set<Note>[] = [];

  for (const { key, value } of pairs) {
    if (reservedKeys.includes(key)) continue;
    const term = value.toLowerCase();

    const matched = notes.filter((note) => {
      if (key === "name") {
        return (
          note.title.toLowerCase().includes(term) ||
          (note.aliases?.some(alias => alias.toLowerCase().includes(term)))
        );
      }
      if (key === "full") {
        return (
          note.content.toLowerCase().includes(term) ||
          note.path.toLowerCase().includes(term)
        );
      }
      const field = note[key];
      if (typeof field === "string") {
        return field.toLowerCase().includes(term);
      } else if (Array.isArray(field)) {
        return field.some(item =>
          typeof item === "string" && item.toLowerCase().includes(term)
        );
      } else {
        return String(field).toLowerCase().includes(term);
      }
    });

    matchingSets.push(new Set(matched));
  }

  const result = combineMatches(notes, matchingSets, pairs);

  // console.log("Filtered notes:", result.length, "from", notes.length, "using pairs:", pairs);

  return sortNotes(result, pairs);
}

export function filterNotesFuzzy(notes: Note[], pairs: { key: string; value: string }[]) {
  if (pairs.length === 0) return sortNotes(notes, pairs);

  let matchingSets: Set<Note>[] = [];

  for (const { key, value } of pairs) {
    if (reservedKeys.includes(key)) continue;
    let fuseKeys: string[];

    switch (key) {
      case "name":
        fuseKeys = ["title", "aliases"];
        break;
      case "full":
        fuseKeys = ["content", "path"];
        break;
      default:
        fuseKeys = [key];
        break;
    }

    const fuseOptions = {
      keys: fuseKeys,
      fieldNormWeight: 2.0,
      ignoreLocation: true,
      threshold: 0.3,
      useExtendedSearch: true,
      shouldSort: false,
    };

    const fuse = new Fuse(notes, fuseOptions);
    const matched = fuse.search(value).map((r) => r.item);
    matchingSets.push(new Set(matched));
  }

  const result = combineMatches(notes, matchingSets, pairs);

  return sortNotes(result, pairs);
}


/**
 * Filters a list of media according to the input search string. If the input is empty, all media is returned. It will match the medias title, path and all notes mentioning the media.
 *
 * @param vault - Vault to search
 * @param input - Search input
 * @returns - A list of media filtered according to the input search string
 */
export function filterMedia(mediaList: Media[], input: string, notes: Note[]) {
  if (input?.length === 0) {
    return mediaList;
  }

  input = input.toLowerCase();

  notes = notes.filter((note) => note.title.toLowerCase().includes(input));

  return mediaList.filter((media) => {
    return (
      media.title.toLowerCase().includes(input) ||
      media.path.toLowerCase().includes(input) ||
      // Filter media that is mentioned in a note which has the searched title
      notes.some((note) => note.content.includes(media.title))
    );
  });
}

//-------------------------------------------------------------------------------------------------------------------------------

export function parseSearchQuery(input: string): { pairs: { key: string; value: string }[] } {
  const pairs: { key: string; value: string }[] = [];

  // Match key:"quoted value" or key:value or "standalone quoted" or standalone
  const tokens = input.match(/\w+:"[^"]*"|\w+:[^\s"]+|"[^"]+"|\S+/g) || [];

  for (let token of tokens) {
    let key = pref.userDefinedSearchScope?.trim() || pref.prefSearchScope;
    let value = token;

    const colonIndex = token.indexOf(":");
    if (colonIndex > 0) {
      key = token.slice(0, colonIndex).toLowerCase();
      value = token.slice(colonIndex + 1);
    }

    // Remove surrounding quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    }

    pairs.push({ key, value: value.toLowerCase() });
  }

  const checkedPairs = checkPairsForValidity(pairs);
  console.log("Parsed search query:", checkedPairs);
  return { pairs: checkedPairs };
}

function checkPairsForValidity(pairs: { key: string; value: string }[]) {
  
  // Validate "logic" key
  let validLogicValue = pref.prefLogicMode;
  const logicPairs = pairs.filter(p => p.key === reservedKeys[0]);
  const validLogic = [...logicPairs].reverse().find(p => validLogicValues.includes(p.value));
  if (validLogic) { validLogicValue = validLogic.value; }

  // Validate "sort" key
  let validSortValue = pref.prefSortOrder;
  let validSortValuesLocal = [];
  if( searchMode === validSearchModes[2]) { // Lunr search
    if (pref.prefLunrSearchOrder) {
      validSortValue = validSortValues[6]; // "s" for Lunr score
    }
    validSortValuesLocal = validSortValues;
  } else {
    validSortValuesLocal = validSortValues.slice(0, -1);
  }
  const sortPairs = pairs.filter(p => p.key === reservedKeys[1]);
  const validSort = [...sortPairs].reverse().find(p => validSortValuesLocal.includes(p.value));
  if(validSort) { validSortValue = validSort.value; }

  // Drop all original 'sort' and 'logic' keys
  pairs = pairs.filter(p => !reservedKeys.includes(p.key));
  
  if (validLogicValue) {
    pairs.push({
      key: reservedKeys[0],
      value: validLogicValue
    });
  }
  if (validSortValue) {
    pairs.push({
      key: reservedKeys[1],
      value: validSortValue
    });
  }

  return pairs;
}

// getSearchKeysFromFlags is now deprecated and not used; key scoping is handled by terms' key:value pairs.

function sortNotes(notes: Note[], pairs: { key: string; value: string }[]): Note[] {
  const sortPair = pairs.find(p => p.key === reservedKeys[1]);
  const sortValue = sortPair?.value || pref.prefSortOrder;

  switch (sortValue) {
    case validSortValues[0]: // "az"
      return notes.sort((a, b) => a.title.localeCompare(b.title));
    case validSortValues[1]: // "za"  
      return notes.sort((a, b) => b.title.localeCompare(a.title));
    case validSortValues[2]: // "mn"
      return notes.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    case validSortValues[3]: // "mo"
      return notes.sort((a, b) => new Date(a.modified).getTime() - new Date(b.modified).getTime());
    case validSortValues[4]: // "cn"
      return notes.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
    case validSortValues[5]: // "co"
      return notes.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
    case validSortValues[6]: // "s" (Lunr score)
    default:
      return notes;
  }

}

function getLogic(pairs: { key: string; value: string }[]): string {
  const logicPair = pairs.find(p => p.key === reservedKeys[0]);
  const logicValue = logicPair?.value || pref.prefLogicMode; 

  return logicValue;
}

function combineMatches(notes: Note[], matchingSets: Set<Note>[], pairs: { key: string; value: string }[]): Note[] {
  if (getLogic(pairs) === validLogicValues[1]) {
    // OR logic
    return notes.filter(note => matchingSets.some(set => set.has(note)));
  } else {
    // AND logic
    return notes.filter(note => matchingSets.every(set => set.has(note)));
  }
}