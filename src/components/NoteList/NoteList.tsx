import { List, getPreferenceValues } from "@raycast/api";
import { useState, useEffect } from "react";
import { NoteListProps } from "../../utils/interfaces";
import { MAX_RENDERED_NOTES } from "../../utils/constants";
import { NoteListItem } from "./NoteListItem/NoteListItem";
import { NoteListDropdown } from "./NoteListDropdown";
import { SearchNotePreferences } from "../../utils/preferences";
import { CreateNoteView } from "./CreateNoteView";
import { loadMiniSearchIndex } from "../../api/vault/search/search.service";
import { Note } from "../../api/vault/notes/notes.types";
import MiniSearch from "minisearch";

function findNotesByPaths(paths: string[], allNotes: Note[]): Note[] {
  const pathSet = new Set(paths);
  return allNotes.filter((note) => pathSet.has(note.path));
}

export function NoteList(props: NoteListProps) {
  const { notes, vault, title, searchArguments, action, isLoading: initialLoading } = props;

  const pref = getPreferenceValues<SearchNotePreferences>();
  const [searchText, setSearchText] = useState(searchArguments.searchArgument || "");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchIndex, setSearchIndex] = useState<MiniSearch | null>(null);
  const [indexLoading, setIndexLoading] = useState(true);

  // Effect to load the index once on mount
  useEffect(() => {
    let isMounted = true;
    setIndexLoading(true);
    loadMiniSearchIndex(vault)
      .then((index) => {
        if (isMounted) {
          setSearchIndex(index);
          setIndexLoading(false);
        }
      })
      .catch((error) => {
        console.error("Failed to load search index:", error);
        if (isMounted) {
          setIndexLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [vault, notes]);

  // const filteredNotes = searchIndex
  //   ? findNotesByPaths(
  //       searchIndex.search(searchText).map((res) => res.id as string),
  //       notes
  //     )
  //   : [];
  const paginatedSearchedNotes = notes.slice(0, MAX_RENDERED_NOTES);
  const overallLoading = initialLoading || indexLoading;

  // const tags = tagsForNotes(filteredNotes);

  if (!overallLoading && paginatedSearchedNotes.length === 0 && searchText.trim() !== "") {
    return <CreateNoteView title={title || ""} searchText={searchText} onSearchChange={setSearchText} vault={vault} />;
  }

  return (
    <List
      throttle={true}
      isLoading={overallLoading}
      isShowingDetail={pref.showDetail}
      onSearchTextChange={setSearchText}
      onSelectionChange={setSelectedItemId}
      navigationTitle={title}
      searchText={searchText}
      searchBarAccessory={<NoteListDropdown tags={[]} searchArguments={searchArguments} />}
    >
      {paginatedSearchedNotes.map((note) => (
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
