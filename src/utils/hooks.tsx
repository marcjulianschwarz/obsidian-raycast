import { showToast, Toast } from "@raycast/api";
import { createContext, useContext, useEffect, useState } from "react";
import { getNotesFromCache } from "./data/cache";
import { loadMedia } from "./data/loader";
import { NoteReducerAction } from "./data/reducers";
import { MediaState, Note, Vault } from "./interfaces";
import { sortByAlphabet } from "./utils";
import fs from "fs";

export const NotesContext = createContext([] as Note[]);
export const NotesDispatchContext = createContext((() => {}) as (action: NoteReducerAction) => void);

export function useNotes(vault: Vault, bookmarked = false) {
  /**
   * The preferred way of loading notes inside the extension
   *
   * @param vault - The Vault to get the notes from
   * @returns All notes in the cache for the vault
   */

  const notes_: Note[] = getNotesFromCache(vault);

  const [notes] = useState<Note[]>(notes_);
  console.log("Using Notes");
  if (bookmarked) {
    return [notes.filter((note: Note) => note.bookmarked)] as const;
  } else {
    return [notes] as const;
  }
}

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

          const media = loadMedia(vault).sort((m1, m2) => sortByAlphabet(m1.title, m2.title));

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
