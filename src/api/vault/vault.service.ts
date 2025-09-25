import { getPreferenceValues, Icon } from "@raycast/api";
import * as fs from "fs";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { default as fsPath, default as path } from "path";
import { performance } from "perf_hooks";
import { AUDIO_FILE_EXTENSIONS, LATEX_INLINE_REGEX, LATEX_REGEX, VIDEO_FILE_EXTENSIONS } from "../../utils/constants";
import { Media } from "../../utils/interfaces";
import { GlobalPreferences, SearchNotePreferences } from "../../utils/preferences";
import { tagsForString } from "../../utils/yaml";
import { getBookmarkedNotePaths } from "./notes/bookmarks/bookmarks.service";
import { Note } from "./notes/notes.types";
import { ObsidianJSON, Vault } from "./vault.types";
import matter from "gray-matter";
import { dbgLoadNotes, dbgExcludeNotes } from "../logger/debugger";
import { minimatch } from "minimatch";

// Ensure cross-platform glob matching by converting paths to POSIX style
function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function getVaultNameFromPath(vaultPath: string): string {
  const name = vaultPath
    .split(fsPath.sep)
    .filter((i) => {
      if (i != "") {
        return i;
      }
    })
    .pop();
  if (name) {
    return name;
  } else {
    return "Default Vault Name (check your path preferences)";
  }
}

export function parseVaults(): Vault[] {
  const pref: GlobalPreferences = getPreferenceValues();
  const vaultString = pref.vaultPath;
  return vaultString
    .split(",")
    .filter((vaultPath) => vaultPath.trim() !== "")
    .filter((vaultPath) => fs.existsSync(vaultPath))
    .map((vault) => ({ name: getVaultNameFromPath(vault.trim()), key: vault.trim(), path: vault.trim() }));
}

export async function loadObsidianJson(): Promise<Vault[]> {
  const obsidianJsonPath = fsPath.resolve(`${homedir()}/Library/Application Support/obsidian/obsidian.json`);
  try {
    const obsidianJson = JSON.parse(await readFile(obsidianJsonPath, "utf8")) as ObsidianJSON;
    return Object.values(obsidianJson.vaults).map(({ path }) => ({
      name: getVaultNameFromPath(path),
      key: path,
      path,
    }));
  } catch (e) {
    return [];
  }
}

/**
 * Checks if a path should be excluded based on glob-style patterns.
 * Patterns are matched against the path relative to the vault root.
 */
export function isPathExcluded(pathToCheck: string, excludedPaths: string[], vaultRoot: string) {
  const absPath = path.normalize(pathToCheck);
  const relPath = toPosix(path.relative(vaultRoot, absPath));

  return excludedPaths.some((pattern) => {
    if (!pattern) return false;
    // Strip leading './' or '/' from user-provided pattern
    const cleanPattern = pattern.replace(/^\/+/, '').replace(/^\.\/*/, '');
    if (cleanPattern === '') return false;

    return minimatch(relPath, cleanPattern, { dot: true });
  });
}

export const DEFAULT_EXCLUDED_PATHS = [".git", ".obsidian", ".trash", ".excalidraw", ".mobile"];

/**
 * Checks if a path should be included based on glob-style patterns.
 * Patterns are matched against the path **relative** to the vault root.
 * When `forTraversal` is true (i.e., for directories), we allow partial
 * matches so ancestors of potential matches are traversed.
 */
function isPathIncluded(
  fullPath: string,
  includedPatterns: string[],
  vaultRoot?: string,
  forTraversal = false
): boolean {
  // If includes are empty → include everything.
  if (!includedPatterns || includedPatterns.length === 0) return true;
  if (!vaultRoot) return true;

  const relPath = toPosix(path.relative(vaultRoot, fullPath));

  return includedPatterns.some((pattern) => {
    if (!pattern) return false;

    // Trim leading './' and '/' from user-provided pattern
    const clean = pattern.replace(/^\/+/, "").replace(/^\.\/*/, "");
    if (clean === "") return true; // treat '/' (or empty after trim) as wildcard include

    // For traversal we allow partial matches so ancestors of matches are included
    const opts: any = { dot: true };
    if (forTraversal) opts.partial = true;

    return minimatch(relPath, clean, opts);
  });
}

function walkFilesHelper(
  pathToWalk: string,
  excludedPatterns: string[],
  includedPatterns: string[],
  fileEndings: string[],
  resultFiles: string[],
  vaultRoot?: string,
  configFileName: string = ".obsidian"
) {
  const files = fs.readdirSync(pathToWalk);

  for (const file of files) {
    const fullPath = path.join(pathToWalk, file);
    const stats = fs.statSync(fullPath);

    // Exclusion check always wins
    if (stats.isDirectory()) {
      if (file === configFileName) continue;
      if (DEFAULT_EXCLUDED_PATHS.includes(file)) continue;
      if (vaultRoot && isPathExcluded(fullPath, excludedPatterns, vaultRoot)) {
        try { dbgExcludeNotes('walk - skip dir (excluded):', path.relative(vaultRoot, fullPath)); } catch {}
        continue;
      }
      if (!isPathIncluded(fullPath, includedPatterns, vaultRoot, true)) {
        try { if (vaultRoot) dbgExcludeNotes('walk - skip dir (not included/ancestor):', path.relative(vaultRoot, fullPath)); } catch {}
        continue;
      } else {
        try { if (vaultRoot) dbgExcludeNotes('walk - traverse dir:', path.relative(vaultRoot, fullPath)); } catch {}
      }
      // Recursively process subdirectory
      walkFilesHelper(fullPath, excludedPatterns, includedPatterns, fileEndings, resultFiles, vaultRoot, configFileName);
    } else {
      const extension = path.extname(file);
      const relFile = vaultRoot ? path.relative(vaultRoot, fullPath) : fullPath;

      const allowedByExtension = fileEndings.includes(extension);
      const notSpecial = file !== ".md" && !file.includes(".excalidraw");
      const notObsidianCfg = !(vaultRoot && isPathExcluded(fullPath, [".obsidian", configFileName], vaultRoot));
      const notExcluded = !(vaultRoot && isPathExcluded(fullPath, excludedPatterns, vaultRoot));
      const inIncludedTree = isPathIncluded(fullPath, includedPatterns, vaultRoot, false);

      const shouldAdd = allowedByExtension && notSpecial && notObsidianCfg && notExcluded && inIncludedTree;

      if (shouldAdd) {
        try { if (vaultRoot) dbgExcludeNotes('walk - add file:', relFile); } catch {}
        resultFiles.push(fullPath);
      } else {
        try {
          if (vaultRoot) dbgExcludeNotes('walk - skip file:', relFile, {
            allowedByExtension,
            notSpecial,
            notObsidianCfg,
            notExcluded,
            inIncludedTree,
          });
        } catch {}
      }
    }
  }

  return resultFiles;
}

/** Gets a list of patterns that are marked as excluded inside of the Raycast preferences */
function getExcludedPatterns(): string[] {
  const preferences = getPreferenceValues<SearchNotePreferences>();
  const patternsString = preferences.excludedPatterns;
  if (!patternsString) return [];

  const patterns = patternsString.split(",").map((pattern) => pattern.trim());
  return patterns;
}

/** Gets a list of patterns that are explicitly included inside of the Raycast preferences */
function getIncludedPatterns(): string[] {
  const preferences = getPreferenceValues<SearchNotePreferences>();
  const patternsString = (preferences as any).includedPatterns as string | undefined;
  if (!patternsString || patternsString.trim() === "") return ["/"]; // default to root
  return patternsString.split(",").map((pattern) => pattern.trim()).filter((f) => f !== "");
}

/** Returns a list of file paths for all notes. */
function getFilePaths(vault: Vault): string[] {
  const excludedPatterns = getExcludedPatterns();
  const userIgnoredPatterns = getUserIgnoreFilters(vault);
  excludedPatterns.push(...userIgnoredPatterns);

  const includedPatterns = getIncludedPatterns();

  const configFileName = getPreferenceValues<GlobalPreferences>().configFileName ?? ".obsidian";

  const files = walkFilesHelper(
    vault.path,
    excludedPatterns,
    includedPatterns,
    [".md"],
    [],
    vault.path,
    configFileName
  );
  return files;
}

/** Gets a list of patterns that are ignored by the user inside of Obsidian */
export function getUserIgnoreFilters(vault: Vault): string[] {
  const configFileName = getPreferenceValues<GlobalPreferences>().configFileName ?? ".obsidian";
  const appJSONPath = `${vault.path}/${configFileName}/app.json`;
  if (!fs.existsSync(appJSONPath)) {
    return [];
  } else {
    const appJSON = JSON.parse(fs.readFileSync(appJSONPath, "utf-8"));
    return appJSON["userIgnoreFilters"] || [];
  }
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

export function getNoteFileContent(path: string, filter = false) {
  let content = "";
  content = fs.readFileSync(path, "utf8") as string;
  return filter ? filterContent(content) : content;
}

/** Reads a list of notes from the vault path */
export function loadNotes(vault: Vault): Note[] {
  dbgLoadNotes("Loading Notes for vault: " + vault.path);
  const start = performance.now();

  const notes: Note[] = [];
  const filePaths = getFilePaths(vault);
  const bookmarkedFilePaths = getBookmarkedNotePaths(vault);
  const bookmarkedSet = new Set(bookmarkedFilePaths);

  for (const filePath of filePaths) {

    const fileName = path.basename(filePath);
    const title = fileName.replace(/\.md$/, "") || "default";
    const content = getNoteFileContent(filePath, false);
    const stat = fs.statSync(filePath);
    const relativePath = path.relative(vault.path, filePath);

    const { data } = matter(content); // Parses YAML frontmatter

    const aliases: string[] =
      Array.isArray(data?.aliases) ? data.aliases :
        typeof data?.aliases === "string" ? [data.aliases] : [];

    const locations: string[] =
      Array.isArray(data?.locations) ? data.locations :
        typeof data?.locations === "string" ? [data.locations] : [];


    const tagsFromYamlViaMatter =
      Array.isArray(data?.tags) ? data.tags :
        typeof data?.tags === "string" ? [data.tags] : [];

    const tagsFromParser = tagsForString(content);

    dbgLoadNotes("loadNotes - tag debug", {
      title,
      tagsFromYamlViaMatter,
      tagsFromParser,
    });

    const yamlProps: Record<string, any> = { ...data };

    const note: Note = {
      ...yamlProps,
      // IMPORTANT: The following properties override any YAML frontmatter properties
      title: title,
      path: filePath,
      created: stat.birthtime,
      modified: stat.mtime,
      tags: tagsFromParser,
      content: content,
      bookmarked: bookmarkedSet.has(relativePath),
      aliases: aliases,
      locations: locations,
    };
    // console.log("Note keys:", Object.keys(note));

    notes.push(note);
  }

  const end = performance.now();
  dbgLoadNotes(`Finished loading ${notes.length} notes in ${end - start} ms.`);

  return notes;
}

/** Gets a list of file paths for all media. */
function getMediaFilePaths(vault: Vault) {
  const excludedPatterns = getExcludedPatterns();
  const userIgnoredPatterns = getUserIgnoreFilters(vault);
  excludedPatterns.push(...userIgnoredPatterns);
  const includedPatterns = getIncludedPatterns();

  const configFileName = getPreferenceValues<GlobalPreferences>().configFileName ?? ".obsidian";

  const files = walkFilesHelper(
    vault.path,
    excludedPatterns,
    includedPatterns,
    [...AUDIO_FILE_EXTENSIONS, ...VIDEO_FILE_EXTENSIONS, ".jpg", ".png", ".gif", ".mp4", ".pdf"],
    [],
    vault.path,
    configFileName
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
