import MiniSearch from "minisearch";
import * as path from "path";
import * as fsAsync from "fs/promises";
import { Logger } from "../../logger/logger.service";
import { getMarkdownFilePathsFromVault } from "../vault.service";
import { Vault } from "../vault.types";

const MINI_SEARCH_OPTIONS = {
  fields: ["name", "path", "content"],
  storeFields: [],
};

const logger = new Logger("Search");

export async function loadMiniSearchIndex(vault: Vault): Promise<MiniSearch> {
  logger.debug("Create new MiniSearch index");
  const filePaths = await getMarkdownFilePathsFromVault(vault);
  const miniSearch = new MiniSearch(MINI_SEARCH_OPTIONS);

  for (const filePath of filePaths) {
    const title = path.basename(filePath, path.extname(filePath));
    const relativePath = path.relative(vault.path, filePath);
    miniSearch.add({
      name: title,
      path: relativePath,
      // lastModified: fs.statSync(filePath).mtime,
      // bookmarked: bookmarkedFilePaths.includes(relativePath),
      content: await fsAsync.readFile(filePath, { encoding: "utf-8" }),
      id: relativePath,
    });
  }
  return miniSearch;
}

/** */
export async function filterNotes(input: string, vault: Vault) {
  const index = await loadMiniSearchIndex(vault);
  // const results = index.search(input);
  // return results.slice(0, 20).map((res) => res.id as string);
}
