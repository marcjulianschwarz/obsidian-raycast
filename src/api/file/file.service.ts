import glob from "fast-glob";
import * as path from "path";
import { Logger } from "../logger/logger.service";
import { DEFAULT_EXCLUDED_PATHS, filterPathsByPatterns } from "./patterns.service";
import { GetFilePathsHelper } from "./file.types";

const logger = new Logger("File");

function normalizeFolderName(folder: string): string {
  return folder.replace(/^\/+/, "").replace(/\/+$/, "").trim();
}

export async function getFilePaths(params: GetFilePathsHelper): Promise<string[]> {
  const {
    path: vaultRoot,
    excludedFolders = [],
    includedFileExtensions,
    includedPatterns = [],
    excludedPatterns = [],
  } = params;
  const defaultExcludedDirs = DEFAULT_EXCLUDED_PATHS;

  const cleanedExcludes = [...defaultExcludedDirs, ...excludedFolders]
    .map(normalizeFolderName)
    .filter(Boolean);

  const folderIgnorePatterns = cleanedExcludes.map((dir) => `**/${dir}/**`);
  const allIgnorePatterns = Array.from(new Set([...folderIgnorePatterns, "**/*.excalidraw.md"]));

  // file extension matcher
  const extensionPattern = includedFileExtensions?.length
    ? includedFileExtensions.length === 1
      ? `**/*.${includedFileExtensions[0].replace(".", "")}`
      : `**/*.{${includedFileExtensions.map((e) => e.replace(".", "")).join(",")}}`
    : "**/*";

  const options = {
    cwd: vaultRoot,
    ignore: allIgnorePatterns,
    onlyFiles: true,
    absolute: true,
    dot: false,
  };

  const globbed = await glob(extensionPattern, options);
  const files = filterPathsByPatterns(globbed, vaultRoot, includedPatterns, excludedPatterns);
  logger.success(`Globbed ${files.length} file paths.`);
  return files;
}

/**
 * Checks if a path should be excluded based on a list of exluded paths
 */
export function isPathExcluded(pathToCheck: string, excludedPaths: string[]) {
  const normalizedPath = path.normalize(pathToCheck);

  return excludedPaths.some((excluded) => {
    if (!excluded) return false;

    const normalizedExcluded = path.normalize(excluded);

    // Check if the path is exactly the excluded path or is a subfolder
    return normalizedPath === normalizedExcluded || normalizedPath.startsWith(normalizedExcluded + path.sep);
  });
}
