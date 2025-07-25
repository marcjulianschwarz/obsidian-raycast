import { Media } from "./interfaces";
import Fuse from "fuse.js";
import { Note } from "../api/vault/notes/notes.types";
import { LunrSearchManager } from "./lunrsearch";
 
export function searchFunction(notes: Note[], input: string, byContent: boolean, fuzzySearch: boolean): Note[] {
  const isLunrSearch = input.startsWith(">");
  const isFuzzy = input.startsWith("~");

  if (isLunrSearch || isFuzzy) {
    input = input.slice(1).trim();
  }
  
  const { pairs } = parseSearchQuery(input);

  let results: Note[] = [];

  if (isLunrSearch) {
    results = searchFunctionLunr(notes, pairs);
  } else if (isFuzzy) {
    results = filterNotesFuzzy(notes, pairs);
  } else {
    results = filterNotes(notes, pairs);
  }

  return results;
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
    if (key === "sort" || key === "logic") continue;
    const term = value.toLowerCase();

    const matched = notes.filter((note) => {
      if (key === "default") {
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
    if (key === "sort" || key === "logic") continue;
    let fuseKeys: string[];

    switch (key) {
      case "default":
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

// https://lunrjs.com/guides/searching.html
// Lunr search is applied to any fileds when no specific field is specified
export function searchFunctionLunr(notes: Note[], pairs: { key: string; value: string }[]) {
  const input = pairs
    .filter(({ key }) => !["sort", "logic", "content", "full"].includes(key))
    .flatMap(({ key, value }) => {
      const escaped = value.replace(/-/g, "\\-");
      return key === "default"
        ? [`title:${escaped}`, `aliases:${escaped}`]
        : [`${key}:${escaped}`];
    })
    .join(" ");

  const manager = new LunrSearchManager(notes);
  const index = manager['index'];
  // console.log(index);

  const results = safeSearch(index, input);
  
  const mappedResults = results
    .map((r) => notes.find((n) => n.path === r.ref)!).filter(Boolean);

  return sortNotes(mappedResults, pairs);
}

function safeSearch(index: lunr.Index, input: string): lunr.Index.Result[] {
  try {
    console.log("Lunr search input:", input);
    return index.search(input);
  } catch (e: any) {
    if (e.name === "QueryParseError") return [];
    throw e;
  }
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
    let key = "default";
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

  console.log("Parsed search query:", pairs);
  return { pairs };
}

// getSearchKeysFromFlags is now deprecated and not used; key scoping is handled by terms' key:value pairs.

function sortNotes(notes: Note[], pairs: { key: string; value: string }[]): Note[] {
  const sortPair = pairs.find(p => p.key === "sort");
  const sortValue = sortPair?.value;

  switch (sortValue) {
    case "score" :
      return notes;
    case "cno":
      return notes.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
    case "con":
      return notes.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
    case "mno":
      return notes.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    case "mon":
      return notes.sort((a, b) => new Date(a.modified).getTime() - new Date(b.modified).getTime());
    case "az":
      return notes.sort((a, b) => a.title.localeCompare(b.title));
    case "za":
    default:
      return notes.sort((a, b) => b.title.localeCompare(a.title));
  }
}

function getSetLogic(pairs: { key: string; value: string }[]): boolean {
  const logicPair = pairs.find(p => p.key === "logic");

  if (logicPair?.value === "or") {
    return true;
  }
  else { 
    return false;
  }

}

function combineMatches(notes: Note[], matchingSets: Set<Note>[], pairs: { key: string; value: string }[]): Note[] {
  if (getSetLogic(pairs)) {
    // OR logic
    return notes.filter(note => matchingSets.some(set => set.has(note)));
  } else {
    // AND logic
    return notes.filter(note => matchingSets.every(set => set.has(note)));
  }
}