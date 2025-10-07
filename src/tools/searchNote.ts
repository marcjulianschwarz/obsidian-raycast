import { parseVaults } from "../api/vault/vault.service";
import { getNotesFromCache } from "../api/cache/cache.service";
import { filterNotes, filterNotesFuzzy } from "../utils/search";

type Input = {
  /**
   * The name or search term for the note to find
   */
  noteName: string;
  /**
   * Optional vault name to search in (if not provided, searches all vaults)
   */
  vaultName?: string;
  /**
   * Whether to use fuzzy search (default: false)
   */
  useFuzzySearch?: boolean;
  /**
   * Whether to search in note content as well as title (default: false)
   */
  searchContent?: boolean;
};

/**
 * Search for notes in Obsidian vaults and return a list of matching notes
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
  const searchContent = input.searchContent ?? false;

  // Search across all target vaults
  let allFilteredNotes: Array<{ note: any; vault: any }> = [];
  for (const vault of targetVaults) {
    const notes = getNotesFromCache(vault);
    const filtered = useFuzzy
      ? filterNotesFuzzy(notes, input.noteName, searchContent)
      : filterNotes(notes, input.noteName, searchContent);

    allFilteredNotes.push(...filtered.map((note) => ({ note, vault })));
  }

  if (allFilteredNotes.length === 0) {
    return `No notes found matching "${input.noteName}".`;
  }

  // Return list of all matching notes
  let result = `Found ${allFilteredNotes.length} note(s) matching "${input.noteName}":\n\n`;

  allFilteredNotes.forEach(({ note, vault }, index) => {
    result += `${index + 1}. **${note.title}**\n`;
    result += `   - Vault: ${vault.name}\n`;
    result += `   - Path: ${note.path}\n`;
    if (note.tags && note.tags.length > 0) {
      result += `   - Tags: ${note.tags.join(", ")}\n`;
    }
    result += `\n`;
  });

  return result;
}
