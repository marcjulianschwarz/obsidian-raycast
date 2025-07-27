import { confirmAlert, getPreferenceValues, getSelectedText, Icon, open, showToast, Toast } from "@raycast/api";
import { NoteFormPreferences, SearchNotePreferences } from "../../../utils/preferences";
import fs from "fs";
import { CodeBlock, CreateNoteParams, Note } from "./notes.types";
import { Vault } from "../vault.types";
import path from "path";
import { directoryCreationErrorToast, fileWriteErrorToast } from "../../../components/Toasts";
import { CODE_BLOCK_REGEX } from "../../../utils/constants";
import { applyTemplates } from "../../templating/templating.service";

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

export function getCodeBlocks(content: string): CodeBlock[] {
  const codeBlockMatches = content.matchAll(CODE_BLOCK_REGEX);
  const codeBlocks = [];
  for (const codeBlockMatch of codeBlockMatches) {
    const [, language, code] = codeBlockMatch;
    codeBlocks.push({ language, code });
  }
  return codeBlocks;
}

/**
 * Creates a note in the vault.
 * - Adds a YAML frontmatter
 * - applys templates to the content and name
 * - saves the note
 *
 * Can open the note in obsidian if the preference is set.
 *
 * @returns True if the note was created successfully
 */

export async function createNote(vault: Vault, params: CreateNoteParams) {
  const pref = getPreferenceValues<NoteFormPreferences>();
  const fillDefaults = !pref.fillFormWithDefaults && params.content.length == 0;

  let jdex = params.jdex;
  let name = params.name == "" ? pref.prefNoteName : params.name;
  let content = fillDefaults ? pref.prefNoteContent : params.content;
  let fullName = jdex ? `${jdex}_${name}` : name;
  let availableTags = params.availableTags;

  // Handle special case: exact match with "AC" (e.g., "12")
  if (jdex.match(/^\d{2}$/)) {
    const matchingNotes = (params.allNotes ?? [])
      .map((note) => path.basename(note.path, ".md"))
      .filter((noteName) => jdex && noteName.startsWith(jdex));

    
    let maxId = 10;
    for (const noteName of matchingNotes) {
      const numStr = noteName.substring(3, 5);
      const parsed = parseInt(numStr, 10);
      const id = isNaN(parsed) ? 0 : parsed;
      maxId = Math.max(maxId, id);
      console.log("→ maxId: ", noteName);
      console.log("→ maxId: ", maxId);
    }

    if (maxId > 99) {
      showToast({ title: "ID limit reached", message: "Cannot create more than 99 notes in this category.", style: Toast.Style.Failure });
      return false;
    }

    const newId = String(maxId + 1);
    fullName = `${jdex}.${newId}_${name}`;
    console.log("→ Generated new full name:", fullName);
  }

  const category = fullName.match(/^\d{2}/);

  console.log("Category:",category); // Debug
  if (category) {
    console.log("Category:",category); // Debug

    // Try to find a matching tag
    const matchingTag = availableTags?.find(
      tag => tag.startsWith(pref.jdexRootTag) && tag.includes(`/${category}_`)
    );

    console.log("Matching tag:",matchingTag);

    if (matchingTag) {
      console.log("→ Found matching tag:", matchingTag);
      console.log("→ Before pushing:", [...params.tags]);
      params.tags.unshift(matchingTag);
      console.log("→ After pushing:", [...params.tags]);
    } 
  }

  console.log(params.content);

  content = createObsidianProperties(params,pref) + content;
  content = await applyTemplates(content);
  fullName = await applyTemplates(fullName);

  params.fullName = fullName;

  const saved = await saveStringToDisk(vault.path, content, fullName, params.path);

  if (pref.openOnCreate) {
    const target = "obsidian://open?path=" + encodeURIComponent(path.join(vault.path, params.path, fullName + ".md"));
    if (saved) {
      setTimeout(() => {
        open(target);
      }, 2000);
    }
  }
  return saved;
}

/** Gets the Obsidian Properties YAML frontmatter for a list of tags */
/** Gets the Obsidian Properties YAML frontmatter for a list of tags */
function createObsidianProperties(params: CreateNoteParams, pref: NoteFormPreferences): string {
  const entries: [string, string[]][] = [
    ["tags", params.tags],
    ["locations", params.locations],
  ];

  let obsidianProperties = '---\n';
  obsidianProperties += parseDefaultYAMLKeys(pref.defaultKeys || "");

  for (const [key, values] of entries) {
    if (values.length > 0) {
      const quoted = values.map(value => `"${value}"`).join(",");
      obsidianProperties += `${key}: [${quoted}]\n`;
    }
  }

  obsidianProperties += '---\n\n';
  return obsidianProperties;
}

function parseDefaultYAMLKeys(input: string): string {
  // Replace escaped braces with placeholders
  const ESC_LBRACE = '__ESC_LBRACE__';
  const ESC_RBRACE = '__ESC_RBRACE__';
  const escapedInput = input
    .replace(/\\{/g, ESC_LBRACE)
    .replace(/\\}/g, ESC_RBRACE);

  const regex = /\{([^,]+),(\{[^}]*\}|[^}]+)\}/g;
  const lines: string[] = [];
  let match;

  while ((match = regex.exec(escapedInput)) !== null) {
    const key = match[1].trim();
    const valueRaw = match[2].trim();

    if (valueRaw.startsWith('{') && valueRaw.endsWith('}')) {
      const inner = valueRaw.slice(1, -1).split(',').map(v => `"${v.trim()}"`);
      lines.push(`${key}: [${inner.join(', ')}]`);
    } else {
      lines.push(`${key}: ${valueRaw}`);
    }
  }

  const escapedResult = lines.join('\n') + '\n';

  // Restore escaped braces
  const result = escapedResult
  .replace(new RegExp(ESC_LBRACE, 'g'), '{')
  .replace(new RegExp(ESC_RBRACE, 'g'), '}');

  // console.log("Parsed YAML keys input:", input);
  // console.log("Parsed YAML keys input escaped:", input);
  // console.log("Parsed YAML keys result escaped:", escapedResult);
  // console.log("Parsed YAML keys result:", result);

  return result;
}

/**
 * Saves a string to disk with filename name.
 *
 * @param content - The content of the note
 * @param name - The name of the note
 * @returns - True if the note was saved successfully
 */
async function saveStringToDisk(vaultPath: string, content: string, name: string, notePath: string) {
  const fullPath = path.join(vaultPath, notePath);

  if (fs.existsSync(path.join(fullPath, name + ".md"))) {
    if (
      await confirmAlert({
        title: "Override note",
        message: 'Are you sure you want to override the note: "' + name + '"?',
        icon: Icon.ExclamationMark,
      })
    ) {
      writeTextToMarkdownFile(fullPath, name, content);
      return true;
    }
    return false;
  } else {
    writeTextToMarkdownFile(fullPath, name, content);
    return true;
  }
}

/** Writes a text to a markdown file at filePath with a given fileName. */
function writeTextToMarkdownFile(filePath: string, fileName: string, text: string) {
  try {
    fs.mkdirSync(filePath, { recursive: true });
  } catch {
    directoryCreationErrorToast(filePath);
    return;
  }
  try {
    fs.writeFileSync(path.join(filePath, fileName + ".md"), text);
  } catch {
    fileWriteErrorToast(filePath, fileName);
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