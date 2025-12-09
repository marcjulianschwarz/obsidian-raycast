import { deleteNoteFromCache, updateNoteInCache } from "../api/cache/cache.service";
import { Logger } from "../api/logger/logger.service";
import { bookmarkNote, unbookmarkNote } from "../api/vault/notes/bookmarks/bookmarks.service";
import { deleteNote } from "../api/vault/notes/notes.service";
import { Note } from "../api/vault/notes/notes.types";
import { Vault } from "../api/vault/vault.types";

const logger = new Logger("NotesReducer");

export enum NoteReducerActionType {
  Set,
  Delete,
  Bookmark,
  Unbookmark,
  Update,
  Add,
}

export type NoteReducerAction =
  | {
      type: NoteReducerActionType.Set;
      payload: Note[];
    }
  | {
      type: NoteReducerActionType.Delete;
      payload: {
        note: Note;
        vault: Vault;
      };
    }
  | {
      type: NoteReducerActionType.Bookmark;
      payload: {
        note: Note;
        vault: Vault;
      };
    }
  | {
      type: NoteReducerActionType.Unbookmark;
      payload: {
        note: Note;
        vault: Vault;
      };
    }
  | {
      type: NoteReducerActionType.Update;
      payload: {
        note: Note;
        vault: Vault;
      };
    }
  | {
      type: NoteReducerActionType.Add;
      payload: {
        note: Note;
        vault: Vault;
      };
    };

export function NoteReducer(notes: Note[], action: NoteReducerAction) {
  logger.debug(action.type);

  switch (action.type) {
    case NoteReducerActionType.Set: {
      return action.payload;
    }

    case NoteReducerActionType.Delete: {
      const filteredNotes = notes.filter((note) => note.path !== action.payload.note.path);

      deleteNote(action.payload.note);
      deleteNoteFromCache(action.payload.vault, action.payload.note);

      return filteredNotes;
    }

    case NoteReducerActionType.Bookmark: {
      bookmarkNote(action.payload.vault, action.payload.note);
      return notes.map((note) => {
        if (note.path === action.payload.note.path) {
          note.bookmarked = true;
          updateNoteInCache(action.payload.vault, note);
        }
        return note;
      });
    }
    case NoteReducerActionType.Unbookmark: {
      unbookmarkNote(action.payload.vault, action.payload.note);
      return notes.map((note) => {
        if (note.path === action.payload.note.path) {
          note.bookmarked = false;
          updateNoteInCache(action.payload.vault, note);
        }
        return note;
      });
    }

    case NoteReducerActionType.Update: {
      // const newContent = getNoteFileContent(action.payload.note.path);
      // console.log(newContent);
      // action.payload.note.content = newContent;
      // const newTags = tagsForNotes([action.payload.note]);
      // action.payload.note.tags = newTags;
      // updateNoteInCache(action.payload.vault, action.payload.note);
      // return notes.map((note) => {
      //   if (note.path === action.payload.note.path) {
      //     return action.payload.note;
      //   }
      //   return note;
      // });
      return notes;
    }
    case NoteReducerActionType.Add: {
      updateNoteInCache(action.payload.vault, action.payload.note);
      return [...notes, action.payload.note];
    }
    default: {
      return notes;
    }
  }
}
