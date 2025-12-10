import { getPreferenceValues, List, open, popToRoot } from "@raycast/api";
import { useEffect, useRef } from "react";

import { CreateNoteForm } from "./components/CreateNoteForm";
import { VaultSelection } from "./components/VaultSelection";
import { getObsidianTarget, ObsidianTargetType } from "./utils/utils";
import { NoVaultFoundMessage } from "./components/Notifications/NoVaultFoundMessage";
import { noVaultPathsToast } from "./components/Toasts";
import { NoteFormPreferences } from "./utils/preferences";
import { useObsidianVaults } from "./utils/hooks";
import { Vault } from "./api/vault/vault.types";

export default function Command() {
  const { vaults, ready } = useObsidianVaults();
  const pref = getPreferenceValues<NoteFormPreferences>();
  const hasExecutedRef = useRef(false);

  useEffect(() => {
    if (ready && vaults.length === 1 && pref.blankNote && !hasExecutedRef.current) {
      hasExecutedRef.current = true;
      const target = getObsidianTarget({
        type: ObsidianTargetType.NewNote,
        vault: vaults[0],
        name: pref.prefNoteName || "Blank Note",
        content: "",
      });
      open(target);
      popToRoot();
    }
  }, [ready, vaults.length, pref.blankNote, pref.prefNoteName]);

  if (!ready) {
    return <List isLoading={true} />;
  } else if (vaults.length === 0) {
    return <NoVaultFoundMessage />;
  } else if (vaults.length > 1) {
    return (
      <VaultSelection vaults={vaults} target={(vault: Vault) => <CreateNoteForm vault={vault} showTitle={true} />} />
    );
  } else if (vaults.length === 1) {
    if (pref.blankNote) {
      return null; // Action happens in useEffect
    } else {
      return <CreateNoteForm vault={vaults[0]} showTitle={false} />;
    }
  } else {
    noVaultPathsToast();
    return null;
  }
}
