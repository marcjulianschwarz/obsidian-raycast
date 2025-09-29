import { getPreferenceValues, Icon } from "@raycast/api";
import * as fs from "fs";
import * as fsAsync from "fs/promises";
import * as path from "path";
import { homedir } from "os";
import { AUDIO_FILE_EXTENSIONS, LATEX_INLINE_REGEX, LATEX_REGEX, VIDEO_FILE_EXTENSIONS } from "../../utils/constants";
import { Media } from "../../utils/interfaces";
import { GlobalPreferences, SearchNotePreferences, SearchMediaPreferences } from "../../utils/preferences";
import { ObsidianJSON, Vault } from "./vault.types";
import { getFilePaths } from "../file/file.service";
import { Logger } from "../logger/logger.service";
import { Note } from "./notes/notes.types";
import { getBookmarkedNotePaths } from "./notes/bookmarks/bookmarks.service";
import matter from "gray-matter";
import { buildFileFilters, isPathExcluded, splitPatterns } from "../file/patterns.service";
import { tagsForString } from "../../utils/yaml";

const logger: Logger = new Logger("Vaults");

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value];
  }
  return [];
}

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
  }
  const appJSON = JSON.parse(fs.readFileSync(appJSONPath, "utf-8"));
  return appJSON["userIgnoreFilters"] || [];
}

export function getUserIgnoreFilters(vault: Vault): string[] {
  return getExcludedFoldersFromObsidian(vault);
}

/** Returns a list of file paths for all notes inside of the given vault, filtered by Raycast and Obsidian exclusions. */
export async function getMarkdownFilePathsFromVault(vault: Vault): Promise<string[]> {
  const { configFileName } = getPreferenceValues();
  const pref = getPreferenceValues<SearchNotePreferences>();
  const userIgnoredFolders = getExcludedFoldersFromObsidian(vault);
  const filters = buildFileFilters(pref, {
    additionalExcludedFolders: [...userIgnoredFolders, configFileName],
  });
  const files = await getFilePaths({
    path: vault.path,
    excludedFolders: filters.excludedFolders,
    includedFileExtensions: [".md"],
    includedPatterns: filters.includedPatterns,
    excludedPatterns: filters.excludedPatterns,
  });
  logger.info(`${files.length} markdown files in ${vault.name}.`);
  return files;
}

/** Returns a list of file paths for all canvases inside of the given vault, filtered by Raycast and Obsidian exclusions. */
export async function getCanvasFilePathsFromVault(vault: Vault): Promise<string[]> {
  const { configFileName } = getPreferenceValues();
  const pref = getPreferenceValues<SearchNotePreferences>();
  const userIgnoredFolders = getExcludedFoldersFromObsidian(vault);
  const filters = buildFileFilters(pref, {
    additionalExcludedFolders: [...userIgnoredFolders, configFileName],
  });
  const files = await getFilePaths({
    path: vault.path,
    excludedFolders: filters.excludedFolders,
    includedFileExtensions: [".canvas"],
    includedPatterns: filters.includedPatterns,
    excludedPatterns: filters.excludedPatterns,
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
  const mediaPref = getPreferenceValues<SearchMediaPreferences>();
  const userIgnoredFolders = getExcludedFoldersFromObsidian(vault);
  const mediaExcludedPatterns = splitPatterns(mediaPref.excludedMedia);
  const filters = buildFileFilters(mediaPref, {
    additionalExcludedFolders: [...userIgnoredFolders, configFileName],
    additionalExcludedPatterns: mediaExcludedPatterns,
  });
  return getFilePaths({
    path: vault.path,
    excludedFolders: filters.excludedFolders,
    includedPatterns: filters.includedPatterns,
    excludedPatterns: filters.excludedPatterns,
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
}


/** Gets media (images, pdfs, video, audio, etc.) for a given vault from disk. utils.useMedia() is the preferred way of loading media. */
export async function getMedia(vault: Vault): Promise<Media[]> {
  logger.info("Loading Media Files");
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
  const bookmarkedFilePaths = new Set(getBookmarkedNotePaths(vault));
  const notes: Note[] = [];

  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    const title = fileName.replace(/\.md$/i, "") || "default";
    const relativePath = path.relative(vault.path, filePath);
    const content = await getNoteFileContent(filePath, false);
    const stat = await fsAsync.stat(filePath);

    const { data } = matter(content);
    const aliases = toStringArray((data as any)?.aliases);
    const locations = toStringArray((data as any)?.locations);
    const tagsFromYaml = toStringArray((data as any)?.tags);
    const tagsFromParser = tagsForString(content);
    const tags = Array.from(new Set([...tagsFromYaml, ...tagsFromParser]));

    const note: Note = {
      ...(data as Record<string, unknown>),
      title,
      path: filePath,
      content,
      created: stat.birthtime,
      modified: stat.mtime,
      lastModified: stat.mtime,
      tags,
      bookmarked: bookmarkedFilePaths.has(relativePath),
      aliases,
      locations,
    };

    notes.push(note);
  }

  const canvasFilePaths = await getCanvasFilePathsFromVault(vault);
  for (const canvasPath of canvasFilePaths) {
    const title = path.basename(canvasPath, path.extname(canvasPath));
    const relativePath = path.relative(vault.path, canvasPath);
    const stat = await fsAsync.stat(canvasPath);

    notes.push({
      title,
      path: canvasPath,
      content: "",
      created: stat.birthtime,
      modified: stat.mtime,
      lastModified: stat.mtime,
      tags: [],
      bookmarked: bookmarkedFilePaths.has(relativePath),
      aliases: [],
      locations: [],
    } as Note);
  }

  return notes;
}

// Backwards compatibility for existing modules/tests expecting loadNotes
export async function loadNotes(vault: Vault): Promise<Note[]> {
  return getNotes(vault);
}
