import { defineConfig } from "@playwright/test";

/**
 * The smoke test only (spec §14). One worker, one browser, in order: the
 * tests share a signed-in page and build on each other. No traces, videos,
 * screenshots or HTML report, since each could keep the team code as typed.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "smoke.spec.ts",
  outputDir: "test-results",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { trace: "off", video: "off", screenshot: "off" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
