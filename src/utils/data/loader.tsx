import { getPreferenceValues, Icon } from "@raycast/api";
import * as fs from "fs";
import path from "path";
import { performance } from "perf_hooks";

import { AUDIO_FILE_EXTENSIONS, VIDEO_FILE_EXTENSIONS } from "../constants";
import { Media, Note, Vault } from "../interfaces";
import { GlobalPreferences, SearchNotePreferences } from "../preferences";
import { getBookmarkedNotePaths, getNoteFileContent } from "../utils";
import { tagsForString } from "../yaml";

/**
 * Checks if a path should be excluded based on exclusion rules
 */
function isPathExcluded(pathToCheck: string, excludedPaths: string[]) {
  const normalizedPath = path.normalize(pathToCheck);

  return excludedPaths.some((excluded) => {
    if (!excluded) return false;

    const normalizedExcluded = path.normalize(excluded);

    // Check if the path is exactly the excluded path or is a subfolder
    return normalizedPath === normalizedExcluded || normalizedPath.startsWith(normalizedExcluded + path.sep);
  });
}

const DEFAULT_EXCLUDED_PATHS = [".git", ".obsidian", ".trash", ".excalidraw", ".mobile"];

function walkFilesHelper(pathToWalk: string, excludedFolders: string[], fileEndings: string[], resultFiles: string[]) {
  const files = fs.readdirSync(pathToWalk);
  const { configFileName } = getPreferenceValues();
  const defaultExcludedPaths = DEFAULT_EXCLUDED_PATHS;
  if (configFileName) {
    defaultExcludedPaths.push(configFileName);
  }

  for (const file of files) {
    const fullPath = path.join(pathToWalk, file);
    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      if (defaultExcludedPaths.includes(file)) continue;
      if (isPathExcluded(fullPath, excludedFolders)) continue;
      // Recursively process subdirectory
      walkFilesHelper(fullPath, excludedFolders, fileEndings, resultFiles);
    } else {
      const extension = path.extname(file);
      if (
        fileEndings.includes(extension) &&
        file !== ".md" &&
        !file.includes(".excalidraw") &&
        !isPathExcluded(pathToWalk, [".obsidian", configFileName]) &&
        !isPathExcluded(pathToWalk, excludedFolders)
      ) {
        resultFiles.push(fullPath);
      }
    }
  }

  return resultFiles;
}

/** Gets a list of folders that are marked as excluded inside of the Raycast preferences */
function getExcludedFolders(): string[] {
  const preferences = getPreferenceValues<SearchNotePreferences>();
  const foldersString = preferences.excludedFolders;
  if (!foldersString) return [];

  const folders = foldersString.split(",").map((folder) => folder.trim());
  return folders;
}

/** Returns a list of file paths for all notes. */
function getFilePaths(vault: Vault): string[] {
  const excludedFolders = getExcludedFolders();
  const userIgnoredFolders = getUserIgnoreFilters(vault);
  excludedFolders.push(...userIgnoredFolders);
  const files = walkFilesHelper(vault.path, excludedFolders, [".md"], []);
  return files;
}

/** Gets a list of folders that are ignored by the user inside of Obsidian */
function getUserIgnoreFilters(vault: Vault): string[] {
  const { configFileName } = getPreferenceValues<GlobalPreferences>();
  const appJSONPath = `${vault.path}/${configFileName || ".obsidian"}/app.json`;
  if (!fs.existsSync(appJSONPath)) {
    return [];
  } else {
    const appJSON = JSON.parse(fs.readFileSync(appJSONPath, "utf-8"));
    return appJSON["userIgnoreFilters"] || [];
  }
}

/** Reads a list of notes from the vault path */
export function loadNotes(vault: Vault): Note[] {
  console.log("Loading Notes for vault: " + vault.path);
  const start = performance.now();

  const notes: Note[] = [];
  const filePaths = getFilePaths(vault);
  const bookmarkedFilePaths = getBookmarkedNotePaths(vault);

  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    const title = fileName.replace(/\.md$/, "") || "default";
    const content = getNoteFileContent(filePath, false);
    const relativePath = path.relative(vault.path, filePath);

    const note: Note = {
      title,
      path: filePath,
      lastModified: fs.statSync(filePath).mtime,
      tags: tagsForString(content),
      content,
      bookmarked: bookmarkedFilePaths.includes(relativePath),
    };

    notes.push(note);
  }

  const end = performance.now();
  console.log(`Finished loading ${notes.length} notes in ${end - start} ms.`);

  return notes.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}

/** Gets a list of file paths for all media. */
function getMediaFilePaths(vault: Vault) {
  const excludedFolders = getExcludedFolders();
  const files = walkFilesHelper(
    vault.path,
    excludedFolders,
    [...AUDIO_FILE_EXTENSIONS, ...VIDEO_FILE_EXTENSIONS, ".jpg", ".png", ".gif", ".mp4", ".pdf"],
    []
  );
  return files;
}

/** Loads media (images, pdfs, video, audio, etc.) for a given vault from disk. utils.useMedia() is the preferred way of loading media. */
export function loadMedia(vault: Vault): Media[] {
  const medias: Media[] = [];
  const filePaths = getMediaFilePaths(vault);

  for (const filePath of filePaths) {
    const title = path.basename(filePath);
    const icon = getIconFor(filePath);

    const media: Media = {
      title,
      path: filePath,
      icon: icon,
    };
    medias.push(media);
  }
  return medias;
}

/** Gets the icon for a given file path. This is used to determine the icon for a media item where the media itself can't be displayed (e.g. video, audio). */
function getIconFor(filePath: string) {
  const fileExtension = path.extname(filePath);
  if (VIDEO_FILE_EXTENSIONS.includes(fileExtension)) {
    return { source: Icon.Video };
  } else if (AUDIO_FILE_EXTENSIONS.includes(fileExtension)) {
    return { source: Icon.Microphone };
  }
  return { source: filePath };
}
