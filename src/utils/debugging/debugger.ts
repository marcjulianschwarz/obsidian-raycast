import { createNote } from "../../api/vault/notes/notes.service";
import { Logger } from "./logger";

/**
 * Central switches for debug scopes.
 * Flip these on/off or expose setters to toggle at runtime.
 */
export const DEBUG_FLAGS = {
  lexer: false,
  parse: false,
  eval: false,
  search: false,
  yaml: false,
  custom: false,
  loadNotes: false,
  excludeNotes: false,
  createNoteForm: false,
  notesService: false,
};
export const targetNoteDebugActive = false; // for debugging a specific note during search

/**
 * Create a scoped debugger that prefixes messages and is gated by a flag.
 *
 * Usage:
 *   const dbgParse = createDebugger("parse", "[parse]");
 *   dbgParse("tokens", toks);
 */
export function createDebugger<
  K extends keyof typeof DEBUG_FLAGS
>(flag: K, prefix: string) {
  return (...args: any[]) => {
    Logger.debug(DEBUG_FLAGS[flag], prefix, ...args);
  };
}

/**
 * Change flags at runtime if needed.
 * Example: setDebugFlag("parse", false)
 */
export function setDebugFlag<K extends keyof typeof DEBUG_FLAGS>(
  flag: K,
  enabled: boolean,
) {
  DEBUG_FLAGS[flag] = enabled;
}

/**
 * Helper to pretty-print JSON safely.
 */
export function j(obj: unknown, space: number = 2) {
  try {
    return JSON.stringify(obj, null, space);
  } catch {
    return String(obj);
  }
}

/**
 * Convenience: create common scoped debuggers.
 */
export const dbgLexer = createDebugger("lexer", "[Lexer]");
export const dbgParse = createDebugger("parse", "[parse]");
export const dbgEval = createDebugger("eval", "[evaluate]");
export const dbgSearch = createDebugger("search", "[search]");
export const dbgYaml = createDebugger("yaml", "[yaml]");
export const dbgLoadNotes = createDebugger("loadNotes", "[loadNotes]");
export const dbgExcludeNotes = createDebugger("excludeNotes", "[excludeNotes]");
export const dbgCNF = createDebugger("createNoteForm", "[createNoteForm]");
export const dbgNS = createDebugger("notesService", "[notesService]");