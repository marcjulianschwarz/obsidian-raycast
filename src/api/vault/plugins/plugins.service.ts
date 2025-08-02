import { getPreferenceValues } from "@raycast/api";
import { Vault } from "../vault.types";
import fs from "fs";
import { Logger } from "../../logger/logger.service";
import { VaultPluginCheckParams } from "./plugins.types";

const logger: Logger = new Logger("Plugins");

export function readCommunityPlugins(vault: Vault): string[] | undefined {
  const { configFileName } = getPreferenceValues();
  const path = `${vault.path}/${configFileName || ".obsidian"}/community-plugins.json`;
  if (!fs.existsSync(path)) return;
  const content = fs.readFileSync(path, "utf-8");
  const plugins: string[] = JSON.parse(content);
  return plugins;
}

/** Reads the core-plugins.json file and returns a record with plugin name keys. The values
 * are booleans, indicating whether the plugin is enabled or not.
 */
export function readCorePlugins(vault: Vault): Record<string, boolean> | undefined {
  const { configFileName } = getPreferenceValues();
  const path = `${vault.path}/${configFileName || ".obsidian"}/core-plugins.json`;
  if (!fs.existsSync(path)) return;
  const content = fs.readFileSync(path, "utf-8");
  const plugins: Record<string, boolean> = JSON.parse(content);
  return plugins;
}

export function vaultPluginCheck(params: VaultPluginCheckParams) {
  const vaultsWithoutPlugin: Vault[] = [];
  const vaultsWithPlugin = params.vaults.filter((vault: Vault) => {
    const toCheckCommunityPlugins = params.communityPlugins;
    const toCheckCorePlugins = params.corePlugins;

    if (toCheckCommunityPlugins) {
      const plugins = readCommunityPlugins(vault);
      if (!plugins || !toCheckCommunityPlugins.every((c) => plugins.includes(c))) {
        vaultsWithoutPlugin.push(vault);
        return false;
      }
    }

    if (toCheckCorePlugins) {
      const plugins = readCorePlugins(vault);
      if (!plugins || !toCheckCorePlugins.every((c) => c in plugins && plugins[c])) {
        vaultsWithoutPlugin.push(vault);
        return false;
      }
    }

    return true;
  });
  logger.info(`Vaults with requested plugins: ${vaultsWithPlugin.map((v) => v.name).join(", ")}`);
  return [vaultsWithPlugin, vaultsWithoutPlugin];
}
