import { getPreferenceValues, Icon } from "@raycast/api";
import * as fs from "fs";
import * as fsAsync from "fs/promises";
import * as path from "path";
import { homedir } from "os";
import { AUDIO_FILE_EXTENSIONS, LATEX_INLINE_REGEX, LATEX_REGEX, VIDEO_FILE_EXTENSIONS } from "../../utils/constants";
import { Media } from "../../utils/interfaces";
import { GlobalPreferences, SearchNotePreferences } from "../../utils/preferences";
import { ObsidianJSON, Vault } from "./vault.types";
import { getFilePaths } from "../file/file.service";
import { Logger } from "../logger/logger.service";
import { Note } from "./notes/notes.types";
import { getBookmarkedNotePaths } from "./notes/bookmarks/bookmarks.service";
import { parseExcludedFoldersPreferences } from "../preferences/preferences.service";

const logger: Logger = new Logger("Vaults");

export function getVaultNameFromPath(vaultPath: string): string | undefined {
  if (vaultPath === "") {
    return undefined;
  }
  return path.basename(vaultPath);
}

export function getExistingVaultsFromPreferences(): Vault[] {
  const pref: GlobalPreferences = getPreferenceValues();
  const vaultString = pref.vaultPath;

  return vaultString
    .split(",")
    .filter((vaultPath) => vaultPath.trim() !== "")
    .filter((vaultPath) => fs.existsSync(vaultPath))
    .map((vault) => ({
      name: getVaultNameFromPath(vault.trim()) ?? "invalid vault name",
      key: vault.trim(),
      path: vault.trim(),
    }));
}

export async function getVaultsFromObsidianJSON(): Promise<Vault[]> {
  const obsidianJsonPath = path.resolve(`${homedir()}/Library/Application Support/obsidian/obsidian.json`);
  try {
    const obsidianJson = JSON.parse(await fsAsync.readFile(obsidianJsonPath, "utf8")) as ObsidianJSON;
    return Object.values(obsidianJson.vaults).map(({ path }) => ({
      name: getVaultNameFromPath(path) ?? "invalid vault name",
      key: path,
      path,
    }));
  } catch (e) {
    return [];
  }
}

/** Gets a list of folders that are ignored by the user inside of Obsidian */
function getExcludedFoldersFromObsidian(vault: Vault): string[] {
  const { configFileName } = getPreferenceValues<GlobalPreferences>();
  const appJSONPath = `${vault.path}/${configFileName || ".obsidian"}/app.json`;
  if (!fs.existsSync(appJSONPath)) {
    return [];
  } else {
    const appJSON = JSON.parse(fs.readFileSync(appJSONPath, "utf-8"));
    return appJSON["userIgnoreFilters"] || [];
  }
}

/** Returns a list of file paths for all notes inside of the given vault, filtered by Raycast and Obsidian exclusions. */
export async function getMarkdownFilePathsFromVault(vault: Vault): Promise<string[]> {
  const { configFileName } = getPreferenceValues();
  const pref = getPreferenceValues<SearchNotePreferences>();
  const excludedFolders = parseExcludedFoldersPreferences(pref.excludedFolders);
  const userIgnoredFolders = getExcludedFoldersFromObsidian(vault);
  excludedFolders.push(...userIgnoredFolders, configFileName);
  const files = await getFilePaths({
    path: vault.path,
    excludedFolders,
    includedFileExtensions: [".md"],
  });
  logger.info(`${files.length} markdown files in ${vault.name}.`);
  return files;
}

/** Returns a list of file paths for all canvases inside of the given vault, filtered by Raycast and Obsidian exclusions. */
export async function getCanvasFilePathsFromVault(vault: Vault): Promise<string[]> {
  const { configFileName } = getPreferenceValues();
  const pref = getPreferenceValues<SearchNotePreferences>();
  const excludedFolders = parseExcludedFoldersPreferences(pref.excludedFolders);
  const userIgnoredFolders = getExcludedFoldersFromObsidian(vault);
  excludedFolders.push(...userIgnoredFolders, configFileName);
  const files = await getFilePaths({
    path: vault.path,
    excludedFolders,
    includedFileExtensions: [".canvas"],
  });
  logger.info(`${files.length} canvas files in ${vault.name}.`);
  return files;
}

export function filterContent(content: string) {
  const pref: GlobalPreferences = getPreferenceValues();

  if (pref.removeYAML) {
    const yamlHeader = content.match(/---(.|\n)*?---/gm);
    if (yamlHeader) {
      content = content.replace(yamlHeader[0], "");
    }
  }
  if (pref.removeLatex) {
    const latex = content.matchAll(LATEX_REGEX);
    for (const match of latex) {
      content = content.replace(match[0], "");
    }
    const latexInline = content.matchAll(LATEX_INLINE_REGEX);
    for (const match of latexInline) {
      content = content.replace(match[0], "");
    }
  }
  if (pref.removeLinks) {
    content = content.replaceAll("![[", "");
    content = content.replaceAll("[[", "");
    content = content.replaceAll("]]", "");
  }
  return content;
}

export async function getNoteFileContent(path: string, filter = false) {
  const content = await fsAsync.readFile(path, { encoding: "utf-8" });
  logger.debug(`Load file content for ${path}`);
  return filter ? filterContent(content) : content;
}

/** Gets a list of file paths for all media. */
async function getMediaFilePaths(vault: Vault) {
  const { configFileName } = getPreferenceValues();
  const pref = getPreferenceValues<SearchNotePreferences>();
  const excludedFolders = parseExcludedFoldersPreferences(pref.excludedFolders);
  const userIgnoredFolders = getExcludedFoldersFromObsidian(vault);
  excludedFolders.push(...userIgnoredFolders, configFileName);

  const files = await getFilePaths({
    path: vault.path,
    excludedFolders,
    includedFileExtensions: [
      ...AUDIO_FILE_EXTENSIONS,
      ...VIDEO_FILE_EXTENSIONS,
      ".jpg",
      ".png",
      ".gif",
      ".mp4",
      ".pdf",
    ],
  });
  return files;
}

/** Gets media (images, pdfs, video, audio, etc.) for a given vault from disk. utils.useMedia() is the preferred way of loading media. */
export async function getMedia(vault: Vault): Promise<Media[]> {
  const medias: Media[] = [];
  const filePaths = await getMediaFilePaths(vault);

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

export async function getNotes(vault: Vault): Promise<Note[]> {
  const filePaths = await getMarkdownFilePathsFromVault(vault);
  const bookmarkedFilePaths = getBookmarkedNotePaths(vault);
  const notes: Note[] = [];

  for (const filePath of filePaths) {
    const title = path.basename(filePath, path.extname(filePath));
    const relativePath = path.relative(vault.path, filePath);

    notes.push({
      title: title,
      path: filePath,
      lastModified: fs.statSync(filePath).mtime,
      bookmarked: bookmarkedFilePaths.includes(relativePath),
    });
  }

  // Add canvas files in a second pass. Canvas specific changes can be made here
  const canvasFilePaths = await getCanvasFilePathsFromVault(vault);
  for (const canvasFilePath of canvasFilePaths) {
    const title = path.basename(canvasFilePath, path.extname(canvasFilePath));
    const relativePath = path.relative(vault.path, canvasFilePath);

    notes.push({
      title: title,
      path: canvasFilePath,
      lastModified: fs.statSync(canvasFilePath).mtime,
      bookmarked: bookmarkedFilePaths.includes(relativePath),
    });
  }

  return notes;
}
