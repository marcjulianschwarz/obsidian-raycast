// This service is used to cache note metadata and make it reusable between
// commands of this extension. This means running a command will set the cache
// and the next command run can reuse the previously cached data.

import { Cache } from "@raycast/api";
import { BYTES_PER_MEGABYTE } from "../../utils/constants";
import { Logger } from "../logger/logger.service";
import { Note } from "../vault/notes/notes.types";
import { Vault } from "../vault/vault.types";

const logger = new Logger("Cache");
const cache = new Cache({ capacity: BYTES_PER_MEGABYTE * 100 }); // 100MB for metadata only

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CachedNotesData {
  lastCached: number;
  notes: Note[];
}

export function setNotesInCache(vault: Vault, notes: Note[]): void {
  const data: CachedNotesData = {
    lastCached: Date.now(),
    notes,
  };
  try {
    cache.set(vault.name, JSON.stringify(data));
    logger.info(`Cached ${notes.length} notes for vault ${vault.name}`);
  } catch (error) {
    logger.error(`Failed to cache notes. Error: ${error}`);
  }
}

/**
 * Gets notes from cache if available and not stale.
 */
export function getNotesFromCache(vault: Vault): Note[] | null {
  if (!cache.has(vault.name)) {
    logger.info(`No cache for vault ${vault.name}`);
    return null;
  }

  try {
    const cached = cache.get(vault.name);
    if (!cached) return null;

    const data: CachedNotesData = JSON.parse(cached);

    // Check if stale
    if (Date.now() - data.lastCached > CACHE_TTL) {
      logger.info(`Cache stale for vault ${vault.name}`);
      return null;
    }

    logger.info(`Using cached notes for vault ${vault.name}`);
    return data.notes;
  } catch (error) {
    logger.error(`Failed to parse cached notes. Error: ${error}`);
    return null;
  }
}

/**
 * Invalidates the cache for a given vault.
 */
export function invalidateNotesCache(vault: Vault): void {
  cache.remove(vault.name);
  logger.info(`Invalidated cache for vault ${vault.name}`);
}

/**
 * Updates a single note in the cache.
 */
export function updateNoteInCache(vault: Vault, notePath: string, updates: Partial<Note>): void {
  const cached = getNotesFromCache(vault);
  if (!cached) {
    logger.info(`No cache to update for vault ${vault.name}`);
    return;
  }

  const updatedNotes = cached.map((note) => (note.path === notePath ? { ...note, ...updates } : note));

  setNotesInCache(vault, updatedNotes);
  logger.info(`Updated note ${notePath} in cache`);
}

/**
 * Deletes a note from the cache.
 */
export function deleteNoteFromCache(vault: Vault, notePath: string): void {
  const cached = getNotesFromCache(vault);
  if (!cached) {
    logger.info(`No cache to delete from for vault ${vault.name}`);
    return;
  }

  const filteredNotes = cached.filter((note) => note.path !== notePath);

  setNotesInCache(vault, filteredNotes);
  logger.info(`Deleted note ${notePath} from cache`);
}

/**
 * Clears all cache entries.
 */
export function clearCache(): void {
  cache.clear();
  logger.info("Cleared all cache");
}
