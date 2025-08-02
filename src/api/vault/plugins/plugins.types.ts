import { Vault } from "../vault.types";

export interface VaultPluginCheckParams {
  vaults: Vault[];
  communityPlugins?: string[];
  corePlugins?: string[];
}
