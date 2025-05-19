import { List, getPreferenceValues } from "@raycast/api";
import { memo, useMemo, useState } from "react";
import { NoteListProps } from "../../utils/interfaces";
import { MAX_RENDERED_NOTES } from "../../utils/constants";
import { NoteListItem } from "./NoteListItem/NoteListItem";
import { NoteListDropdown } from "./NoteListDropdown";
import { SearchNotePreferences } from "../../utils/preferences";
import { CreateNoteView } from "./CreateNoteView";

const MemoizedNoteListItem = memo(NoteListItem);

export function NoteList(props: NoteListProps) {
  const { notes, vault, title, searchArguments, isLoading } = props;

  const pref = getPreferenceValues<SearchNotePreferences>();
  const [inputText, setInputText] = useState(searchArguments.searchArgument || "");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const filteredNotes = useMemo(() => {
    if (!inputText.trim()) {
      return notes.slice(0, MAX_RENDERED_NOTES);
    }

    const lowerSearchText = inputText.toLowerCase();
    return notes.filter((note) => note.title.toLowerCase().includes(lowerSearchText)).slice(0, MAX_RENDERED_NOTES);
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
        />
      ))}
    </List>
  );
}
