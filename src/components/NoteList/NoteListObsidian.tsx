import { useNotes } from "../../utils/hooks";
import { SearchArguments } from "../../utils/interfaces";
import { NoteList } from "./NoteList";
import { Vault } from "../../api/vault/vault.types";

export const NoteListObsidian = function NoteListObsidian(props: {
  vault: Vault;
  showTitle: boolean;
  bookmarked: boolean;
  searchArguments: SearchArguments;
}) {
  const { showTitle, vault, searchArguments } = props;

  const { notes, loading } = useNotes(vault, false);

  return (
    <NoteList
      title={showTitle ? `Search Note in ${vault.name}` : ""}
      notes={notes}
      vault={vault}
      searchArguments={searchArguments}
      isLoading={loading}
    />
  );
};
