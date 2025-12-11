import { Tool } from "@raycast/api";
import { getVaultsFromPreferencesOrObsidianJson, getNotesWithCache } from "../api/vault/vault.service";
import { updateNoteInCache } from "../api/cache/cache.service";
import { filterNotesFuzzy } from "../api/search/search.service";
import { Note } from "../api/vault/notes/notes.types";
import { Vault } from "../api/vault/vault.types";
import fs from "fs";
import { applyTemplates } from "../api/templating/templating.service";

type Input = {
  /**
   * The name of the note to append to
   */
  noteName: string;
  /**
   * The content to append
   */
  content: string;
  /**
   * Optional vault name (if not provided, searches all vaults)
   */
  vaultName?: string;
  /**
   * Whether to use fuzzy search (default: true)
   */
  useFuzzySearch?: boolean;
  /**
   * Whether to prepend instead of append (default: false)
   */
  prepend?: boolean;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  const vaults = await getVaultsFromPreferencesOrObsidianJson();

  if (vaults.length === 0) {
    return {
      message: "No vaults found. Please configure vault paths in preferences.",
    };
  }

  return {
    message: `${input.prepend ? "Prepend" : "Append"} content to note "${input.noteName}"?`,
  };
};

/**
 * Append or prepend content to an existing note
 */
export default async function tool(input: Input) {
  const vaults = await getVaultsFromPreferencesOrObsidianJson();

  if (vaults.length === 0) {
    return "No vaults found. Please configure vault paths in Raycast preferences.";
  }

  let targetVaults = input.vaultName ? vaults.filter((v) => v.name === input.vaultName) : vaults;

  if (targetVaults.length === 0) {
    return `Vault "${input.vaultName}" not found. Available vaults: ${vaults.map((v) => v.name).join(", ")}`;
  }

  // Search across all target vaults
  let allFilteredNotes: Array<{ note: Note; vault: Vault }> = [];
  for (const vault of targetVaults) {
    const notes = await getNotesWithCache(vault);
    const filtered = filterNotesFuzzy(notes, input.noteName);

    allFilteredNotes.push(...filtered.map((note) => ({ note, vault })));
  }

  if (allFilteredNotes.length === 0) {
    return `No note found matching "${input.noteName}".`;
  }

  // Get the first matching note
  const { note: matchingNote, vault: matchingVault } = allFilteredNotes[0];

  // Apply templates to content
  const processedContent = await applyTemplates(input.content);

  // Append or prepend the content
  if (input.prepend) {
    const existingContent = fs.readFileSync(matchingNote.path, "utf8");
    fs.writeFileSync(matchingNote.path, processedContent + "\n" + existingContent);
  } else {
    fs.appendFileSync(matchingNote.path, "\n" + processedContent);
  }

  // Update the note in cache with new lastModified time
  const stats = fs.statSync(matchingNote.path);
  updateNoteInCache(matchingVault, matchingNote.path, { lastModified: stats.mtime });

  return `Successfully ${input.prepend ? "prepended" : "appended"} content to note "${matchingNote.title}" in vault "${
    matchingVault.name
  }"${allFilteredNotes.length > 1 ? ` (${allFilteredNotes.length} matches found, modified the first one)` : ""}`;
}
