import { List, getPreferenceValues, ActionPanel, Action, open } from "@raycast/api";
import { useState, useMemo } from "react";

import { NoteListProps } from "../../utils/interfaces";
import { MAX_RENDERED_NOTES } from "../../utils/constants";
import { NoteListItem } from "./NoteListItem";
import { NoteListDropdown } from "./NoteListDropdown";
import { searchFunction } from "../../utils/search/search";
import { getObsidianTarget, ObsidianTargetType } from "../../utils/utils";
import { SearchNotePreferences } from "../../utils/preferences";
import { SortOrder, sortNotesByOrder } from "../../utils/noteSorter";

export function NoteList(props: NoteListProps) {
  const { notes, vault, title, searchArguments, action } = props;

  const pref = getPreferenceValues<SearchNotePreferences>();
  const validSortOrders: SortOrder[] = ["az", "za", "mn", "mo", "cn", "co"];
  const initialSortOrder: SortOrder = validSortOrders.includes(pref.prefSortOrder as SortOrder)
    ? (pref.prefSortOrder as SortOrder)
    : "az";
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder);
  
  const [searchText, setSearchText] = useState(
    searchArguments?.searchArgument || searchArguments?.initialSearchText || ""
  );
  const prefilterSearchQuery = (searchArguments?.prefilterSearchQuery ?? "").trim();
  const prefilteredNotes = useMemo(
    () => (prefilterSearchQuery ? searchFunction(notes ?? [], prefilterSearchQuery) : (notes ?? [])),
    [notes, prefilterSearchQuery]
  );
  const list = useMemo(() => searchFunction(prefilteredNotes, searchText), [prefilteredNotes, searchText]);
  const sorted = useMemo(() => sortNotesByOrder(list, sortOrder), [list, sortOrder]);
  const _notes = sorted.slice(0, MAX_RENDERED_NOTES);
  const trimmedSearchText = searchText.trim();

  const searchAccessory = useMemo(
    () => <NoteListDropdown sortOrder={sortOrder} setSortOrder={setSortOrder} />,
    [sortOrder]
  );

  function onNoteCreation() {
    const name = trimmedSearchText || pref.prefNoteName;
    if (!name) {
      return;
    }
    const target = getObsidianTarget({ type: ObsidianTargetType.NewNote, vault: vault, name });
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
      {_notes.length === 0 && trimmedSearchText ? (
        <List.Item
          title={`🗒️ Create Note "${trimmedSearchText}"`}
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
