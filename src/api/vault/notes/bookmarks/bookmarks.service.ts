import { getPreferenceValues } from "@raycast/api";
import { Vault } from "../../vault.types";
import { BookmarkEntry, BookmarkFile } from "./bookmarks.types";
import fs from "fs";
import { Note } from "../notes.types";

function* flattenBookmarks(BookmarkEntry: BookmarkEntry[]): Generator<BookmarkEntry> {
  for (const item of BookmarkEntry) {
    if (item.type === "file") yield item;
    if (item.type === "group" && item.items) yield* flattenBookmarks(item.items);
  }
}

function getBookmarkedJSON(vault: Vault): BookmarkEntry[] {
  const { configFileName } = getPreferenceValues();
  const bookmarkedNotesPath = `${vault.path}/${configFileName || ".obsidian"}/bookmarks.json`;
  if (!fs.existsSync(bookmarkedNotesPath)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(bookmarkedNotesPath, "utf-8"))?.items || [];
}

function getBookmarkedList(vault: Vault): BookmarkEntry[] {
  return Array.from(flattenBookmarks(getBookmarkedJSON(vault)));
}

function writeToBookmarkedJSON(vault: Vault, bookmarkedNotes: BookmarkEntry[]) {
  const { configFileName } = getPreferenceValues();
  const bookmarkedNotesPath = `${vault.path}/${configFileName || ".obsidian"}/bookmarks.json`;
  fs.writeFileSync(bookmarkedNotesPath, JSON.stringify({ items: bookmarkedNotes }));
}

export function getBookmarkedNotePaths(vault: Vault) {
  const bookmarkedNotes = getBookmarkedList(vault);
  return (bookmarkedNotes.filter((note) => note.type === "file") as BookmarkFile[]).map((note) => note.path);
}

export function bookmarkNote(vault: Vault, note: Note) {
  const bookmarkedNotes = getBookmarkedJSON(vault);
  const bookmarkedNote: BookmarkFile = {
    type: "file",
    title: note.title,
    path: note.path.split(vault.path)[1].slice(1),
  };
  bookmarkedNotes.push(bookmarkedNote);
  writeToBookmarkedJSON(vault, bookmarkedNotes);
}

export function unbookmarkNote(vault: Vault, note: Note) {
  const bookmarkedNotes = getBookmarkedJSON(vault);
  const notePath = note.path.split(vault.path)[1].slice(1);

  const removeBookmark = (items: BookmarkEntry[]) => {
    const index = items.findIndex((item) => item.type === "file" && item.path === notePath);
    if (index !== -1) {
      items.splice(index, 1);
    } else {
      for (const item of items) {
        if (item.type === "group" && item.items) {
          removeBookmark(item.items);
        }
      }
    }
  };
  removeBookmark(bookmarkedNotes);
  writeToBookmarkedJSON(vault, bookmarkedNotes);
}
