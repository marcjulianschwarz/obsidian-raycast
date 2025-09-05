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
import { dbgLoadNotes, dbgExcludeNotes } from "../../utils/debugging/debugger";
import { getSelectedTextContent } from "../../utils/utils";

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
 * Checks if a path should be excluded based on exclusion rules.
 * NOTE: Excluded paths are treated **only as relative to the vault root**.
 */
export function isPathExcluded(pathToCheck: string, excludedPaths: string[], vaultRoot: string) {
  const absPath = path.normalize(pathToCheck);
  const relPath = path.normalize(path.relative(vaultRoot, absPath));

  return excludedPaths.some((excluded) => {
    if (!excluded) return false;

    // Force relative-to-root semantics: strip any leading './' or '/' from the pattern
    const pattern = path.normalize(excluded.replace(/^\/+/, '').replace(/^\.\/*/, ''));
    if (pattern === '') return false;

    return relPath === pattern || relPath.startsWith(pattern + path.sep);
  });
}

export const DEFAULT_EXCLUDED_PATHS = [".git", ".obsidian", ".trash", ".excalidraw", ".mobile"];

function walkFilesHelper(
  pathToWalk: string,
  excludedFolders: string[],
  includedFolders: string[] | null,
  fileEndings: string[],
  resultFiles: string[],
  vaultRoot?: string
) {
  const files = fs.readdirSync(pathToWalk);
  const { configFileName } = getPreferenceValues();

  const isIncluded = (fullPath: string, forTraversal = false) => {
    // If includes are empty → include everything. '/' normalizes to '' and matches all.
    if (!includedFolders || includedFolders.length === 0) return true;
    if (!vaultRoot) return true;

    const rel = path.relative(vaultRoot, fullPath);
    const relNorm = rel.split(path.sep).join(path.sep);

    return includedFolders.some((inc) => {
      const incNorm = inc.replace(/^\.+/, "").replace(/^\/*/, ""); // trim leading ./ and /
      if (incNorm === "") return true; // '/' wildcard

      if (forTraversal) {
        // Allow descending into ancestors of an included path
        if (relNorm === "") return true; // at root: must traverse to reach includes
        return (
          relNorm === incNorm ||
          relNorm.startsWith(incNorm + path.sep) ||
          incNorm.startsWith(relNorm + path.sep)
        );
      }

      // Strict: only paths that are inside one of the included folders
      return relNorm === incNorm || relNorm.startsWith(incNorm + path.sep);
    });
  };

  for (const file of files) {
    const fullPath = path.join(pathToWalk, file);
    const stats = fs.statSync(fullPath);

    // Exclusion check always wins
    if (stats.isDirectory()) {
      if (file === configFileName) continue;
      if (DEFAULT_EXCLUDED_PATHS.includes(file)) continue;
      if (vaultRoot && isPathExcluded(fullPath, excludedFolders, vaultRoot)) {
        try { dbgExcludeNotes('[walk] skip dir (excluded):', path.relative(vaultRoot, fullPath)); } catch {}
        continue;
      }
      if (!isIncluded(fullPath, true)) {
        try { if (vaultRoot) dbgExcludeNotes('[walk] skip dir (not included/ancestor):', path.relative(vaultRoot, fullPath)); } catch {}
        continue;
      } else {
        try { if (vaultRoot) dbgExcludeNotes('[walk] traverse dir:', path.relative(vaultRoot, fullPath)); } catch {}
      }
      // Recursively process subdirectory
      walkFilesHelper(fullPath, excludedFolders, includedFolders, fileEndings, resultFiles, vaultRoot);
    } else {
      const extension = path.extname(file);
      const relFile = vaultRoot ? path.relative(vaultRoot, fullPath) : fullPath;

      const allowedByExtension = fileEndings.includes(extension);
      const notSpecial = file !== ".md" && !file.includes(".excalidraw");
      const notObsidianCfg = !(vaultRoot && isPathExcluded(pathToWalk, [".obsidian", configFileName], vaultRoot));
      const notExcluded = !(vaultRoot && isPathExcluded(pathToWalk, excludedFolders, vaultRoot));
      const inIncludedTree = isIncluded(pathToWalk, false);

      const shouldAdd = allowedByExtension && notSpecial && notObsidianCfg && notExcluded && inIncludedTree;

      if (shouldAdd) {
        try { if (vaultRoot) dbgExcludeNotes('[walk] add file:', relFile); } catch {}
        resultFiles.push(fullPath);
      } else {
        try {
          if (vaultRoot) dbgExcludeNotes('[walk] skip file:', relFile, {
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

/** Gets a list of folders that are marked as excluded inside of the Raycast preferences */
function getExcludedFolders(): string[] {
  const preferences = getPreferenceValues<SearchNotePreferences>();
  const foldersString = preferences.excludedFolders;
  if (!foldersString) return [];

  const folders = foldersString.split(",").map((folder) => folder.trim());
  return folders;
}

/** Gets a list of folders that are explicitly included inside of the Raycast preferences */
function getIncludedFolders(): string[] {
  const preferences = getPreferenceValues<SearchNotePreferences>();
  const foldersString = (preferences as any).includedFolders as string | undefined;
  if (!foldersString || foldersString.trim() === "") return ["/"]; // default to root
  return foldersString.split(",").map((folder) => folder.trim()).filter((f) => f !== "");
}

/** Returns a list of file paths for all notes. */
function getFilePaths(vault: Vault): string[] {
  const excludedFolders = getExcludedFolders();
  const userIgnoredFolders = getUserIgnoreFilters(vault);
  excludedFolders.push(...userIgnoredFolders);

  const includedFolders = getIncludedFolders();

  const files = walkFilesHelper(vault.path, excludedFolders, includedFolders, [".md"], [], vault.path);
  return files;
}

/** Gets a list of folders that are ignored by the user inside of Obsidian */
export function getUserIgnoreFilters(vault: Vault): string[] {
  const { configFileName } = getPreferenceValues<GlobalPreferences>();
  const appJSONPath = `${vault.path}/${configFileName || ".obsidian"}/app.json`;
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

  for (const filePath of filePaths) {

    const fileName = path.basename(filePath);
    const title = fileName.replace(/\.md$/, "") || "default";
    const content = getNoteFileContent(filePath, false);
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

    dbgLoadNotes("[loadNotes] tag debug", {
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
      created: fs.statSync(filePath).birthtime,
      modified: fs.statSync(filePath).mtime,
      tags: tagsForString(content),
      content: content,
      bookmarked: bookmarkedFilePaths.includes(relativePath),
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
  const excludedFolders = getExcludedFolders();
  const includedFolders = getIncludedFolders();
  const files = walkFilesHelper(
    vault.path,
    excludedFolders,
    includedFolders,
    [...AUDIO_FILE_EXTENSIONS, ...VIDEO_FILE_EXTENSIONS, ".jpg", ".png", ".gif", ".mp4", ".pdf"],
    [],
    vault.path
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
