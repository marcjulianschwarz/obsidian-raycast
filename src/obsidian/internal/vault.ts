import * as fs from "fs";
import * as fsAsync from "fs/promises";
import path from "path";
import { AUDIO_FILE_EXTENSIONS, VIDEO_FILE_EXTENSIONS } from "../../utils/constants";
import { Media } from "../../utils/interfaces";
import { getFilePaths } from "../../api/file/file.service";
import { Logger } from "../../api/logger/logger.service";
import { getBookmarkedNotePaths } from "./bookmarks";
import { Note } from "./notes";
import { FileReadError, safeReadFile } from "./utils";
import { err, ok, Result } from "neverthrow";

const logger: Logger = new Logger("Vaults");

export interface ObsidianVault {
  name: string;
  key: string;
  path: string;
}

export type GetMarkdownFilePathsWarning = FileReadError;

/**
 * Gets a list of folders that are ignored by the user inside of Obsidian
 * by reading the app.json file located in the vaults config folder (default .obsidian)
 * and returning the userIgnoreFilters values.
 */
export function getUserIgnoredFolders(vaultPath: string, configFileName: string): Result<string[], FileReadError> {
  logger.trace(getUserIgnoredFolders.name, { vaultPath, configFileName });
  const appJSONPath = path.join(vaultPath, configFileName, "app.json");
  const fileReadResult = safeReadFile(appJSONPath);
  if (fileReadResult.isErr()) return err(fileReadResult.error);

  // TODO: handle parsing errors
  const appJSON = JSON.parse(fileReadResult.value) as { userIgnoreFilters?: string[] };
  const userIgnoredFolders = appJSON.userIgnoreFilters || [];
  logger.info("Obsidian user ignored folders", { userIgnoredFolders });
  return ok(userIgnoredFolders);
}

export async function getNoteFileContent(path: string, filter?: (input: string) => string) {
  logger.trace(getNoteFileContent.name, { path, filter: Boolean(filter) });
  const content = await fsAsync.readFile(path, { encoding: "utf-8" });
  return filter ? filter(content) : content;
}

/** Gets a list of file paths for all media. */
async function getMediaFilePaths(vaultPath: string, configFileName: string, excludedFolders: string[]) {
  const files = await getFilePaths({
    path: vaultPath,
    excludedFolders,
    includedFileExtensions: [
      ...AUDIO_FILE_EXTENSIONS,
      ...VIDEO_FILE_EXTENSIONS,
      ".jpg",
      ".png",
      ".gif",
      ".mp4",
      ".pdf",
    ],
  });

  logger.info(`Got media files`, { vaultPath, fileCount: files.length });

  return files;
}

/** Gets media (images, pdfs, video, audio, etc.) for a given vault from disk. utils.useMedia() is the preferred way of loading media. */
export async function getMedia(vaultPath: string, configFileName: string, excludedFolders: string[]): Promise<Media[]> {
  logger.info("Loading Media Files");
  const medias: Media[] = [];
  const filePaths = await getMediaFilePaths(vaultPath, configFileName, excludedFolders);

  for (const filePath of filePaths) {
    const title = path.basename(filePath);

    const media: Media = {
      title,
      path: filePath,
    };
    medias.push(media);
  }
  return medias;
}

export async function getNotes(vaultPath: string, excludedFolders: string[] = []): Promise<Note[]> {
  const filePaths = await getFilePaths({
    path: vaultPath,
    excludedFolders,
    includedFileExtensions: [".md"],
  });

  const bookmarkedFilePaths = getBookmarkedNotePaths(vaultPath);
  const notes: Note[] = [];

  for (const filePath of filePaths) {
    const title = path.basename(filePath, path.extname(filePath));
    const relativePath = path.relative(vaultPath, filePath);

    notes.push({
      title: title,
      path: filePath,
      lastModified: fs.statSync(filePath).mtime,
      bookmarked: bookmarkedFilePaths.includes(relativePath),
    });
  }

  // Add canvas files in a second pass. Canvas specific changes can be made here
  const canvasFilePaths = await getFilePaths({
    path: vaultPath,
    excludedFolders,
    includedFileExtensions: [".canvas"],
  });

  for (const canvasFilePath of canvasFilePaths) {
    const title = path.basename(canvasFilePath, path.extname(canvasFilePath));
    const relativePath = path.relative(vaultPath, canvasFilePath);

    notes.push({
      title: title,
      path: canvasFilePath,
      lastModified: fs.statSync(canvasFilePath).mtime,
      bookmarked: bookmarkedFilePaths.includes(relativePath),
    });
  }

  logger.info(`Got total notes`, { vaultPath, fileCount: notes.length });

  return notes;
}
