import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { searchNotesWithContent } from "../api/search/simple-content-search.service";
import { Note } from "../api/vault/notes/notes.types";
import fs from "fs";
import path from "path";
import os from "os";

describe("content search", () => {
  let tempDir: string;
  let testNotes: Note[];

  beforeEach(() => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "content-search-test-"));

    // Create test files
    fs.writeFileSync(path.join(tempDir, "note1.md"), "This is a note about programming");
    fs.writeFileSync(path.join(tempDir, "note2.md"), "Another note about cooking recipes");
    fs.writeFileSync(path.join(tempDir, "javascript.md"), "Content about typescript and javascript");
    fs.writeFileSync(path.join(tempDir, "hidden.md"), "This file has secret information inside");

    testNotes = [
      {
        title: "Note 1",
        path: path.join(tempDir, "note1.md"),
        lastModified: new Date(),
        bookmarked: false,
      },
      {
        title: "Note 2",
        path: path.join(tempDir, "note2.md"),
        lastModified: new Date(),
        bookmarked: false,
      },
      {
        title: "JavaScript Guide",
        path: path.join(tempDir, "javascript.md"),
        lastModified: new Date(),
        bookmarked: false,
      },
      {
        title: "Hidden",
        path: path.join(tempDir, "hidden.md"),
        lastModified: new Date(),
        bookmarked: false,
      },
    ];
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("searchNotesWithContent", () => {
    it("should find notes by title match", async () => {
      const results = await searchNotesWithContent(testNotes, "JavaScript");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((n) => n.title === "JavaScript Guide")).toBe(true);
    });

    it("should find notes by path match", async () => {
      const results = await searchNotesWithContent(testNotes, "javascript.md");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((n) => n.path.includes("javascript.md"))).toBe(true);
    });

    it("should find notes by content match", async () => {
      const results = await searchNotesWithContent(testNotes, "programming");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((n) => n.title === "Note 1")).toBe(true);
    });

    it("should find notes by content when title doesn't match", async () => {
      const results = await searchNotesWithContent(testNotes, "secret");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((n) => n.title === "Hidden")).toBe(true);
    });

    it("should return title/path matches first, then content matches", async () => {
      const results = await searchNotesWithContent(testNotes, "javascript");
      // JavaScript Guide should come before notes that only match in content
      const titleMatchIndex = results.findIndex((n) => n.title === "JavaScript Guide");
      expect(titleMatchIndex).toBe(0); // Should be first since it matches title
    });

    it("should handle case-insensitive content search", async () => {
      const results = await searchNotesWithContent(testNotes, "PROGRAMMING");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((n) => n.title === "Note 1")).toBe(true);
    });

    it("should return empty array for no matches", async () => {
      const results = await searchNotesWithContent(testNotes, "nonexistent");
      expect(results.length).toBe(0);
    });

    it("should return all notes for empty query", async () => {
      const results = await searchNotesWithContent(testNotes, "");
      expect(results.length).toBe(testNotes.length);
    });

    it("should handle notes with non-existent files gracefully", async () => {
      const notesWithMissing = [
        ...testNotes,
        {
          title: "Missing",
          path: path.join(tempDir, "nonexistent.md"),
          lastModified: new Date(),
          bookmarked: false,
        },
      ];

      const results = await searchNotesWithContent(notesWithMissing, "programming");
      expect(results.length).toBeGreaterThan(0);
      // Should still find other notes despite missing file
      expect(results.some((n) => n.title === "Note 1")).toBe(true);
    });

    it("should not duplicate results (title match should not also appear in content matches)", async () => {
      const results = await searchNotesWithContent(testNotes, "javascript");
      const paths = results.map((n) => n.path);
      const uniquePaths = new Set(paths);
      expect(paths.length).toBe(uniquePaths.size);
    });
  });
});
