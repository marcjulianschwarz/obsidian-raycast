import { Action, ActionPanel, closeMainWindow, getPreferenceValues, List, open, popToRoot } from "@raycast/api";

import { NoVaultFoundMessage } from "./components/Notifications/NoVaultFoundMessage";
import AdvancedURIPluginNotInstalled from "./components/Notifications/AdvancedURIPluginNotInstalled";
import { useObsidianVaults } from "./utils/hooks";
import { DailyNotePreferences } from "./utils/preferences";
import { Vault, Obsidian } from "./obsidian";
import { ObsidianTargetType } from "./obsidian/obsidian";

export default function Command() {
  const { vaults, ready } = useObsidianVaults();
  const { vaultName } = getPreferenceValues<DailyNotePreferences>();
  const preselectedVault = vaults.find((vault) => vault.name === vaultName);

  if (!ready) {
    return <List isLoading={true}></List>;
  } else if (vaults.length === 0) {
    return <NoVaultFoundMessage />;
  }

  const [vaultsWithPlugin] = Vault.checkPlugins({
    vaults: vaults,
    communityPlugins: ["obsidian-advanced-uri"],
    corePlugins: ["daily-notes"],
  });

  if (vaultsWithPlugin.length == 0) {
    return <AdvancedURIPluginNotInstalled />;
  }

  if (preselectedVault || vaultsWithPlugin.length == 1) {
    const vaultToUse = preselectedVault || vaultsWithPlugin[0];
    const target = Obsidian.getTarget({ type: ObsidianTargetType.DailyNote, vault: vaultToUse });
    open(target);
    popToRoot();
    closeMainWindow();
  }

  return (
    <List isLoading={vaultsWithPlugin === undefined}>
      {vaultsWithPlugin?.map((vault) => (
        <List.Item
          title={vault.name}
          key={vault.key}
          actions={
            <ActionPanel>
              <Action.Open
                title="Daily Note"
                target={Obsidian.getTarget({ type: ObsidianTargetType.DailyNote, vault: vault })}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
