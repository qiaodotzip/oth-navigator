import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// Testing Library only auto-cleans when Vitest globals are on; they are not, so
// unmount explicitly or every render leaks into the next test.
afterEach(() => cleanup());

// Radix positions popovers with a ResizeObserver, which jsdom does not have.
// A test that needs real measurements stubs its own with vi.stubGlobal.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
