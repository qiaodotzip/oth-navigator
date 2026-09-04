import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// Testing Library only auto-cleans when Vitest globals are on; they are not, so
// unmount explicitly or every render leaks into the next test.
afterEach(() => cleanup());
