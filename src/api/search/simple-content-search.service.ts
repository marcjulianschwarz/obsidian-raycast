import fs from "fs";
import Fuse from "fuse.js";
import { Note } from "../vault/notes/notes.types";
import { Logger } from "../logger/logger.service";

const logger = new Logger("ContentSearch");

const MIN_RESULTS = 50; // Stop content search after finding this many matches

/**
 * Memory-efficient content search
 * First filters by title/path, then only reads content for remaining files
 * Stops early once we have enough results
 */
export async function searchNotesWithContent(notes: Note[], query: string): Promise<Note[]> {
  if (!query.trim()) {
    return notes;
  }

  logger.info(`Searching ${notes.length} notes with content for "${query}"`);

  // Step 1: Quick filter by title/path first (no file I/O)
  const titlePathFuse = new Fuse(notes, {
    keys: ["title", "path"],
    threshold: 0.4,
    ignoreLocation: true,
  });

  const titlePathMatches = titlePathFuse.search(query).map((r) => r.item);
  logger.info(`Found ${titlePathMatches.length} title/path matches`);

  // Step 2: Search remaining notes by content (read files one at a time)
  const contentMatches: Note[] = [];
  const queryLower = query.toLowerCase();
  let filesChecked = 0;

  // Early exit if we already have enough matches from title/path
  if (titlePathMatches.length >= MIN_RESULTS) {
    logger.info(`Already have ${titlePathMatches.length} title/path matches, skipping content search`);
    return titlePathMatches;
  }

  for (const note of notes) {
    // Skip if already matched by title/path
    if (titlePathMatches.some((m) => m.path === note.path)) {
      continue;
    }

    // Stop if we have enough total results
    if (titlePathMatches.length + contentMatches.length >= MIN_RESULTS) {
      logger.info(`Reached ${MIN_RESULTS} results after checking ${filesChecked} files, stopping early`);
      break;
    }

    try {
      if (!fs.existsSync(note.path)) {
        continue;
      }

      filesChecked++;

      // Read file content
      const content = await fs.promises.readFile(note.path, "utf-8");
      const contentLower = content.toLowerCase();

      // Simple substring match for content
      if (contentLower.includes(queryLower)) {
        contentMatches.push(note);
      }
    } catch (error) {
      logger.debug(`Error reading ${note.path}: ${error}`);
    }
  }

  logger.info(
    `Found ${contentMatches.length} content matches in ${filesChecked} files (total: ${
      titlePathMatches.length + contentMatches.length
    })`
  );

  // Combine results: title/path matches first (more relevant), then content matches
  return [...titlePathMatches, ...contentMatches];
}
