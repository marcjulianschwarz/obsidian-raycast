import { Media } from "../interfaces";
import { Note } from "../../api/vault/notes/notes.types";
import { SearchNotePreferences } from "../preferences";
import { getPreferenceValues } from "@raycast/api";
import { parseQuery } from "./parse";
import { evaluateQueryAST } from "./evaluate";
import { dbgSearch, j } from "../debugging/debug";

const pref = getPreferenceValues<SearchNotePreferences>();

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

  // TEMP DEBUG: Find and return a specific note for debugging
  // const foundNote = notes.find((n) => n.title === "<note_title>");
  // Logger.debug(true, "[search.tsx] Found specific note", foundNote);
  // return foundNote ? [foundNote] : [];

  // 2) Build docs: expose all note fields (custom props included) + stable id
  const docs = notes.map((n) => ({
    id: n.path,   // stable identifier for evaluator + mapping back
    ...n,         // exposes custom/frontmatter keys (e.g., index, status, locations, etc.)
  }));

  // TEMP DEBUG: inspect the specific note before evaluation
  // const TARGET = "<note_title>";
  // const sample = docs.find((d) => String(d.id).includes(TARGET));
  // dbgSearch("[search.tsx] target doc sample", sample ? {
  //   id: sample.id,
  //   title: sample.title,
  //   path: sample.path,
  //   tags: sample.tags,
  //   aliases: sample.aliases,
  // } : "NOT FOUND in docs");

  // 3) Evaluate (Fuse only kicks in for terms with ~; content is only used when the term targets it)
  //console.log("DOCS", JSON.stringify(docs.slice(0, 5), null, 2));
  const { hits } = evaluateQueryAST(ast, docs, {
    defaultFields: Array.isArray(pref.userDefinedSearchScope) && pref.userDefinedSearchScope.length
      ? (pref.userDefinedSearchScope as unknown as string[])
      : (typeof pref.userDefinedSearchScope === "string" && pref.userDefinedSearchScope.trim().length > 0)
        ? [pref.userDefinedSearchScope]
        : Array.isArray(pref.prefSearchScope)
          ? (pref.prefSearchScope as unknown as string[])
          : [pref.prefSearchScope || "title"],

    fieldMap: {
      // Aliases / reserved behavior
      file: (d: any) => d.title,
      anyname: (d: any) => [d.title, ...(d.aliases ?? [])],
      // Optional: keep tag mapping explicit; otherwise the spread already exposes d.tags
      tag: (d: any) => d.tags,
      // Heavy fields (Fuse will only touch when a fuzzy term targets these fields)
      full: (d: any) => [d.content, d.path].filter(Boolean),
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