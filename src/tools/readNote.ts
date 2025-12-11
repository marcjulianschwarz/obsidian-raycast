import { Logger } from "../api/logger/logger.service";
import { getNoteFileContent } from "../api/vault/vault.service";

type Input = {
  /**
   * The FULL path to the note file
   */
  notePath: string;
};

const logger = new Logger("Tool ReadNote");

/**
 * Read the content of a specific note by its FULL path.
 */
export default async function tool(input: Input) {
  try {
    const content = await getNoteFileContent(input.notePath);
    let context = `The following is the content of the note ${input.notePath}. Use this content to follow the users instructions.\n########START NOTE CONTENT ########\n\n`;
    context += `# ${input.notePath
      .split("/")
      .pop()
      ?.replace(".md", "")}\n\n${content}\n\n######## END NOTE CONTENT ########`;

    logger.debug(context);
    return context;
  } catch (error) {
    logger.warning("Failed to read note at path: " + input.notePath);
    return `Failed to read note at path "${input.notePath}": ${error}`;
  }
}
