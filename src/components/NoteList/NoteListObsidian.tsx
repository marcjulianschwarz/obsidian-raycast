import React, { useEffect, useReducer } from "react";

import { NotesContext, NotesDispatchContext, useNotes } from "../../utils/hooks";
import { SearchArguments } from "../../utils/interfaces";
import { NoteList } from "./NoteList";
import { NoteReducer, NoteReducerActionType } from "../../utils/reducers";
import { Vault } from "../../api/vault/vault.types";

export const NoteListObsidian = function NoteListObsidian(props: {
  vault: Vault;
  showTitle: boolean;
  bookmarked?: boolean;
  searchArguments: SearchArguments;
}) {
  const { showTitle, vault, searchArguments, bookmarked } = props;

  const { notes: allNotes, loading } = useNotes(vault, bookmarked);
  const [currentViewNoteList, dispatch] = useReducer(NoteReducer, allNotes);

  // Keep reducer state in sync when the underlying notes change
  useEffect(() => {
    dispatch({ type: NoteReducerActionType.Set, payload: allNotes });
  }, [allNotes]);

  return (
    <NotesContext.Provider value={allNotes}>
      <NotesDispatchContext.Provider value={dispatch}>
        <NoteList
          title={showTitle ? `Search Note in ${vault.name}` : ""}
          notes={currentViewNoteList}
          vault={vault}
          searchArguments={searchArguments}
          isLoading={loading}
        />
      </NotesDispatchContext.Provider>
    </NotesContext.Provider>
  );
};
