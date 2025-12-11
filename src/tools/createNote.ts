import { Tool } from "@raycast/api";
import { getVaultsFromPreferencesOrObsidianJson } from "../api/vault/vault.service";
import { createNote } from "../api/vault/notes/notes.service";
import { invalidateNotesCache } from "../api/cache/cache.service";

type Input = {
  /**
   * The name of the note to create
   */
  name: string;
  /**
   * The content of the note
   */
  content: string;
  /**
   * Optional vault name (if not provided, uses first vault)
   */
  vaultName?: string;
  /**
   * Optional path within the vault (e.g., "folder/subfolder")
   */
  path?: string;
  /**
   * Optional tags to add to the note (comma-separated)
   */
  tags?: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  const vaults = await getVaultsFromPreferencesOrObsidianJson();

  if (vaults.length === 0) {
    return {
      message: "No vaults found. Please configure vault paths in preferences.",
    };
  }

  const targetVault = input.vaultName ? vaults.find((v) => v.name === input.vaultName) : vaults[0];

  if (!targetVault) {
    return {
      message: `Vault "${input.vaultName}" not found.`,
    };
  }

  return {
    message: `Create note "${input.name}" in vault "${targetVault.name}"${
      input.path ? ` at path "${input.path}"` : ""
    }?`,
  };
};

/**
 * Create a new note in an Obsidian vault
 */
export default async function tool(input: Input) {
  const vaults = await getVaultsFromPreferencesOrObsidianJson();

  if (vaults.length === 0) {
    return "No vaults found. Please configure vault paths in Raycast preferences.";
  }

  const targetVault = input.vaultName ? vaults.find((v) => v.name === input.vaultName) : vaults[0];

  if (!targetVault) {
    return `Vault "${input.vaultName}" not found. Available vaults: ${vaults.map((v) => v.name).join(", ")}`;
  }

  // Parse tags
  const tags = input.tags ? input.tags.split(",").map((tag) => tag.trim()) : [];

  // Default to vault root (empty string) unless a path is explicitly provided
  const notePath = input.path || "";

  // Create the note
  const saved = await createNote(targetVault, {
    name: input.name,
    content: input.content,
    path: notePath,
    tags: tags,
  });

  if (saved) {
    invalidateNotesCache(targetVault);
    return `Successfully created note "${input.name}" in vault "${targetVault.name}"${
      notePath ? ` at path "${notePath}"` : " at vault root"
    }`;
  } else {
    return `Failed to create note "${input.name}" in vault "${targetVault.name}"`;
  }
}
