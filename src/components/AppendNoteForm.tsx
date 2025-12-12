import { ActionPanel, Form, Action, useNavigation, showToast, Toast, getPreferenceValues } from "@raycast/api";
import fs from "fs";
import { SearchNotePreferences } from "../utils/preferences";
import { applyTemplates } from "../api/templating/templating.service";
import { updateNoteInCache } from "../api/cache/cache.service";
import { Note } from "../obsidian/notes";
import { ObsidianVault } from "../obsidian/vault";

interface FormValue {
  content: string;
}

export function AppendNoteForm(props: {
  note: Note;
  vault: ObsidianVault;
  onNoteUpdated?: (notePath: string, updates: Partial<Note>) => void;
}) {
  const { note, vault, onNoteUpdated } = props;
  const { pop } = useNavigation();

  const { appendTemplate } = getPreferenceValues<SearchNotePreferences>();

  async function addTextToNote(text: FormValue) {
    const content = await applyTemplates(text.content);
    fs.appendFileSync(note.path, "\n" + content);

    // Update cache and notify parent
    const stats = fs.statSync(note.path);
    const updates = { lastModified: stats.mtime };
    updateNoteInCache(vault.path, note.path, updates);
    onNoteUpdated?.(note.path, updates);

    showToast({ title: "Added text to note", style: Toast.Style.Success });
    pop();
  }

  return (
    <Form
      navigationTitle={"Add text to: " + note.title}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Submit" onSubmit={addTextToNote} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        title={"Add text to:\n" + note.title}
        id="content"
        placeholder={"Text"}
        defaultValue={appendTemplate}
      />
    </Form>
  );
}
