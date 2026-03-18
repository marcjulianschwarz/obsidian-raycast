import fs from "fs";
import { fromThrowable, Result } from "neverthrow";

export type FileReadError = "not-exists" | "permissions-wrong" | "other";

export function safeReadFile(filePath: string): Result<string, FileReadError> {
  return fromThrowable<() => string, FileReadError>(
    () => fs.readFileSync(filePath, "utf-8"),
    (error) => {
      // Check if it's a Node.js system error with a code property
      if (error && typeof error === "object" && "code" in error) {
        const nodeError = error as NodeJS.ErrnoException;

        if (nodeError.code === "ENOENT") {
          return "not-exists" as const;
        }

        if (nodeError.code === "EACCES" || nodeError.code === "EPERM") {
          return "permissions-wrong" as const;
        }
      }

      return "other" as const;
    }
  )();
}
