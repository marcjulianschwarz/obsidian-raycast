import YAML from "yaml";
import { Note } from "../api/vault/notes/notes.types";

import { CODE_BLOCK_REGEX, INLINE_TAGS_REGEX } from "./constants";
import { sortByAlphabet } from "./utils";
import { dbgYaml, j } from "../api/logger/debugger";

export function parsedYAMLFrontmatter(str: string) {
  // Non-greedy, start-anchored: match only the first frontmatter block
  const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---/m;
  const m = str.match(FM_RE);
  if (m) {
    try {
      // m[1] contains the YAML content without the fences
      return YAML.parse(m[1], { logLevel: "error" });
    } catch {
      //
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function yamlHas(yaml: any, property: string) {
  return Object.prototype.hasOwnProperty.call(yaml, property);
}

//--------------------------------------------------------------------------------
// Get certain properties from YAML frontmatter
//--------------------------------------------------------------------------------

export function yamlPropertyForString(str: string, property: string): string | undefined {
  const parsedYAML = parsedYAMLFrontmatter(str);
  if (parsedYAML) {
    if (yamlHas(parsedYAML, property)) {
      return parsedYAML[property];
    }
  }
}

//--------------------------------------------------------------------------------
// Get Tags for a list of notes from both inline tags and YAML frontmatter
//--------------------------------------------------------------------------------

function inlineTagsForNotes(notes: Note[]) {
  const foundTags = new Set<string>();
  for (const note of notes) {
    // Ignoring codeblocks to avoid matching hex color codes
    const cleanedContent = note.content.replaceAll(CODE_BLOCK_REGEX, "");
    const tags = [...cleanedContent.matchAll(INLINE_TAGS_REGEX)];
    for (const tag of tags) {
      foundTags.add(tag[1]);
    }
  }
  return Array.from(foundTags);
}

function yamlTagsForNotes(notes: Note[]) {
  const foundTags = new Set<string>();
  for (const note of notes) {
    const tags = yamlTagsForString(note.content);
    for (const tag of tags) {
      foundTags.add(tag);
    }
  }
  return Array.from(foundTags);
}

export function tagsForNotes(notes: Note[]) {
  const inline = inlineTagsForNotes(notes);
  const yaml = yamlTagsForNotes(notes);
  return normalizeDedupeSortTags([...inline, ...yaml]);
}

//--------------------------------------------------------------------------------
// Get Tags for a string from both inline tags and YAML frontmatter
//--------------------------------------------------------------------------------

export function inlineTagsForString(str: string) {
  const foundTags = new Set<string>();
  const tags = [...str.matchAll(INLINE_TAGS_REGEX)];
  for (const tag of tags) {
    foundTags.add(tag[1]);
  }
  const tagList = Array.from(foundTags);
  dbgYaml("inlineTagsForString foundTags:", j(tagList));
  return tagList;
}

export function yamlTagsForString(str: string) {
  let foundTags: string[] = [];
  const parsedYAML = parsedYAMLFrontmatter(str);
  if (parsedYAML) {
    const extracted = extractYamlTagValues(parsedYAML, "tags");
    if (extracted) {
      foundTags = extracted;
    }
  }
  foundTags = foundTags.filter((tag: string) => tag != "");
  dbgYaml("yamlTagsForString foundTags:", j(foundTags));
  return foundTags;
}

export function tagsForString(str: string) {
  const inline = inlineTagsForString(str);
  const yaml = yamlTagsForString(str);

  const sortedTags = normalizeDedupeSortTags([...inline, ...yaml]);

  dbgYaml("tagsForString merged and sorted tags:", j(sortedTags));
  return sortedTags;
}

//-----------------------------------------------------------------------------------

function normalizeDedupeSortTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => (typeof tag === "string" ? tag.replace(/^#/, "") : tag))
        // Remove empty strings or strings containing only whitespace
        .filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "")
    )
  ).sort(sortByAlphabet);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractYamlTagValues(yaml: any, property: string): string[] | undefined {
  const value = yaml[property];
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((tag) => (typeof tag === "string" ? tag.trim() : "")).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }
  return undefined;
}
