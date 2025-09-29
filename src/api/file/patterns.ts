import * as path from "path";
import { minimatch } from "minimatch";
import { GlobalPreferences } from "../../utils/preferences";

const GLOB_CHARS = /[\*\?\[\]\{\}!]/;

export const DEFAULT_EXCLUDED_PATHS = [".git", ".obsidian", ".trash", ".excalidraw", ".mobile"];

export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

export function sanitizePattern(pattern: string): string | null {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return null;
  }
  const withoutLeading = trimmed.replace(/^\/+/, "").replace(/^\.\/*/, "");
  return withoutLeading === "" ? "/" : withoutLeading;
}

export function splitPatterns(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((part) => sanitizePattern(part))
    .filter((value): value is string => Boolean(value));
}

export function normalizeFolderName(folder: string | undefined): string | null {
  if (!folder) {
    return null;
  }
  const trimmed = folder.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function unique<T>(input: T[]): T[] {
  return Array.from(new Set(input));
}

export function partitionFolderPatterns(patterns: string[]): {
  folderLike: string[];
  globLike: string[];
} {
  const folderLike: string[] = [];
  const globLike: string[] = [];

  for (const pattern of patterns) {
    if (!pattern) continue;
    if (GLOB_CHARS.test(pattern)) {
      globLike.push(pattern);
    } else {
      folderLike.push(pattern);
    }
  }

  return { folderLike, globLike };
}

export function buildFolderGlobPatterns(folders: string[]): string[] {
  return folders.map((folder) => `${folder}/**`);
}

export function matchesPattern(relPath: string, pattern: string): boolean {
  if (pattern === "/" || pattern === "**" || pattern === "*") {
    return true;
  }
  return minimatch(relPath, pattern, { dot: true });
}

export function shouldIncludeFile(relPath: string, includedPatterns: string[], excludedPatterns: string[]): boolean {
  if (excludedPatterns.some((pattern) => matchesPattern(relPath, pattern))) {
    return false;
  }

  if (includedPatterns.length === 0) {
    return true;
  }

  return includedPatterns.some((pattern) => matchesPattern(relPath, pattern));
}

export function filterPathsByPatterns(
  files: string[],
  vaultRoot: string,
  includedPatterns: string[] = [],
  excludedPatterns: string[] = []
): string[] {
  const includes = includedPatterns.filter((pattern) => Boolean(pattern));
  const excludes = excludedPatterns
    .filter((pattern) => Boolean(pattern))
    .filter((pattern) => pattern !== "/" && pattern !== "**" && pattern !== "*");

  return files.filter((file) => {
    const relPath = toPosix(path.relative(vaultRoot, file));
    return shouldIncludeFile(relPath, includes, excludes);
  });
}

type PatternPreferences = Pick<GlobalPreferences, "includedPatterns" | "excludedPatterns">;

export function isPathExcluded(pathToCheck: string, excludedPatterns: string[], vaultRoot: string): boolean {
  const relPath = toPosix(path.relative(vaultRoot, path.normalize(pathToCheck)));
  return excludedPatterns.some((pattern) => matchesPattern(relPath, pattern));
}

export function buildFileFilters(
  pref: PatternPreferences,
  options: {
    additionalExcludedFolders?: string[];
    additionalExcludedPatterns?: string[];
  } = {}
) {
  const includedPatterns = splitPatterns(pref.includedPatterns);

  // Split global excluded patterns
  const globalExcluded = splitPatterns(pref.excludedPatterns);
  const { folderLike: globalFolderLike, globLike: globalGlobLike } = partitionFolderPatterns(globalExcluded);

  // Split additional excluded patterns (treat array entries like the main string list)
  const rawAdditionalPatterns = (options.additionalExcludedPatterns ?? []).flatMap((p) => splitPatterns(p));
  const { folderLike: additionalFolderLike, globLike: additionalGlobLike } = partitionFolderPatterns(rawAdditionalPatterns);

  // Merge folder-like from both sources with explicitly provided excluded folders
  const additionalFolders = options.additionalExcludedFolders ?? [];
  const excludedFolders = unique(
    [...globalFolderLike, ...additionalFolderLike, ...additionalFolders]
      .map((folder) => normalizeFolderName(folder))
      .filter((folder): folder is string => Boolean(folder))
  );

  // Compose final excluded pattern list: glob-like plus folder/** mirrors
  const folderMirrors = excludedFolders.map((f) => `${f}/**`);
  const excludedPatterns = unique([...globalGlobLike, ...additionalGlobLike, ...folderMirrors]);

  return {
    excludedFolders,
    includedPatterns,
    excludedPatterns,
  };
}
