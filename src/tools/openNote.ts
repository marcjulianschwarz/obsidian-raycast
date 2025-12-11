import { open } from "@raycast/api";
import { getObsidianTarget, ObsidianTargetType } from "../utils/utils";

type Input = {
  /**
   * The FULL absolute path of the note to open in Obsidian.
   * IMPORTANT: Always specify the complete absolute path to the note file (e.g., /path/to/vault/folder/note.md).
   */
  fullNotePath: string;

  /**
   * Specify whether the note should be opened in a new pane in Obsidian
   */
  openInNewPane?: boolean;
};

/**
 * Open a note in Obsidian
 */
export default async function tool(input: Input) {
  const target = getObsidianTarget({
    type: ObsidianTargetType.OpenPath,
    path: input.fullNotePath,
  });

  await open(target);

  return `Opened note "${input.fullNotePath}" in Obsidian.`;
}
