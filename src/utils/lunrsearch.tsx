import lunr from 'lunr';
import { SearchNotePreferences } from "./preferences";
import { getPreferenceValues } from "@raycast/api";

import { Note } from "../api/vault/notes/notes.types";

export class LunrSearchManager {
  private index: lunr.Index
  private notes: Note[]

  constructor(notes: Note[]) {
    this.notes = notes
    this.index = this.createIndex(notes)
  }

  public getLunrSearchManagerNotes(): Note[] {
    return this.notes;
  }

  private createIndex(notes: Note[]) {
    // Safely patch lunr warning system to avoid global.console crash
    // Force-patch lunr warning system to avoid global.console crash
    lunr.utils.warn = function (msg) {
      if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn(msg);
      }
    };
    
    // HINT:
    // IMPORTANT: lunr.tokenizer.separator = /[^\w\-]+/; // Seems to be the working solution
    // No memory overflow error, no hyphen splitting
    /*

    https://github.com/olivernn/lunr.js/issues/296

    The source above explains how to create a custom tokenizer that preserves hyphens in tokens.
    However, it is stil not working consistently.

    Exammple:

    > title:*Mac24-Main* // (- is rpelaced by \-)

    Nothing is found altough there ia a note with the title "13.50_Mac24-Main".

    */

    // Hyphenator pipeline function to handle hyphenated tokens
    // const hyphenator: lunr.PipelineFunction = function (token: lunr.Token): lunr.Token[] {
    //   const str = token.toString();

    //   // If the token doesn't contain a hyphen, return it as-is
    //   if (!str.includes("-")) return [token];

    //   // Split the token by hyphen and return clones of the individual parts
    //   // Example: "anti-virus" -> "anti", "virus"
    //   const parts = str.split("-");
    //   const splitTokens = parts.map(part =>
    //     token.clone(() => part)
    //   );

    //   // Create a version of the token with hyphens removed
    //   // Example: "anti-virus" -> "antivirus"
    //   const joined = token.clone(() => str.replace(/-/g, ""));

    //   // Keep the original token with the hyphen
    //   const original = token.clone();

    //   // Return all versions: parts, joined, and original
    //   return [...splitTokens, joined, original];

    //   return [original];> title:*Mac24\-Main*
    // };

    
    // IMPORTANT NOTE ON TOEKNIZATION:
    // Design decision: Only split tokens on actual whitespace characters.
    // Do not split on hyphens, underscores, or other symbols.
    // Always include the full original string as a token, even if it contains spaces.
    // Furthermore, spaces and hyphens are escaped (e.g., "\ ", "\-") automatically in search file
    // so Lunr parses them correctly.
    return lunr((builder: lunr.Builder) => {
      // Configure tokenizer to preserve Unicode letters, numbers, hyphens, underscores, and periods
      // This prevents splitting on characters like ö or hyphenated words like Mac24-Main
      lunr.tokenizer.separator = /[^\p{L}\p{N}\-._]+/u
    
      // Disable stemming, e.g testing !== test
      builder.pipeline.remove(lunr.stemmer);
      builder.searchPipeline.remove(lunr.stemmer);

      builder.ref("path");
    
      const pref = getPreferenceValues<SearchNotePreferences>();
      const yamlProps = pref.yamlProperties
      ? pref.yamlProperties.split(",").map(s => s.trim()).filter(Boolean)
      : [];

    
      const indexFields = Array.from(new Set([
        "aliases",
        "title",
        "path",
        "locations",
        "tags",
        // "content", // Needs to much memory
        ...yamlProps,
      ]));

      indexFields.forEach(field => builder.field(field));
      
      let prevField = "";
      notes.forEach(note => {
        const indexedNote: Record<string, string[]> = {
          path: [note.path],
        };
    
        indexFields.forEach(field => {
          const value = note[field];
          indexedNote[field] = value;
          if (Array.isArray(value)) {
            const extraTokens = value.flatMap(v => v.split(" "));
            indexedNote[field] = [...value,...extraTokens];
            if (field !== prevField) {
              // console.log(`Indexed field "${field}" for note "${note.title}": ${value}`);
              prevField = field; // Update title to avoid duplicate logging
            }

          }
          // Exclude the reference field. It must not be altered.
          if (field.toString() !== "path") {
            if (typeof value === "string") {
              indexedNote[field] = [value, ...value.split(" ")];
              // console.log(`Indexed field "${field}" for note "${note.title}": ${value}`);
            }
          }
        });
    
        builder.add(indexedNote);
      });
    });
  }

  public search(input: string): Note[] {
    if (!input.trim()) return this.notes

    try {
      const results = this.index.search(input)
      return results.map(r => this.notes.find(n => n.path === r.ref)!).filter(Boolean)
    } catch (err) {
      console.warn("Lunr parse error:", err)
      return []
    }
  }

  public updateNotes(notes: Note[]) {
    this.notes = notes
    this.index = this.createIndex(notes)
  }
}