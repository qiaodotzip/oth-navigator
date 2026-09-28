import { defineConfig } from "@playwright/test";

// A failed test's error-context.md holds the page as it stood, field values
// and all: on the gate page, that is the team code as it was set. Playwright
// leaves the page out of it when this is set. Set here, it reaches the
// workers too.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

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
