import { ActionPanel, Detail } from "@raycast/api";
import { Note } from "../api/vault/notes/notes.types";
import { filterContent } from "../api/vault/vault.service";
import { Vault } from "../api/vault/vault.types";
import { NoteActions, OpenNoteActions } from "../utils/actions";
import { useNoteContent } from "../utils/hooks";

export function NoteQuickLook(props: { showTitle: boolean; note: Note; vault: Vault }) {
  const { note, showTitle, vault } = props;
  const { noteContent, isLoading } = useNoteContent(note);

  const markdownContent = noteContent === null ? "Failed to load note content." : filterContent(noteContent);

  return (
    <Detail
      isLoading={isLoading}
      navigationTitle={showTitle ? note.title : ""}
      markdown={markdownContent}
      actions={
        noteContent !== null ? (
          <ActionPanel>
            <OpenNoteActions note={{ content: noteContent, ...note }} vault={vault} />
            <NoteActions note={{ content: noteContent, ...note }} vault={vault} />
          </ActionPanel>
        ) : null
      }
    />
  );
}
