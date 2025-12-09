import { Detail } from "@raycast/api";
import { useMemo } from "react";
import { Vault } from "../api/vault/vault.types";
import { useNotes } from "../utils/hooks";
import { NoteQuickLook } from "./NoteQuickLook";

export function RandomNote(props: { vault: Vault; showTitle: boolean }) {
  const { vault, showTitle } = props;
  const { notes, loading: notesLoading } = useNotes(vault);

  const randomNote = useMemo(() => {
    if (!notesLoading && notes && notes.length > 0) {
      return notes[Math.floor(Math.random() * notes.length)];
    }
    return undefined;
  }, [notes, notesLoading]);

  if (notesLoading || !randomNote) {
    return <Detail isLoading={true} />;
  }

  return <NoteQuickLook note={randomNote} vault={vault} showTitle={showTitle} />;
}
