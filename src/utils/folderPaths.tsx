import fs from "fs";
import path from "path";
import { getPreferenceValues } from "@raycast/api";
import { Vault } from "../api/vault/vault.types";
import { getUserIgnoreFilters } from "../api/vault/vault.service";
import { DEFAULT_EXCLUDED_PATHS, isPathExcluded } from "../api/file/patterns";

function walkDirsHelper(pathToWalk: string, excludedFolders: string[], vaultRoot: string, collected: Set<string>): Set<string> {
  const files = fs.readdirSync(pathToWalk);
  const { configFileName } = getPreferenceValues();

  for (const file of files) {
    const fullPath = path.join(pathToWalk, file);
    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      if (file === configFileName) continue;
      if (DEFAULT_EXCLUDED_PATHS.includes(file)) continue;
      if (isPathExcluded(fullPath, excludedFolders, vaultRoot)) continue;

      collected.add(fullPath);
      walkDirsHelper(fullPath, excludedFolders, vaultRoot, collected);
    }
  }
  return collected;
}

export function getAllFolderPaths(vault: Vault): string[] {
  const preferences = getPreferenceValues<{ excludedFolders?: string }>();
  const excludedFolders = preferences.excludedFolders ? preferences.excludedFolders.split(",") : [];
  const userIgnoredFolders = getUserIgnoreFilters(vault);
  excludedFolders.push(...userIgnoredFolders);

  const collected = walkDirsHelper(vault.path, excludedFolders, vault.path, new Set<string>());

  const relative = Array.from(collected)
    .map((p) => path.relative(vault.path, p))
    .filter((p) => p && p.trim() !== "");

  return relative.sort();
}
