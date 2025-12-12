import { getPreferenceValues, getSelectedText, showToast, Toast } from "@raycast/api";
import { SearchNotePreferences } from "../utils/preferences";
import fs from "fs";
import path from "path";
import { applyTemplates } from "../api/templating/templating.service";

export interface Note {
  title: string;
  path: string;
  lastModified: Date;
  bookmarked: boolean;
}

export interface NoteWithContent extends Note {
  content: string;
}

export async function appendSelectedTextTo(note: Note) {
  let { appendSelectedTemplate } = getPreferenceValues<SearchNotePreferences>();

  appendSelectedTemplate = appendSelectedTemplate ? appendSelectedTemplate : "{content}";

  try {
    const selectedText = await getSelectedText();
    if (selectedText.trim() == "") {
      showToast({ title: "No text selected", message: "Make sure to select some text.", style: Toast.Style.Failure });
    } else {
      let content = appendSelectedTemplate.replaceAll("{content}", selectedText);
      content = await applyTemplates(content);
      fs.appendFileSync(note.path, "\n" + content);
      showToast({ title: "Added selected text to note", style: Toast.Style.Success });
      return true;
    }
  } catch {
    showToast({
      title: "Couldn't copy selected text",
      message: "Maybe you didn't select anything.",
      style: Toast.Style.Failure,
    });
  }
}

/** Gets the Obsidian Properties YAML frontmatter for a list of tags */
export function createProperties(tags: string[]): string {
  let obsidianProperties = "";
  if (tags.length > 0) {
    obsidianProperties = "---\ntags: [";
    for (let i = 0; i < tags.length - 1; i++) {
      obsidianProperties += '"' + tags[i] + '",';
    }
    obsidianProperties += '"' + tags[tags.length - 1] + '"]\n---\n';
  }

  return obsidianProperties;
}

/** Writes a text to a markdown file at filePath with a given fileName. */
export function writeMarkdown(
  filePath: string,
  fileName: string,
  text: string,
  onDirectoryCreationFailed?: (filePath: string) => void,
  onFileWriteFailed?: (filePath: string, fileName: string) => void
) {
  // First try creating the folder structure
  try {
    fs.mkdirSync(filePath, { recursive: true });
  } catch {
    onDirectoryCreationFailed?.(filePath);
    return;
  }

  // Then try writing the markdown file
  try {
    fs.writeFileSync(path.join(filePath, fileName + ".md"), text);
  } catch {
    onFileWriteFailed?.(filePath, fileName);
    return;
  }
  showToast({ title: "Note created", style: Toast.Style.Success });
}

export function isNote(note: Note | undefined): note is Note {
  return (note as Note) !== undefined;
}

export function deleteNote(note: Note) {
  if (!fs.existsSync(note.path)) {
    return;
  }
  fs.unlinkSync(note.path);
  showToast({ title: "Deleted Note", style: Toast.Style.Success });
  return true;
}
