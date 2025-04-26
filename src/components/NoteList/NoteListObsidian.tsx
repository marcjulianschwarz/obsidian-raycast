import { useNotes } from "../../utils/hooks";
import { SearchArguments } from "../../utils/interfaces";
import { NoteList } from "./NoteList";
import { NoteActions, OpenNoteActions } from "../../utils/actions";
import { Action, Icon } from "@raycast/api";
import { Vault } from "../../api/vault/vault.types";
import { Note } from "../../api/vault/notes/notes.types";
import { renewCache } from "../../api/cache/cache.service";

export const NoteListObsidian = function NoteListObsidian(props: {
  vault: Vault;
  showTitle: boolean;
  bookmarked: boolean;
  searchArguments: SearchArguments;
}) {
  const { showTitle, vault, searchArguments } = props;

  const { notes, loading } = useNotes(vault);

  // const filteredNotes = useMemo(() => {
  //   return props.bookmarked ? notes.filter((n) => n.bookmarked) : notes;
  // }, [notes, props.bookmarked]);

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
