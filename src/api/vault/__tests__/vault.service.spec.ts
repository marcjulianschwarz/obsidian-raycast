import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// --- Mocks -----------------------------------------------------------------

// Mock Raycast API preferences + icons
vi.mock("@raycast/api", () => {
  // Default prefs; tests will override with __setPreferences(...)
  let prefs: any = {
    // SearchNotePreferences
    excludedPatterns: "",
    // we store included patterns here (comma-separated)
    includedPatterns: "",
    // GlobalPreferences
    configFileName: ".obsidian",
    vaultPath: "", // not used by these tests
    removeYAML: false,
    removeLatex: false,
    removeLinks: false,
  };

  return {
    getPreferenceValues: vi.fn(() => prefs),
    // test helper to set/override preferences
    __setPreferences: (next: Record<string, any>) => {
      prefs = { ...prefs, ...next };
    },
    Icon: { Video: "video", Microphone: "microphone" },
  };
});

// Mock bookmarks (no note is bookmarked)
vi.mock("./notes/bookmarks/bookmarks.service", () => ({
  getBookmarkedNotePaths: vi.fn(() => [] as string[]),
}));

// --- Imports under test (after mocks) --------------------------------------
import { loadNotes } from "../vault.service";
import type { Vault } from "../vault.types";
// Pull in the test-only setter
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { __setPreferences } from "@raycast/api";

// --- Helpers ---------------------------------------------------------------

function makeTmpVault(): { dir: string; vault: Vault; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-"));
  const vault: Vault = { name: "tmp", key: dir, path: dir };
  const cleanup = () => {
    // best-effort recursive delete
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { dir, vault, cleanup };
}

function writeFile(p: string, content = "content") {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
}

function touchMd(dir: string, rel: string, content = "# title\n") {
  writeFile(path.join(dir, rel), content);
}

// Ensure stable defaults before each test
beforeEach(() => {
  __setPreferences({
    excludedPatterns: "",
    includedPatterns: "",
    configFileName: ".obsidian",
    removeYAML: false,
    removeLatex: false,
    removeLinks: false,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// --- Tests -----------------------------------------------------------------

describe("vault.service - include/exclude during loadNotes()", () => {
  it("excludes files matching a glob pattern anywhere (e.g., **/*_--Demo*)", async () => {
    const { dir, vault, cleanup } = makeTmpVault();
    try {
      // Arrange: create files
      touchMd(dir, "Keep.md");
      touchMd(dir, "Note_--Demo.md");
      touchMd(dir, "nested/Sub_--Demo.md");
      touchMd(dir, "nested/Deep/KeepToo.md");

      // Exclude any file with `_--Demo` in its name
      __setPreferences({
        excludedPatterns: "**/*_--Demo*",
        includedPatterns: "", // no include restriction
      });

      // Act
      const notes = await loadNotes(vault);
      const paths = notes.map((n) => path.relative(dir, n.path)).sort();

      // Assert: demo files are missing; the others are present
      expect(paths).toEqual(["Keep.md", path.join("nested", "Deep", "KeepToo.md")].sort());
    } finally {
      cleanup();
    }
  });

  it("includes only files matching include globs (e.g., notes/**) when include is set", async () => {
    const { dir, vault, cleanup } = makeTmpVault();
    try {
      // Arrange
      touchMd(dir, "notes/A.md");
      touchMd(dir, "notes/sub/B.md");
      touchMd(dir, "outside/C.md");

      // Only include the notes/** subtree
      __setPreferences({
        includedPatterns: "notes/**",
        excludedPatterns: "",
      });

      // Act
      const notes = await loadNotes(vault);
      const rel = notes.map((n) => path.relative(dir, n.path)).sort();

      // Assert: only the notes/** files are present
      expect(rel).toEqual(["notes/A.md", "notes/sub/B.md"].sort());
    } finally {
      cleanup();
    }
  });

  it("supports combined include + exclude where exclude wins", async () => {
    const { dir, vault, cleanup } = makeTmpVault();
    try {
      // Arrange
      touchMd(dir, "notes/Keep.md");
      touchMd(dir, "notes/Note_--Demo.md");
      touchMd(dir, "notes/sub/AlsoKeep.md");

      __setPreferences({
        includedPatterns: "notes/**",
        excludedPatterns: "**/*_--Demo*",
      });

      // Act
      const notes = await loadNotes(vault);
      const rel = notes.map((n) => path.relative(dir, n.path)).sort();

      // Assert: exclude removes the _--Demo file even though it’s under an included dir
      expect(rel).toEqual(["notes/Keep.md", "notes/sub/AlsoKeep.md"].sort());
    } finally {
      cleanup();
    }
  });

  it("traverses ancestors due to partial matching and still finds deep matches from include patterns", async () => {
    const { dir, vault, cleanup } = makeTmpVault();
    try {
      // Arrange
      touchMd(dir, "projects/app/README.md");
      touchMd(dir, "projects/app/docs/guide.md");
      touchMd(dir, "other/README.md");

      // Include only READMEs nested somewhere under projects/**
      __setPreferences({
        includedPatterns: "projects/**/README.md",
        excludedPatterns: "",
      });

      // Act
      const notes = await loadNotes(vault);
      const rel = notes.map((n) => path.relative(dir, n.path)).sort();

      // Assert: only projects/**/README.md is included
      expect(rel).toEqual(["projects/app/README.md"]);
    } finally {
      cleanup();
    }
  });

  it("respects DEFAULT_EXCLUDED_PATHS like .obsidian and ignores files inside", async () => {
    const { dir, vault, cleanup } = makeTmpVault();
    try {
      // Arrange
      // file in default-excluded dir
      touchMd(dir, ".obsidian/should-not-load.md");
      // a normal file
      touchMd(dir, "Root.md");

      __setPreferences({
        includedPatterns: "",
        excludedPatterns: "", // rely on DEFAULT_EXCLUDED_PATHS
        configFileName: ".obsidian",
      });

      // Act
      const notes = await loadNotes(vault);
      const rel = notes.map((n) => path.relative(dir, n.path));

      // Assert
      expect(rel).toContain("Root.md");
      expect(rel).not.toContain(path.join(".obsidian", "should-not-load.md"));
    } finally {
      cleanup();
    }
  });
});
