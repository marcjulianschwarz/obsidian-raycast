import { Logger } from "../api/logger/logger.service";
import { getNoteFileContent } from "../api/vault/vault.service";

type Input = {
  /**
   * The FULL absolute path to the note file.
   * IMPORTANT: Always specify the complete absolute path to the note file (e.g., /path/to/vault/folder/note.md).
   */
  fullNotePath: string;
};

const logger = new Logger("Tool ReadNote");

/**
 * Read the content of a specific note by its FULL absolute path.
 */
export default async function tool(input: Input) {
  try {
    const content = await getNoteFileContent(input.fullNotePath);
    let context = `The following is the content of the note ${input.fullNotePath}. Use this content to follow the users instructions.\n########START NOTE CONTENT ########\n\n`;
    context += `# ${input.fullNotePath
      .split("/")
      .pop()
      ?.replace(".md", "")}\n\n${content}\n\n######## END NOTE CONTENT ########`;

    logger.debug(context);
    return context;
  } catch (error) {
    logger.warning("Failed to read note at path: " + input.fullNotePath);
    return `Failed to read note at path "${input.fullNotePath}": ${error}`;
  }
}
