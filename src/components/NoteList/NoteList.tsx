import { List, getPreferenceValues } from "@raycast/api";
import { memo, useMemo, useState } from "react";

import { NoteListProps } from "../../utils/interfaces";
import { MAX_RENDERED_NOTES } from "../../utils/constants";
import { NoteListItem } from "./NoteListItem/NoteListItem";
import { NoteListDropdown } from "./NoteListDropdown";
import { searchFunction } from "../../utils/search/search";
import { SearchNotePreferences } from "../../utils/preferences";
import { SortOrder, sortNotesByOrder } from "../../utils/noteSorter";
import { CreateNoteView } from "./CreateNoteView";

const MemoizedNoteListItem = memo(NoteListItem);

export function NoteList(props: NoteListProps) {
  const { notes, vault, title, searchArguments, isLoading } = props;

  const pref = getPreferenceValues<SearchNotePreferences>();
  const validSortOrders: SortOrder[] = ["az", "za", "mn", "mo", "cn", "co"];
  const initialSortOrder: SortOrder = validSortOrders.includes(pref.prefSortOrder as SortOrder)
    ? (pref.prefSortOrder as SortOrder)
    : "az";

  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder);
  const [searchText, setSearchText] = useState(
    searchArguments?.searchArgument || searchArguments?.initialSearchText || ""
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const prefilterSearchQuery = (searchArguments?.prefilterSearchQuery ?? "").trim();
  const prefilteredNotes = useMemo(
    () => (prefilterSearchQuery ? searchFunction(notes ?? [], prefilterSearchQuery) : notes ?? []),
    [notes, prefilterSearchQuery]
  );

  const filteredNotes = useMemo(() => searchFunction(prefilteredNotes, searchText), [prefilteredNotes, searchText]);
  const sortedNotes = useMemo(() => sortNotesByOrder(filteredNotes, sortOrder), [filteredNotes, sortOrder]);
  const limitedNotes = sortedNotes.slice(0, MAX_RENDERED_NOTES);
  const trimmedSearchText = searchText.trim();

  const searchAccessory = useMemo(
    () => <NoteListDropdown sortOrder={sortOrder} setSortOrder={setSortOrder} />,
    [sortOrder]
  );

  if (limitedNotes.length === 0 && trimmedSearchText) {
    return <CreateNoteView title={title || ""} searchText={trimmedSearchText} onSearchChange={setSearchText} vault={vault} />;
  }

  return (
    <List
      isLoading={isLoading}
      throttle
      isShowingDetail={pref.showDetail}
      onSearchTextChange={setSearchText}
      searchText={searchText}
      navigationTitle={title}
      onSelectionChange={setSelectedItemId}
      searchBarAccessory={searchAccessory}
    >
      {limitedNotes.map((note, idx) => (
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
