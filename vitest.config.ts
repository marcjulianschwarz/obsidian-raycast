import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@raycast/api": path.resolve(__dirname, "./src/__mocks__/@raycast/api.ts"),
    },
  },
});
