import { List, getPreferenceValues } from "@raycast/api";
import { memo, useState, useEffect } from "react";
import { MAX_RENDERED_NOTES } from "../../utils/constants";
import { NoteListItem } from "./NoteListItem/NoteListItem";
import { NoteListDropdown } from "./NoteListDropdown";
import { SearchNotePreferences } from "../../utils/preferences";
import { CreateNoteView } from "./CreateNoteView";
import { filterNotesFuzzy } from "../../api/search/search.service";
import { searchNotesWithContent } from "../../api/search/simple-content-search.service";
import { SearchArguments } from "../../utils/interfaces";
import { Note } from "../../obsidian/notes";
import { ObsidianVault } from "../../obsidian/vault";

export interface NoteListProps {
  title?: string;
  vault: ObsidianVault;
  notes: Note[];
  isLoading?: boolean;
  searchArguments: SearchArguments;
  action?: (note: Note, vault: ObsidianVault) => React.ReactNode;
  onDelete?: (note: Note, vault: ObsidianVault) => void;
  onSearchChange?: (search: string) => void;
  onNoteUpdated?: (notePath: string, updates: Partial<Note>) => void;
}

const MemoizedNoteListItem = memo(NoteListItem);

export function NoteList(props: NoteListProps) {
  const { notes, vault, title, searchArguments, isLoading, onNoteUpdated } = props;

  const pref = getPreferenceValues<SearchNotePreferences>();
  const [inputText, setInputText] = useState(searchArguments.searchArgument || "");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [filteredNotes, setFilteredNotes] = useState<Note[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Search with or without content based on preference
  useEffect(() => {
    if (!inputText.trim()) {
      setFilteredNotes(notes.slice(0, MAX_RENDERED_NOTES));
      return;
    }

    // Debounce search
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        let results: Note[];
        if (pref.searchContent) {
          // Search title, path, AND content
          results = await searchNotesWithContent(notes, inputText);
        } else {
          // Search only title and path (fast)
          results = filterNotesFuzzy(notes, inputText);
        }
        setFilteredNotes(results.slice(0, MAX_RENDERED_NOTES));
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [notes, inputText, pref.searchContent]);

  if (filteredNotes.length === 0 && inputText.trim() !== "") {
    return <CreateNoteView title={title || ""} searchText={inputText} onSearchChange={setInputText} vault={vault} />;
  }

  return (
    <List
      isLoading={isLoading || isSearching}
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
