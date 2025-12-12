import { bookmarkNote, unbookmarkNote } from "./bookmarks";
import { createProperties, Note, writeMarkdown } from "./notes";
import {
  getVaultsFromPreferences,
  getVaultsFromObsidianJson,
  getVaultsFromPreferencesOrObsidianJson,
  ObsidianTarget,
  getObsidianTarget,
} from "./obsidian";
import { readCommunityPlugins, readCorePlugins, VaultPluginCheckParams, vaultPluginCheck } from "./plugins";
import {
  getNoteFileContent,
  getNotes,
  getMedia,
  getExcludedFolders,
  getMarkdownFilePaths,
  getCanvasFilePaths,
} from "./vault";

export const Vault = {
  readMarkdown(path: string, filter?: (input: string) => string) {
    return getNoteFileContent(path, filter);
  },

  writeMarkdown(
    path: string,
    name: string,
    text: string,
    onDirectoryCreationFailed?: (filePath: string) => void,
    onFileWriteFailed?: (filePath: string, fileName: string) => void
  ) {
    writeMarkdown(path, name, text, onDirectoryCreationFailed, onFileWriteFailed);
  },

  readCommunityPlugins(path: string) {
    return readCommunityPlugins(path);
  },

  readCorePlugins(path: string) {
    return readCorePlugins(path);
  },

  checkPlugins(params: VaultPluginCheckParams) {
    return vaultPluginCheck(params);
  },

  getExcludedFolders(path: string, configFileName: string) {
    return getExcludedFolders(path, configFileName);
  },

  getMarkdownFilePaths(path: string, configFileName: string, excludedFolders: string[]) {
    return getMarkdownFilePaths(path, configFileName, excludedFolders);
  },

  getCanvasFilePaths(path: string, configFileName: string, excludedFolders: string[]) {
    return getCanvasFilePaths(path, configFileName, excludedFolders);
  },

  getNotes(path: string, configFileName: string, excludedFolders: string[]) {
    return getNotes(path, configFileName, excludedFolders);
  },

  getMedia(path: string, configFileName: string, excludedFolders: string[]) {
    return getMedia(path, configFileName, excludedFolders);
  },

  getNote(path: string, filter?: (input: string) => string) {
    return getNoteFileContent(path, filter);
  },

  bookmarkNote(path: string, note: Note, configFileName: string) {
    bookmarkNote(path, note, configFileName);
  },

  unbookmarkNote(path: string, note: Note, configFileName: string) {
    unbookmarkNote(path, note, configFileName);
  },
};

/**
 * This is a pure Obsidian API. It should not be responsible for any Raycast specific functions.
 */
export const Obsidian = {
  getVaultsFromPreferences() {
    return getVaultsFromPreferences();
  },

  getVaultsFromObsidianJson() {
    return getVaultsFromObsidianJson();
  },

  getVaultsFromPreferencesOrObsidianJson() {
    return getVaultsFromPreferencesOrObsidianJson();
  },

  getTarget(target: ObsidianTarget) {
    return getObsidianTarget(target);
  },
};

export const ObsidianUtils = {
  createProperties(tags: string[]) {
    createProperties(tags);
  },
};
