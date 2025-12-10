import { getPreferenceValues, showToast, Toast } from "@raycast/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MediaState } from "./interfaces";
import { sortByAlphabet } from "./utils";
import fs from "fs";
import { ObsidianVaultsState, Vault } from "../api/vault/vault.types";
import { Note } from "../api/vault/notes/notes.types";
import {
  getMedia,
  loadObsidianJson,
  getExistingVaultsFromPreferences,
  getNotesWithCache,
  getNoteFileContent,
} from "../api/vault/vault.service";
import { Logger } from "../api/logger/logger.service";
import { invalidateNotesCache } from "../api/cache/cache.service";

const logger = new Logger("Hooks");

export function useNotes(vault: Vault, bookmarked = false) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load notes with caching
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const loadedNotes = await getNotesWithCache(vault);
        if (!cancelled) setNotes(loadedNotes);
      } catch (error) {
        logger.error(`Error loading notes. ${error}`);
        if (!cancelled) setNotes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [vault.path, refreshKey]);

  // Refresh function to force reload
  const refresh = useCallback(() => {
    logger.info(`Refreshing notes for vault ${vault.name}`);
    invalidateNotesCache(vault);
    setRefreshKey((k) => k + 1);
  }, [vault]);

  // Update a single note in the list
  const updateNote = useCallback((notePath: string, updates: Partial<Note>) => {
    logger.info(`Updating note in list: ${notePath}`);
    setNotes((prev) => prev.map((note) => (note.path === notePath ? { ...note, ...updates } : note)));
  }, []);

  const filtered = useMemo(() => (bookmarked ? notes.filter((n) => n.bookmarked) : notes), [notes, bookmarked]);

  return { notes: filtered, loading, refresh, updateNote } as const;
}

export function useMedia(vault: Vault) {
  const [media, setMedia] = useState<MediaState>({
    ready: false,
    media: [],
  });

  useEffect(() => {
    async function fetch() {
      if (!media.ready) {
        try {
          await fs.promises.access(vault.path + "/.");

          const media = (await getMedia(vault)).sort((m1, m2) => sortByAlphabet(m1.title, m2.title));

          setMedia({ ready: true, media });
        } catch (error) {
          showToast({
            title: "The path set in preferences doesn't exist",
            message: "Please set a valid path in preferences",
            style: Toast.Style.Failure,
          });
        }
      }
    }
    fetch();
  }, []);

  return media;
}

export function useObsidianVaults(): ObsidianVaultsState {
  const pref = useMemo(() => getPreferenceValues(), []);
  const [state, setState] = useState<ObsidianVaultsState>(() => {
    // Lazy initializer - only runs once
    if (pref.vaultPath) {
      return {
        ready: true,
        vaults: getExistingVaultsFromPreferences(),
      };
    }
    return { ready: false, vaults: [] };
  });

  useEffect(() => {
    if (!pref.vaultPath) {
      loadObsidianJson()
        .then((vaults) => {
          setState({ vaults, ready: true });
        })
        .catch(() => setState({ vaults: getExistingVaultsFromPreferences(), ready: true }));
    }
  }, []);

  return state;
}

/** Reads the file content for a note if enabled is set to true and exposes a loading state */
export function useNoteContent(note: Note, options = { enabled: true }) {
  const [noteContent, setNoteContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!options.enabled) return;
    setIsLoading(true);
    getNoteFileContent(note.path)
      .then((content) => {
        setNoteContent(content);
      })
      .catch(() => {
        logger.debug("Failed to load note content.");
        setNoteContent(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [note, options.enabled]);
  return { noteContent, isLoading };
}
