import { Tool, open } from "@raycast/api";
import { parseVaults } from "../api/vault/vault.service";
import { getObsidianTarget, ObsidianTargetType } from "../utils/utils";
import { applyTemplates } from "../api/templating/templating.service";

type Input = {
  /**
   * The content to append to the daily note
   */
  content: string;
  /**
   * Optional vault name (if not provided, uses first vault)
   */
  vaultName?: string;
  /**
   * Optional heading to append under (if not provided, appends to end)
   */
  heading?: string;
  /**
   * Whether to prepend instead of append (default: false)
   */
  prepend?: boolean;
  /**
   * Whether to append silently without opening Obsidian (default: true)
   */
  silent?: boolean;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  const vaults = parseVaults();

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
    message: `${input.prepend ? "Prepend" : "Append"} content to daily note in vault "${targetVault.name}"${input.heading ? ` under heading "${input.heading}"` : ""}?`,
  };
};

/**
 * Append content to today's daily note (requires Advanced URI plugin)
 */
export default async function tool(input: Input) {
  const vaults = parseVaults();

  if (vaults.length === 0) {
    return "No vaults found. Please configure vault paths in Raycast preferences.";
  }

  const targetVault = input.vaultName ? vaults.find((v) => v.name === input.vaultName) : vaults[0];

  if (!targetVault) {
    return `Vault "${input.vaultName}" not found. Available vaults: ${vaults.map((v) => v.name).join(", ")}`;
  }

  // Apply templates to content
  const processedContent = await applyTemplates(input.content);

  // Append to daily note using Advanced URI
  const target = getObsidianTarget({
    type: ObsidianTargetType.DailyNoteAppend,
    vault: targetVault,
    text: processedContent,
    heading: input.heading,
    prepend: input.prepend ?? false,
    silent: input.silent ?? true,
  });

  await open(target);

  return `Successfully ${input.prepend ? "prepended" : "appended"} content to daily note in vault "${targetVault.name}"${input.heading ? ` under heading "${input.heading}"` : ""} (Note: Requires Advanced URI plugin in Obsidian)`;
}
