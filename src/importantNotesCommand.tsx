import { List, getPreferenceValues } from "@raycast/api";

import { NoteListObsidian } from "./components/NoteList/NoteListObsidian";
import { VaultSelection } from "./components/VaultSelection";
import { SearchArguments } from "./utils/interfaces";
import { NoVaultFoundMessage } from "./components/Notifications/NoVaultFoundMessage";
import { noVaultPathsToast } from "./components/Toasts";
import { useObsidianVaults } from "./utils/hooks";
import { Vault } from "./api/vault/vault.types";
import { SearchNotePreferences } from "./utils/preferences";
import { SORT_ORDERS, SortOrder } from "./utils/noteSorter";

export default function Command(props: { arguments: SearchArguments }) {
  const { ready, vaults } = useObsidianVaults();
  const pref = getPreferenceValues<SearchNotePreferences>();
  const prefilterSearchQuery = pref.prefilterSearchQuery;
  const prefilter = prefilterSearchQuery?.trim() ? prefilterSearchQuery.trim() : "";
  props.arguments.prefilterSearchQuery = prefilter || undefined;

  const preferenceSort = pref.prefSortOrder as SortOrder;
  if (!props.arguments.sortArgument || !SORT_ORDERS.includes(props.arguments.sortArgument)) {
    if (SORT_ORDERS.includes(preferenceSort)) {
      props.arguments.sortArgument = preferenceSort;
    }
  }

  if (!ready) {
    return <List isLoading={true} />;
  } else if (vaults.length === 0) {
    return <NoVaultFoundMessage />;
  } else if (vaults.length > 1) {
    return (
      <VaultSelection
        vaults={vaults}
        target={(vault: Vault) => (
          <NoteListObsidian vault={vault} showTitle={true} searchArguments={props.arguments} />
        )}
      />
    );
  } else if (vaults.length == 1) {
    return <NoteListObsidian vault={vaults[0]} showTitle={false} searchArguments={props.arguments} />;
  } else {
    noVaultPathsToast();
  }
}
