/**
 * Two projects, because the editor is the only package that renders components.
 * Everything else stays on the node environment with no DOM setup — which keeps
 * the model, server and renderer suites free of jsdom entirely.
 */
export default [
  {
    test: {
      name: "node",
      include: ["packages/{model,server,renderer}/src/**/*.test.ts"],
      environment: "node",
      // Server tests spin up a fresh PGlite database per test. That genuinely
      // takes seconds, and under full parallel load it exceeds the 10s default,
      // which made the suite fail at random rather than for cause.
      hookTimeout: 30_000,
      testTimeout: 20_000,
    },
  },
  {
    test: {
      name: "editor",
      include: ["packages/editor/src/**/*.test.{ts,tsx}"],
      environment: "jsdom",
      setupFiles: ["packages/editor/src/testing/setup.ts"],
    },
  },
];
