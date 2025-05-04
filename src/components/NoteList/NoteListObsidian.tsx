import { useNotes } from "../../utils/hooks";
import { SearchArguments } from "../../utils/interfaces";
import { NoteList } from "./NoteList";
import { OpenNoteActions } from "../../utils/actions";
import { Vault } from "../../api/vault/vault.types";
import { Note } from "../../api/vault/notes/notes.types";

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
      action={(note: Note, vault: Vault) => (
        <>
          <OpenNoteActions note={note} notes={notes} vault={vault} />
          {/* <NoteActions notes={notes} note={note} vault={vault} />
          <Action title="Reload Notes" icon={Icon.ArrowClockwise} onAction={() => renewCache(vault)} /> */}
        </>
      )}
    />
  );
};
