import { Logger } from "../api/logger/logger.service";
import { getVaultsFromPreferencesOrObsidianJson, getNoteFileContent } from "../api/vault/vault.service";

type Input = {
  /**
   * The FULL path to the note file
   */
  notePath: string;
  /**
   * The vault name where the note is located
   */
  vaultName: string;
};

const logger = new Logger("Tool ReadNote");

/**
 * Read the content of a specific note by its path and vault
 */
export default async function tool(input: Input) {
  const vaults = await getVaultsFromPreferencesOrObsidianJson();

  if (vaults.length === 0) {
    return "No vaults found. Please configure vault paths in Raycast preferences.";
  }

  const targetVault = vaults.find((v) => v.name === input.vaultName);

  if (!targetVault) {
    return `Vault "${input.vaultName}" not found. Available vaults: ${vaults.map((v) => v.name).join(", ")}`;
  }

  try {
    const content = await getNoteFileContent(input.notePath);
    const context = `# ${input.notePath.split("/").pop()?.replace(".md", "")}\n\n${content}`;
    logger.debug(context);
  } catch (error) {
    logger.warning("Failed to read note at path: " + input.notePath);
    return `Failed to read note at path "${input.notePath}": ${error}`;
  }
}
