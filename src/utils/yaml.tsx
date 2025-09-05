import YAML from "yaml";
import { Note } from "../api/vault/notes/notes.types";

import { CODE_BLOCK_REGEX, INLINE_TAGS_REGEX, YAML_FRONTMATTER_REGEX } from "./constants";
import { sortByAlphabet } from "./utils";
import { dbgYaml, j } from "./debugging/debugger";

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
  if (Object.prototype.hasOwnProperty.call(yaml, property)) {
    if (yaml[property]) {
      return true;
    }
  }
  return false;
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
  const foundTags: string[] = [];
  for (const note of notes) {
    // Ignoring codeblocks to avoid matching hex color codes
    const cleanedContent = note.content.replaceAll(CODE_BLOCK_REGEX, "");
    const tags = [...cleanedContent.matchAll(INLINE_TAGS_REGEX)];
    for (const tag of tags) {
      if (!foundTags.includes(tag[1])) {
        foundTags.push(tag[1]);
      }
    }
  }
  return foundTags;
}

function yamlTagsForNotes(notes: Note[]) {
  const foundTags: string[] = [];
  for (const note of notes) {
    const tags = yamlTagsForString(note.content);
    for (const tag of tags) {
      if (!foundTags.includes(tag)) {
        foundTags.push(tag);
      }
    }
  }
  return foundTags;
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
  const foundTags: string[] = [];
  const tags = [...str.matchAll(INLINE_TAGS_REGEX)];
  for (const tag of tags) {
    if (!foundTags.includes(tag[1])) {
      foundTags.push(tag[1]);
    }
  }
  dbgYaml("inlineTagsForString foundTags:", j(foundTags));
  return foundTags;
}

export function yamlTagsForString(str: string) {
  let foundTags: string[] = [];
  const parsedYAML = parsedYAMLFrontmatter(str);
  if (parsedYAML) {
    if (yamlHas(parsedYAML, "tag")) {
      if (Array.isArray(parsedYAML.tag)) {
        foundTags = [...parsedYAML.tag];
      } else if (typeof parsedYAML.tag === "string") {
        foundTags = [...parsedYAML.tag.split(",").map((tag: string) => tag.trim())];
      }
    } else if (yamlHas(parsedYAML, "tags")) {
      if (Array.isArray(parsedYAML.tags)) {
        foundTags = [...parsedYAML.tags];
      } else if (typeof parsedYAML.tags === "string") {
        foundTags = [...parsedYAML.tags.split(",").map((tag: string) => tag.trim())];
      }
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