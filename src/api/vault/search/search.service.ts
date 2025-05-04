import MiniSearch from "minisearch";
import * as path from "path";
import * as fsAsync from "fs/promises";
import pako from "pako";
import { Logger } from "../../logger/logger.service";
import { getMarkdownFilePathsFromVault } from "../vault.service";
import { Vault } from "../vault.types";

const MINI_SEARCH_OPTIONS = {
  fields: ["name", "path", "content"],
  storeFields: [],
};

const logger = new Logger("Search");
const indexPath =
  "/Users/marcjulianschwarz/Mac/GitHub/marcjulianschwarz/obsidian-raycast/src/api/vault/search/index.json.gz";

export async function loadMiniSearchIndex(vault: Vault): Promise<MiniSearch> {
  const index = await loadMiniSearchIndexFromDisk();
  if (index) return index;

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
  await saveMiniSearchIndexToDisk(miniSearch);
  return miniSearch;
}

export async function saveMiniSearchIndexToDisk(index: MiniSearch) {
  logger.debug("Starting index serialization...");
  const jsonString = JSON.stringify(index.toJSON()); // Use .toJSON()
  logger.debug(`Serialized index size: ${Math.round(jsonString.length / 1024)} KB`);

  logger.debug("Compressing index...");
  const compressedData = pako.deflate(jsonString); // Use pako.deflate
  logger.debug(`Compressed index size: ${Math.round(compressedData.length / 1024)} KB`);

  // await ensureIndexPathDir(); // Ensure directory exists

  logger.debug(`Writing compressed index to ${indexPath}...`);
  try {
    await fsAsync.writeFile(indexPath, compressedData); // Write compressed data directly
    logger.debug("Finished writing index.");
  } catch (error) {
    logger.error("Error writing index:");
    throw error; // Re-throw error
  }
}

export async function loadMiniSearchIndexFromDisk(): Promise<MiniSearch | null> {
  try {
    await fsAsync.stat(indexPath);
  } catch (e) {
    return null; // File doesn't exist
  }

  logger.info("Loading compressed index from disk...");
  try {
    const a = performance.now();
    const compressedData = await fsAsync.readFile(indexPath); // Read compressed data
    logger.info(`Read ${Math.round(compressedData.length / 1024)} KB compressed data.`);

    logger.info("Decompressing index...");
    const jsonString = pako.inflate(compressedData, { to: "string" }); // Decompress
    logger.info(`Decompressed index size: ${Math.round(jsonString.length / 1024)} KB`);
    const b = performance.now();
    logger.success(b - a);

    logger.info("Parsing index JSON...");
    const aa = performance.now();
    // Pass the options used during creation!
    const index = MiniSearch.loadJSON(jsonString, MINI_SEARCH_OPTIONS);
    const bb = performance.now();
    logger.info("index load");
    logger.success(bb - aa);
    logger.info("Index loaded and parsed successfully.");
    return index;
  } catch (error) {
    logger.error("Error loading or processing index from disk:");
    // Consider deleting the corrupt file here?
    // await fsAsync.unlink(indexPath).catch(e => logger.error("Failed to delete corrupt index", e));
    return null;
  }
}
