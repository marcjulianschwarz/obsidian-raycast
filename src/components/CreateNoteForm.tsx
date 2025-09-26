import { ActionPanel, Form, Action, getPreferenceValues, Keyboard, popToRoot, closeMainWindow, Clipboard, showHUD } from "@raycast/api";
import { renewCache } from "../api/cache/cache.service";
import { parseFolderActionsPreferences, parseTagsPreferences } from "../api/preferences/preferences.service";
import { createNote } from "../api/vault/notes/notes.service";
import { CreateNoteParams } from "../api/vault/notes/notes.types";
import { Vault } from "../api/vault/vault.types";
import { NoteFormPreferences } from "../utils/preferences";
import { useMemo } from "react";
import { getAllFolderPaths } from "../utils/folderPaths";
import { useNotes } from "../utils/hooks";
import { useState } from "react";
import { tagsForNotes } from "../utils/yaml";
import { dbgCNF } from "../api/logger/debugger";

export function CreateNoteForm(props: { vault: Vault; showTitle: boolean }) {
  const { vault, showTitle } = props;

  const pref = getPreferenceValues<NoteFormPreferences>();  const { folderActions, prefPath, prefEnableJDex, defaultKeys, defaultTags } = pref;
  const showJDex = !!prefEnableJDex;

  const defaultTagsArray = useMemo(() => {
    if (!(pref.fillFormWithDefaults && defaultTags)) return [];
    return defaultTags.split(",").map((tag) => tag.trim()).filter(Boolean);
  }, [defaultTags, pref.fillFormWithDefaults]);

  const folderActionTargets = useMemo(
    () => parseFolderActionsPreferences(folderActions || ""),
    [folderActions]
  );

  const [copyToClipboard, setCopyToClipboard] = useState(false);
  const { notes: allNotes } = useNotes(vault);

  const availableTags = useMemo(() => {
    if (!allNotes) return defaultTagsArray;
    return Array.from(new Set([...tagsForNotes(allNotes), ...defaultTagsArray]));
  }, [allNotes, defaultTagsArray]);

  const availableLocations = useMemo(() => {
    if (!allNotes) return [];
    return Array.from(new Set(allNotes.flatMap((note) => note.locations ?? [])));
  }, [allNotes]);

  const availableFolderPaths = useMemo(() => getAllFolderPaths(vault), [vault]);

  dbgCNF("Available tags:", availableTags);

  async function createNewNote(params: CreateNoteParams, path: string | undefined = undefined) {
    if (path !== undefined) {
      params.path = path;
    }

    params.availableTags = availableTags;
    params.allNotes = allNotes ?? [];

    const saved = await createNote(vault, params);
    if (saved) {
      renewCache(vault);
    }

    if (!saved) {
      dbgCNF("Note creation was cancelled.");
    } else {
      if (copyToClipboard && params.fullName) {
        await Clipboard.copy(params.fullName);
        await showHUD(`Title "${params.fullName}" copied to clipboard`);
      }
    }

    popToRoot();
    closeMainWindow();
  }

  return (
    <Form
      navigationTitle={showTitle ? "Create Note for " + vault.name : ""}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create" onSubmit={(props: CreateNoteParams) => createNewNote(props)} />
          {Array.isArray(folderActionTargets) && folderActionTargets.map((folder: string, index: number) => (
            <Action.SubmitForm
              title={"Create in " + folder}
              onSubmit={(props: CreateNoteParams) => createNewNote(props, folder)}
              key={index}
              shortcut={{ modifiers: ["shift", "cmd"], key: index.toString() as Keyboard.KeyEquivalent }}
            ></Action.SubmitForm>
          ))}
        </ActionPanel>
      }
    >
      {showJDex && (
        <Form.TextField
          title="JDex"
          id="jdex"
          placeholder="AC.ID"
        />
      )}
      <Form.TextField
        title="Name"
        id="name"
        placeholder="Name of note"
        defaultValue={pref.fillFormWithDefaults ? pref.prefNoteName : ""}
      />
      {showJDex && (
        <Form.Checkbox
          label="Copy title to clipboard"
          id="copytitle"
          defaultValue={false}
          onChange={setCopyToClipboard}
        />
      )}
      {availableFolderPaths.length > 0 && (
        <Form.Dropdown
          title="Path"
          id="path"
          defaultValue={prefPath && availableFolderPaths.includes(prefPath) ? prefPath : availableFolderPaths[0]}
          placeholder="Choose a folder"
        >
          {availableFolderPaths.map((fp) => (
            <Form.Dropdown.Item key={fp} value={fp} title={fp} />
          ))}
        </Form.Dropdown>
      )}
      {availableTags.length > 0 && (
        <Form.TagPicker id="tags" title="Tags" defaultValue={defaultTagsArray}>
          {availableTags.map((tag) => (
            <Form.TagPicker.Item value={tag} title={tag} key={tag} />
          ))}
        </Form.TagPicker>
      )}
      {showJDex && availableLocations.length > 0 && (
        <Form.TagPicker id="locations" title="Locations">
          {availableLocations.map((location) => (
            <Form.TagPicker.Item value={location} title={location} key={location} />
          ))}
        </Form.TagPicker>
      )}
      <Form.TextField
        title="YAML Keys"
        id="yamlKeys"
        defaultValue={pref.fillFormWithDefaults && defaultKeys ? defaultKeys : ""}
        placeholder="e.g, {key1,a b c} {key2,{x,y,z}} {key3,uvw}"
      />
      <Form.TextArea
        title="Content:"
        id="content"
        placeholder={"Text"}
        defaultValue={pref.fillFormWithDefaults ? pref.prefNoteContent ?? "" : ""}
        autoFocus={pref.focusContentArea}
      />
    </Form>
  );
}
