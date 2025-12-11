import { Tool } from "@raycast/api";
import { getVaultsFromPreferencesOrObsidianJson } from "../api/vault/vault.service";
import fs from "fs";
import { applyTemplates } from "../api/templating/templating.service";

type Input = {
  /**
   * The FULL path of the note to append text to
   */
  notePath: string;

  /**
   * The content to append
   */
  content: string;
  /**
   * Whether to prepend instead of append (default: false)
   */
  prepend?: boolean;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  const vaults = await getVaultsFromPreferencesOrObsidianJson();

  if (vaults.length === 0) {
    return {
      message: "No vaults found. Please configure vault paths in preferences.",
    };
  }

  return {
    message: `${input.prepend ? "Prepend" : "Append"} content to note "${input.notePath}"?`,
  };
};

/**
 * Append or prepend content to an existing note
 */
export default async function tool(input: Input) {
  const processedContent = await applyTemplates(input.content);

  // Append or prepend the content
  if (input.prepend) {
    const existingContent = fs.readFileSync(input.notePath, "utf8");
    fs.writeFileSync(input.notePath, processedContent + "\n" + existingContent);
  } else {
    fs.appendFileSync(input.notePath, "\n" + processedContent);
  }

  return `Successfully ${input.prepend ? "prepended" : "appended"} content to note "${input.notePath}"`;
}
