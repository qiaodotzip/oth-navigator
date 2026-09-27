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

// Before positioning anything, Floating UI (which every Radix Popover goes
// through) asks each element `.matches(':modal')` and `.matches(':popover-open')`
// to see whether it sits in the browser's "top layer". A real browser answers
// that in well under a millisecond. jsdom's selector engine (nwsapi) does not
// have a fast path for either pseudo-class, falls back to compiling a matcher
// for it from scratch on every single call, and that compile step gets slower
// each time it runs — a few hundred milliseconds on the first call, growing
// unboundedly from there. Radix repositions on open and on every layout pass,
// so a handful of calls compounds into minutes, which reads as a hung test
// rather than a slow one.
//
// Neither pseudo-class can ever be true for anything our tests render — that
// would need a native <dialog> shown with showModal(), or an element with a
// `popover` attribute the Popover API has opened, and nothing in this app
// uses either. So this answers exactly what a real browser would, just
// without paying jsdom's runaway cost to get there.
const nativeMatches = Element.prototype.matches;
Element.prototype.matches = function (selector: string) {
  if (selector === ":modal" || selector === ":popover-open") return false;
  return nativeMatches.call(this, selector);
};
