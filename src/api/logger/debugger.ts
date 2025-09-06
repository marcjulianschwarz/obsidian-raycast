import { Logger } from "./logger.service";

/**
 * Central switches for debug scopes.
 * Flip these on/off or expose setters to toggle at runtime.
 */
// Example:
//   const dbgParse = createDebugger("parse");
//   dbgParse("tokens parsed", toks);
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
 * Create a scoped debugger that is gated by a flag.
 *
 * Usage:
 *   const dbgParse = createDebugger("parse");
 *   dbgParse("tokens parsed", toks);
 *
 * The logger will format the line with the scope included internally.
 */
export function createDebugger<
  K extends keyof typeof DEBUG_FLAGS
>(flag: K) {
  const logger = new Logger(flag as string);
  return (...args: unknown[]) => {
    if (!DEBUG_FLAGS[flag]) return;

    // Join all arguments into a single string since Logger.debug takes one arg
    const message = args
      .map((a) => (typeof a === "string" ? a : j(a, 0)))
      .join(" ");

    logger.debug(message);
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
export const dbgLexer = createDebugger("lexer");
export const dbgParse = createDebugger("parse");
export const dbgEval = createDebugger("eval");
export const dbgSearch = createDebugger("search");
export const dbgYaml = createDebugger("yaml");
export const dbgLoadNotes = createDebugger("loadNotes");
export const dbgExcludeNotes = createDebugger("excludeNotes");
export const dbgCNF = createDebugger("createNoteForm");
export const dbgNS = createDebugger("notesService");