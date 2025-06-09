import { Action, ActionPanel, closeMainWindow, List, open, popToRoot } from "@raycast/api";

import { getObsidianTarget, ObsidianTargetType } from "./utils/utils";
import { NoVaultFoundMessage } from "./components/Notifications/NoVaultFoundMessage";
import AdvancedURIPluginNotInstalled from "./components/Notifications/AdvancedURIPluginNotInstalled";
import { useObsidianVaults } from "./utils/hooks";
import { vaultPluginCheck } from "./api/vault/plugins/plugins.service";

export default function Command() {
  const { vaults, ready } = useObsidianVaults();

  if (!ready) {
    return <List isLoading={true}></List>;
  } else if (vaults.length === 0) {
    return <NoVaultFoundMessage />;
  }

  const [vaultsWithPlugin] = vaultPluginCheck({
    vaults: vaults,
    communityPlugins: ["obsidian-advanced-uri"],
    corePlugins: ["daily-notes"],
  });

  if (vaultsWithPlugin.length == 0) {
    return <AdvancedURIPluginNotInstalled />;
  }

  if (vaultsWithPlugin.length == 1) {
    const target = getObsidianTarget({ type: ObsidianTargetType.DailyNote, vault: vaultsWithPlugin[0] });
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
                target={getObsidianTarget({ type: ObsidianTargetType.DailyNote, vault: vault })}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
