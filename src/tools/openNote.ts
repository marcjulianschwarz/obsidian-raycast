import { open } from "@raycast/api";
import { getObsidianTarget, ObsidianTargetType } from "../utils/utils";

type Input = {
  /**
   * The FULL path of the note to open in Obsidian
   */
  notePath: string;

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
    path: input.notePath,
  });

  await open(target);

  return `Opened note "${input.notePath}"  in Obsidian.`;
}
