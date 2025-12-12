import fs from "fs";
import Fuse from "fuse.js";
import { Logger } from "../logger/logger.service";
import { ObsidianUtils, Note } from "../../obsidian";

const logger = new Logger("ContentSearch");

const MIN_RESULTS = 50; // Stop content search after finding this many matches

/**
 * Memory-efficient content search
 * First filters by title/path, then only reads content for remaining files
 * Stops early once we have enough results
 *
 * Special syntax:
 * - "tag:abc" - searches for notes with tag #abc only
 * - "tag:abc hello world" - searches for "hello world" in notes with tag #abc
 */
export async function searchNotesWithContent(notes: Note[], query: string): Promise<Note[]> {
  if (!query.trim()) {
    return notes;
  }

  // Check if there's a tag filter in the query
  const tagSearchMatch = query.match(/tag:(\S+)/i);
  let filteredNotes = notes;
  let remainingQuery = query;

  // Step 0: Filter by tag if tag: prefix is present
  if (tagSearchMatch) {
    const tagQuery = tagSearchMatch[1].trim();
    logger.info(`Filtering by tag "${tagQuery}" first`);
    filteredNotes = await searchNotesByTag(notes, tagQuery);
    logger.info(`Found ${filteredNotes.length} notes with tag "${tagQuery}"`);

    // Remove the tag: part from the query for the content search
    remainingQuery = query.replace(/tag:\S+/gi, "").trim();

    // If there's no remaining query, just return the tag-filtered notes
    if (!remainingQuery) {
      return filteredNotes;
    }
  }

  logger.info(`Searching ${filteredNotes.length} notes with content for "${remainingQuery}"`);

  // Step 1: Quick filter by title/path first (no file I/O)
  const titlePathFuse = new Fuse(filteredNotes, {
    keys: ["title", "path"],
    threshold: 0.4,
    ignoreLocation: true,
  });

  const titlePathMatches = titlePathFuse.search(remainingQuery).map((r) => r.item);
  logger.info(`Found ${titlePathMatches.length} title/path matches`);

  // Step 2: Search remaining notes by content (read files one at a time)
  const contentMatches: Note[] = [];
  const queryLower = remainingQuery.toLowerCase();
  let filesChecked = 0;

  // Early exit if we already have enough matches from title/path
  if (titlePathMatches.length >= MIN_RESULTS) {
    logger.info(`Already have ${titlePathMatches.length} title/path matches, skipping content search`);
    return titlePathMatches;
  }

  for (const note of filteredNotes) {
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

/**
 * Memory-efficient tag search
 * Reads files one at a time and checks for tags
 */
async function searchNotesByTag(notes: Note[], tagQuery: string): Promise<Note[]> {
  logger.info(`Searching ${notes.length} notes for tag "${tagQuery}"`);

  const matches: Note[] = [];
  let filesChecked = 0;

  // Normalize tag query (add # if not present)
  const normalizedTag = tagQuery.startsWith("#") ? tagQuery.toLowerCase() : `#${tagQuery.toLowerCase()}`;

  for (const note of notes) {
    // Stop if we have enough results
    if (matches.length >= MIN_RESULTS) {
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

      // Extract tags from the file (both inline and YAML frontmatter)
      const tags = ObsidianUtils.getAllTags(content);

      // Check if any tag matches the query
      const hasMatchingTag = tags.some((tag) => tag.toLowerCase() === normalizedTag);

      if (hasMatchingTag) {
        matches.push(note);
      }
    } catch (error) {
      logger.debug(`Error reading ${note.path}: ${error}`);
    }
  }

  logger.info(`Found ${matches.length} notes with tag "${tagQuery}" (checked ${filesChecked} files)`);

  return matches;
}
