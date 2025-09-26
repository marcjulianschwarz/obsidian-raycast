import { getPreferenceValues, showToast, Toast } from "@raycast/api";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { NoteReducerAction } from "./reducers";
import { MediaState } from "./interfaces";
import { sortByAlphabet } from "./utils";
import fs from "fs";
import { ObsidianVaultsState, Vault } from "../api/vault/vault.types";
import { Note } from "../api/vault/notes/notes.types";
import {
  getMedia,
  getVaultsFromObsidianJSON,
  getExistingVaultsFromPreferences,
  getNotes,
  getNoteFileContent,
} from "../api/vault/vault.service";
import { Logger } from "../api/logger/logger.service";

const logger = new Logger("Hooks");

export const NotesDispatchContext = createContext((() => {}) as (action: NoteReducerAction) => void);

export function useNotes(vault: Vault, bookmarked = false) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  // only load notes when vault path is different
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const loadedNotes = await getNotes(vault);
        // await new Promise((resolve) => setTimeout(resolve, 5000));
        if (!cancelled) setNotes(loadedNotes);
      } catch {
        console.log("error in useNotes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [vault.path]);

  const filtered = useMemo(() => (bookmarked ? notes.filter((n) => n.bookmarked) : notes), [notes, bookmarked]);
  return { notes: filtered, loading } as const;
}

export const NotesContext = createContext([] as Note[]);

export function useNotesContext() {
  return useContext(NotesContext);
}

export function useNotesDispatchContext() {
  return useContext(NotesDispatchContext);
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
  const [state, setState] = useState<ObsidianVaultsState>(
    pref.vaultPath
      ? {
          ready: true,
          vaults: getExistingVaultsFromPreferences(),
        }
      : { ready: false, vaults: [] }
  );

  logger.info("useObsidianVaults hook called");

  useEffect(() => {
    if (!state.ready) {
      getVaultsFromObsidianJSON()
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
