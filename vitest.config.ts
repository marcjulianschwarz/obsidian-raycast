import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true, // <-- add this so describe/it/expect are recognized
    include: ["src/**/*.{spec,test}.{ts,tsx}"], // <-- tells Vitest where to look for test files
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@raycast/api": path.resolve(__dirname, "./src/__mocks__/@raycast/api.ts"),
    },
  },
});