import { open } from "@raycast/api";
import { parseVaults } from "../api/vault/vault.service";
import { getNotesFromCache } from "../api/cache/cache.service";
import { getObsidianTarget, ObsidianTargetType } from "../utils/utils";
import { filterNotes, filterNotesFuzzy } from "../utils/search";

type Input = {
  /**
   * The name of the note to open
   */
  noteName: string;
  /**
   * Optional vault name (if not provided, searches all vaults)
   */
  vaultName?: string;
  /**
   * Whether to use fuzzy search (default: false)
   */
  useFuzzySearch?: boolean;
  /**
   * Whether to open in a new pane/tab (default: false)
   */
  openInNewPane?: boolean;
};

/**
 * Open a note in Obsidian
 */
export default async function tool(input: Input) {
  const vaults = parseVaults();

  if (vaults.length === 0) {
    return "No vaults found. Please configure vault paths in Raycast preferences.";
  }

  let targetVaults = input.vaultName ? vaults.filter((v) => v.name === input.vaultName) : vaults;

  if (targetVaults.length === 0) {
    return `Vault "${input.vaultName}" not found. Available vaults: ${vaults.map((v) => v.name).join(", ")}`;
  }

  const useFuzzy = input.useFuzzySearch ?? false;

  // Search across all target vaults
  let allFilteredNotes: Array<{ note: any; vault: any }> = [];
  for (const vault of targetVaults) {
    const notes = getNotesFromCache(vault);
    const filtered = useFuzzy ? filterNotesFuzzy(notes, input.noteName, false) : filterNotes(notes, input.noteName, false);

    allFilteredNotes.push(...filtered.map((note) => ({ note, vault })));
  }

  if (allFilteredNotes.length === 0) {
    return `No note found matching "${input.noteName}".`;
  }

  // Get the first matching note
  const { note: matchingNote, vault: matchingVault } = allFilteredNotes[0];

  // Open the note in Obsidian
  const target = getObsidianTarget({
    type: ObsidianTargetType.OpenPath,
    path: matchingNote.path,
  });

  await open(target);

  return `Opened note "${matchingNote.title}" from vault "${matchingVault.name}" in Obsidian${allFilteredNotes.length > 1 ? ` (${allFilteredNotes.length} matches found, opened the first one)` : ""}`;
}
