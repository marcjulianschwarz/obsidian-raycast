import { List, getPreferenceValues, ActionPanel, Action, open } from "@raycast/api";
import { useState, useMemo } from "react";

import { NoteListProps } from "../../utils/interfaces";
import { MAX_RENDERED_NOTES } from "../../utils/constants";
import { tagsForNotes } from "../../utils/yaml";
import { NoteListItem } from "./NoteListItem";
import { NoteListDropdown } from "./NoteListDropdown";
import { searchFunction } from "../../utils/search/search";
import { getObsidianTarget, ObsidianTargetType } from "../../utils/utils";
import { SearchNotePreferences } from "../../utils/preferences";
import { useNotesContext } from "../../utils/hooks";
import { SortOrder, sortNotesByOrder } from "../../utils/sort";

export function NoteList(props: NoteListProps) {
  const { notes, vault, title, searchArguments, action } = props;

  const pref = getPreferenceValues<SearchNotePreferences>();
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    (pref.prefSortOrder as SortOrder) || "az"
  );
  const allNotes = useNotesContext();
  const [searchText, setSearchText] = useState(searchArguments?.searchArgument ?? pref.prefillSearchQuery ?? "");
  const list = useMemo(() => searchFunction(notes ?? [], searchText), [notes, searchText]);
  const sorted = useMemo(() => sortNotesByOrder(list, sortOrder), [list, sortOrder]);
  const _notes = sorted.slice(0, MAX_RENDERED_NOTES);

  const tags = tagsForNotes(allNotes);

  const searchAccessory = useMemo(
    () => <NoteListDropdown sortOrder={sortOrder} setSortOrder={setSortOrder} />,
    [sortOrder]
  );

  function onNoteCreation() {
    const target = getObsidianTarget({ type: ObsidianTargetType.NewNote, vault: vault, name: searchText });
    open(target);
    //TODO: maybe dispatch here. But what if the user cancels the creation in Obsidian or renames it there? Then the cache would be out of sync.
  }

  const isNotesUndefined = notes === undefined;

  return (
    <List
      throttle={true}
      isLoading={isNotesUndefined}
      isShowingDetail={pref.showDetail}
      onSearchTextChange={(value) => {
        setSearchText(value);
      }}
      searchText={searchText}
      navigationTitle={title}
      searchBarPlaceholder="Type search query..."
      searchBarAccessory={searchAccessory}
    >
      {_notes.length === 0 ? (
        <List.Item
          title={`🗒️ Create Note "${searchText}"`}
          actions={
            <ActionPanel>
              <Action title="Create Note" onAction={onNoteCreation} />
            </ActionPanel>
          }
        />
      ) : (
        _notes.map((note) => (
          <NoteListItem note={note} vault={vault} key={note.path} pref={pref} action={action} />
        ))
      )}
    </List>
  );
}