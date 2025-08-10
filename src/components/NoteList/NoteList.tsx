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

type SortOrder = "az" | "za" | "mn" | "mo" | "cn" | "co";

function sortNotesByOrder<T extends { title?: string; created?: Date | string | number; modified?: Date | string | number }>(
  notes: T[],
  order: SortOrder
): T[] {
  const safeTitle = (n: T) => (n.title ?? "").trim();
  const ts = (d?: Date | string | number) => {
    if (d instanceof Date) return d.getTime();
    if (typeof d === "number") return Number.isFinite(d) ? d : 0;
    if (typeof d === "string") {
      const t = Date.parse(d);
      return Number.isNaN(t) ? 0 : t;
    }
    return 0;
  };
  const arr = [...notes]; // never mutate caller

  switch (order) {
    case "az":
      return arr.sort((a, b) => safeTitle(a).localeCompare(safeTitle(b), undefined, { sensitivity: "base", numeric: true }));
    case "za":
      return arr.sort((a, b) => safeTitle(b).localeCompare(safeTitle(a), undefined, { sensitivity: "base", numeric: true }));
    case "mn":
      return arr.sort((a, b) => ts(b.modified) - ts(a.modified));
    case "mo":
      return arr.sort((a, b) => ts(a.modified) - ts(b.modified));
    case "cn":
      return arr.sort((a, b) => ts(b.created) - ts(a.created));
    case "co":
      return arr.sort((a, b) => ts(a.created) - ts(b.created));
  }
}

export function NoteList(props: NoteListProps) {
  const { notes, vault, title, searchArguments, action } = props;

  const pref = getPreferenceValues<SearchNotePreferences>();
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    (pref.prefSortOrder as SortOrder) || "az"
  );
  const allNotes = useNotesContext();
  const [searchText, setSearchText] = useState(searchArguments.searchArgument ?? "");
  // const list = useMemo(() => searchFunction(notes ?? [], searchText), [notes, searchText]);
  // const _notes = list.slice(0, MAX_RENDERED_NOTES);
  const list = useMemo(() => searchFunction(notes ?? [], searchText), [notes, searchText]);
  const sorted = useMemo(() => sortNotesByOrder(list, sortOrder), [list, sortOrder]);
  const _notes = sorted.slice(0, MAX_RENDERED_NOTES);

  const tags = tagsForNotes(allNotes);

  function onNoteCreation() {
    const target = getObsidianTarget({ type: ObsidianTargetType.NewNote, vault: vault, name: searchText });
    open(target);
    //TODO: maybe dispatch here. But what if the user cancels the creation in Obsidian or renames it there? Then the cache would be out of sync.
  }

  const isNotesUndefined = notes === undefined;
  if (_notes.length == 0) {
    return (
      <List
        navigationTitle={title}
        onSearchTextChange={(value) => {
          setSearchText(value);
        }}
      >
        <List.Item
          title={`🗒️ Create Note "${searchText}"`}
          actions={
            <ActionPanel>
              <Action title="Create Note" onAction={onNoteCreation} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      throttle={true}
      isLoading={isNotesUndefined}
      isShowingDetail={pref.showDetail}
      onSearchTextChange={(value) => {
        setSearchText(value);
      }}
      navigationTitle={title}
      searchText={searchText}
      searchBarPlaceholder="=~> key:value logic:and|or sort:az|za|mn|mo|cn|co|s"
      // searchBarAccessory={<NoteListDropdown tags={tags} searchArguments={searchArguments} />}
      // searchBarAccessory={<NoteListDropdown />}
      searchBarAccessory={<NoteListDropdown sortOrder={sortOrder} setSortOrder={setSortOrder} />}
    >
      {_notes?.map((note) => (
        <NoteListItem note={note} vault={vault} key={note.path} pref={pref} action={action} />
      ))}
    </List>
  );
}