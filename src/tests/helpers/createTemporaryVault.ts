import fs from "fs";
import os from "os";
import path from "path";
import { Vault } from "../../api/vault/vault.types";

/** Builds a throw-away Obsidian vault on the local tmp dir and returns the Vault
 *  object together with a cleanup callback that erases the folder again. */
export function createTempVault(): { vault: Vault; cleanup: () => void; paths: Record<string, string> } {
  const vaultRoot = path.join(os.tmpdir(), `obsidian-vault-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // Basic vault structure
  fs.mkdirSync(vaultRoot, { recursive: true });
  fs.mkdirSync(path.join(vaultRoot, "Folder1"), { recursive: true });
  fs.mkdirSync(path.join(vaultRoot, ".obsidian"), { recursive: true });
  fs.mkdirSync(path.join(vaultRoot, "media"), { recursive: true });

  // Notes
  const note1Path = path.join(vaultRoot, "note1.md");
  const note2Path = path.join(vaultRoot, "Folder1", "note2.md");
  fs.writeFileSync(note1Path, "# Note 1\nSome text.");
  fs.writeFileSync(note2Path, "# Note 2\nSome more text.");

  // Media
  const media1Path = path.join(vaultRoot, "media.jpg");
  fs.writeFileSync(media1Path, "");

  const vault: Vault = { name: "Temp Vault", key: vaultRoot, path: vaultRoot };
  const cleanup = () => fs.rmSync(vaultRoot, { recursive: true, force: true });

  return { vault, cleanup, paths: { note1Path, note2Path, media1Path } };
}
