import lunr from 'lunr';

import { Note } from "../api/vault/notes/notes.types";

export class LunrSearchManager {
  private index: lunr.Index
  private notes: Note[]

  constructor(notes: Note[]) {
    this.notes = notes
    this.index = this.createIndex(notes)
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



    return lunr((builder: lunr.Builder) => {
      // Register and add the hyphenator pipeline function before the stemmer
      // lunr.Pipeline.registerFunction(hyphenator, "hyphenator");
      // builder.pipeline.before(lunr.stemmer, hyphenator);
      // builder.searchPipeline.before(lunr.stemmer, hyphenator);

      // Use the default separator but exclude hyphen from splitting
      lunr.tokenizer.separator = /[^\w\-]+/;

      builder.ref("path");
      builder.field("title");
      builder.field("content");
      builder.field("aliases");
      builder.field("name");
    
      notes.forEach(note => {
        const title = note.title ?? "";
        const aliases = Array.isArray(note.aliases)
          ? note.aliases.join(" ")
          : (note.aliases ?? "");
        const name = `${title} ${aliases}`;

        // console.log(`Indexing:\n  title: ${title}\n  aliases: ${aliases}\n  name: ${name}`);
    
        builder.add({
          ...note,
          name,
        });
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