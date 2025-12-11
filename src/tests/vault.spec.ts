import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getExistingVaultsFromPreferences, getNotes, getVaultNameFromPath } from "../api/vault/vault.service";
import { Vault } from "../api/vault/vault.types";
import { createTempVault } from "./helpers/createTemporaryVault";

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
    vault: Vault;
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
      const vaults = getExistingVaultsFromPreferences();
      console.log(vaults);
    });
  });

  describe("getNoteEntries", () => {
    it("should get note entries", async () => {
      const noteMetadataEntries = await getNotes(tempVaultData.vault);
      expect(noteMetadataEntries.length).toBe(2);
    });
  });
});
