import { Logger } from "../api/logger/logger.service";
import { filterNotesFuzzy } from "../api/search/search.service";
import { Note } from "../api/vault/notes/notes.types";
import { getNotesWithCache, getVaultsFromPreferencesOrObsidianJson } from "../api/vault/vault.service";
import { Vault } from "../api/vault/vault.types";

type Input = {
  /**
   * The search term for the note to find
   */
  searchTerm: string;
  /**
   * If the user provides a vault name or hints towards one, ALWAYS use it here.
   */
  vaultName?: string;
};

const logger = new Logger("Tool SearchNote");

/**
 * Search for notes in Obsidian vaults and return a list of matching notes with their title, vault, and path
 */
export default async function tool(input: Input) {
  const vaults = await getVaultsFromPreferencesOrObsidianJson();

  if (vaults.length === 0) {
    logger.warning("No vaults configured");
    return "No vaults found. Please configure vault paths in Raycast preferences.";
  }

  const targetVaults = input.vaultName ? vaults.filter((v) => v.name === input.vaultName) : vaults;

  if (targetVaults.length === 0) {
    logger.warning(`Could not find vault ${input.vaultName}`);
    return `Vault "${input.vaultName}" not found. Available vaults: ${vaults.map((v) => v.name).join(", ")}`;
  }

  // Search across all target vaults
  let allFilteredNotes: { note: Note; vault: Vault }[] = [];
  for (const vault of targetVaults) {
    const notes = await getNotesWithCache(vault);
    const filtered = filterNotesFuzzy(notes, input.searchTerm);

    allFilteredNotes.push(...filtered.map((note) => ({ note, vault })));
  }

  if (allFilteredNotes.length === 0) {
    logger.warning(`No notes found matching ${input.searchTerm}`);
    return `No notes found matching "${input.searchTerm}".`;
  }

  if (allFilteredNotes.length >= 10) {
    allFilteredNotes = allFilteredNotes.slice(0, 10);
  }

  // Return list of all matching notes
  let result = `Found ${allFilteredNotes.length} note(s) matching "${input.searchTerm}":\n\n`;

  allFilteredNotes.forEach(({ note, vault }, index) => {
    result += `${index + 1}. **${note.title}**\n`;
    result += `   - Vault: ${vault.name}\n`;
    result += `   - Path: ${note.path}\n\n`;
  });

  logger.debug(result);

  return result;
}
