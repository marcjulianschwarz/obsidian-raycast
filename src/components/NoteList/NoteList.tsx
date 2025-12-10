import { List, getPreferenceValues } from "@raycast/api";
import { memo, useMemo, useState } from "react";
import { MAX_RENDERED_NOTES } from "../../utils/constants";
import { NoteListItem } from "./NoteListItem/NoteListItem";
import { NoteListDropdown } from "./NoteListDropdown";
import { SearchNotePreferences } from "../../utils/preferences";
import { CreateNoteView } from "./CreateNoteView";
import { filterNotesFuzzy } from "../../api/search/search.service";
import { Vault } from "../../api/vault/vault.types";
import { Note } from "../../api/vault/notes/notes.types";
import { SearchArguments } from "../../utils/interfaces";

export interface NoteListProps {
  title?: string;
  vault: Vault;
  notes: Note[];
  isLoading?: boolean;
  searchArguments: SearchArguments;
  action?: (note: Note, vault: Vault) => React.ReactNode;
  onDelete?: (note: Note, vault: Vault) => void;
  onSearchChange?: (search: string) => void;
  onNoteUpdated?: (notePath: string, updates: Partial<Note>) => void;
}

const MemoizedNoteListItem = memo(NoteListItem);

export function NoteList(props: NoteListProps) {
  const { notes, vault, title, searchArguments, isLoading, onNoteUpdated } = props;

  const pref = getPreferenceValues<SearchNotePreferences>();
  const [inputText, setInputText] = useState(searchArguments.searchArgument || "");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const filteredNotes = useMemo(() => {
    if (!inputText.trim()) {
      return notes.slice(0, MAX_RENDERED_NOTES);
    }

    return filterNotesFuzzy(notes, inputText, false).slice(0, MAX_RENDERED_NOTES);
  }, [notes, inputText]);

  if (filteredNotes.length === 0 && inputText.trim() !== "") {
    return <CreateNoteView title={title || ""} searchText={inputText} onSearchChange={setInputText} vault={vault} />;
  }

  return (
    <List
      isLoading={isLoading}
      throttle={true}
      isShowingDetail={pref.showDetail}
      onSearchTextChange={setInputText}
      onSelectionChange={setSelectedItemId}
      navigationTitle={title}
      searchBarAccessory={<NoteListDropdown tags={[]} searchArguments={searchArguments} />}
    >
      {filteredNotes.map((note, idx) => (
        <MemoizedNoteListItem
          note={note}
          vault={vault}
          key={note.path}
          pref={pref}
          selectedItemId={!selectedItemId ? (idx === 0 ? note.path : null) : selectedItemId}
          onNoteUpdated={onNoteUpdated}
        />
      ))}
    </List>
  );
}
