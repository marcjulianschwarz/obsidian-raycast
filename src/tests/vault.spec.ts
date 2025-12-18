import { ObsidianVault } from "@/obsidian";
import { getVaultNameFromPath, getVaultsFromPreferences } from "@/obsidian/internal/obsidian";
import { getNotes, getExcludedFolders, getNoteFileContent } from "@/obsidian/internal/vault";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTempVault } from "./helpers/createTemporaryVault";
import fs from "fs";
import path from "path";

vi.mock("@raycast/api", () => ({
  getPreferenceValues: () => ({
    excludedFolders: "",
    configFileName: ".obsidian",
    vaultPath: "/Test/test/test/vaultname",
  }),
  Icon: { Video: "video", Microphone: "mic" },
  Cache: class MockCache {
    private storage = new Map<string, string>();
    has(key: string) {
      return this.storage.has(key);
    }
    get(key: string) {
      return this.storage.get(key);
    }
    set(key: string, value: string) {
      this.storage.set(key, value);
    }
    remove(key: string) {
      this.storage.delete(key);
    }
  },
}));

describe("vault", () => {
  let tempVaultData: {
    vault: ObsidianVault;
    cleanup: () => void;
    paths: Record<string, string>;
  };

  beforeEach(() => {
    tempVaultData = createTempVault();
  });

  afterEach(() => {
    if (tempVaultData) {
      tempVaultData.cleanup();
    }
  });

  describe("getVaultNameFromPath", () => {
    it("should get vault name from path", () => {
      const vaultName = getVaultNameFromPath("/Test/test/test/vaultname");
      expect(vaultName).toBe("vaultname");
    });
  });

  describe("getExistingVaultsFromPreferences", () => {
    it("should  get exisitng vaults from preferences", () => {
      const vaults = getVaultsFromPreferences();
      console.log(vaults);
    });
  });

  describe("getNoteEntries", () => {
    it("should get note entries", async () => {
      const noteMetadataEntries = await getNotes(tempVaultData.vault.path);
      expect(noteMetadataEntries.length).toBe(2);
    });
  });

  describe("getExcludedFolders", () => {
    it("should return empty array when app.json does not exist", () => {
      const excludedFolders = getExcludedFolders(tempVaultData.vault.path, ".obsidian");
      expect(excludedFolders).toEqual([]);
    });

    it("should return excluded folders when app.json exists with userIgnoreFilters", () => {
      const appJsonPath = path.join(tempVaultData.vault.path, ".obsidian", "app.json");
      const appConfig = {
        userIgnoreFilters: ["Archive", "Templates", "Private"],
      };
      fs.writeFileSync(appJsonPath, JSON.stringify(appConfig, null, 2));

      const excludedFolders = getExcludedFolders(tempVaultData.vault.path, ".obsidian");
      expect(excludedFolders).toEqual(["Archive", "Templates", "Private"]);
    });

    it("should return empty array when app.json exists but userIgnoreFilters is missing", () => {
      const appJsonPath = path.join(tempVaultData.vault.path, ".obsidian", "app.json");
      const appConfig = {
        someOtherSetting: "value",
      };
      fs.writeFileSync(appJsonPath, JSON.stringify(appConfig, null, 2));

      const excludedFolders = getExcludedFolders(tempVaultData.vault.path, ".obsidian");
      expect(excludedFolders).toEqual([]);
    });

    it("should work with custom config file names", () => {
      const customConfigDir = ".config";
      fs.mkdirSync(path.join(tempVaultData.vault.path, customConfigDir), { recursive: true });

      const appJsonPath = path.join(tempVaultData.vault.path, customConfigDir, "app.json");
      const appConfig = {
        userIgnoreFilters: ["CustomFolder"],
      };
      fs.writeFileSync(appJsonPath, JSON.stringify(appConfig, null, 2));

      const excludedFolders = getExcludedFolders(tempVaultData.vault.path, customConfigDir);
      expect(excludedFolders).toEqual(["CustomFolder"]);
    });

    it("should handle empty userIgnoreFilters array", () => {
      const appJsonPath = path.join(tempVaultData.vault.path, ".obsidian", "app.json");
      const appConfig = {
        userIgnoreFilters: [],
      };
      fs.writeFileSync(appJsonPath, JSON.stringify(appConfig, null, 2));

      const excludedFolders = getExcludedFolders(tempVaultData.vault.path, ".obsidian");
      expect(excludedFolders).toEqual([]);
    });
  });

  describe("getNoteFileContent", () => {
    it("should read file content without filter", async () => {
      const testFilePath = path.join(tempVaultData.vault.path, "test-note.md");
      const testContent = "# Test Note\n\nThis is test content.";
      fs.writeFileSync(testFilePath, testContent);

      const content = await getNoteFileContent(testFilePath);
      expect(content).toBe(testContent);
    });

    it("should read file content with filter function", async () => {
      const testFilePath = path.join(tempVaultData.vault.path, "test-note-with-filter.md");
      const testContent = "# Test Note\n\nThis is test content with some words.";
      fs.writeFileSync(testFilePath, testContent);

      const filterFunc = (input: string) => input.toUpperCase();
      const content = await getNoteFileContent(testFilePath, filterFunc);
      expect(content).toBe(testContent.toUpperCase());
    });

    it("should handle empty file", async () => {
      const testFilePath = path.join(tempVaultData.vault.path, "empty-note.md");
      fs.writeFileSync(testFilePath, "");

      const content = await getNoteFileContent(testFilePath);
      expect(content).toBe("");
    });

    it("should handle file with special characters", async () => {
      const testFilePath = path.join(tempVaultData.vault.path, "special-chars.md");
      const testContent = "# Test\n\nSpecial chars: émoji 🎉, symbols ©®™, quotes 'test'";
      fs.writeFileSync(testFilePath, testContent);

      const content = await getNoteFileContent(testFilePath);
      expect(content).toBe(testContent);
    });

    it("should throw error for non-existent file", async () => {
      const nonExistentPath = path.join(tempVaultData.vault.path, "non-existent.md");

      await expect(getNoteFileContent(nonExistentPath)).rejects.toThrow();
    });
  });
});
