import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.{ts,tsx}"],
    // Node by default. Only the editor renders components, so only it needs a DOM.
    environment: "node",
    environmentMatchGlobs: [["packages/editor/**", "jsdom"]],
    setupFiles: ["packages/editor/src/testing/setup.ts"],
  },
});
