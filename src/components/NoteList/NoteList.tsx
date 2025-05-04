import { List, getPreferenceValues } from "@raycast/api";
import { useMemo, useState } from "react";
import { NoteListProps } from "../../utils/interfaces";
import { MAX_RENDERED_NOTES } from "../../utils/constants";
import { NoteListItem } from "./NoteListItem/NoteListItem";
import { NoteListDropdown } from "./NoteListDropdown";
import { SearchNotePreferences } from "../../utils/preferences";
import { CreateNoteView } from "./CreateNoteView";

export function NoteList(props: NoteListProps) {
  const { notes, vault, title, searchArguments, action, isLoading } = props;

  const pref = getPreferenceValues<SearchNotePreferences>();
  const [searchText, setSearchText] = useState(searchArguments.searchArgument || "");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const filteredNotes = useMemo(
    () =>
      notes.filter((note) => note.title.toLowerCase().includes(searchText.toLowerCase())).slice(0, MAX_RENDERED_NOTES),
    [notes, searchText]
  );

  // const tags = tagsForNotes(filteredNotes);

  if (filteredNotes.length === 0 && searchText.trim() !== "") {
    return <CreateNoteView title={title || ""} searchText={searchText} onSearchChange={setSearchText} vault={vault} />;
  }

  return (
    <List
      isLoading={isLoading}
      throttle={true}
      isShowingDetail={pref.showDetail}
      onSearchTextChange={setSearchText}
      onSelectionChange={setSelectedItemId}
      navigationTitle={title}
      searchText={searchText}
      searchBarAccessory={<NoteListDropdown tags={[]} searchArguments={searchArguments} />}
    >
      {filteredNotes.map((note) => (
        <NoteListItem
          note={note}
          vault={vault}
          key={note.path}
          pref={pref}
          action={action}
          selectedItemId={selectedItemId}
        />
      ))}
    </List>
  );
}
