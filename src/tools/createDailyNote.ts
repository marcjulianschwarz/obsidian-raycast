import { Tool, open } from "@raycast/api";
import { getVaultsFromPreferencesOrObsidianJson } from "../api/vault/vault.service";
import { getObsidianTarget, ObsidianTargetType } from "../utils/utils";

type Input = {
  /**
   * Optional vault name (if not provided, uses first vault)
   */
  vaultName?: string;
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
    message: `Create/open daily note in vault "${targetVault.name}"?`,
  };
};

/**
 * Create or open today's daily note in Obsidian (requires Advanced URI plugin)
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

  // Open daily note using Advanced URI
  const target = getObsidianTarget({
    type: ObsidianTargetType.DailyNote,
    vault: targetVault,
  });

  await open(target);

  return `Opened daily note in vault "${targetVault.name}" (Note: Requires Advanced URI plugin in Obsidian)`;
}
