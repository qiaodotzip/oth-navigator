import { describe, expect, it, vi } from "vitest";
import { createPool } from "./client";

describe("createPool", () => {
  it("survives an idle connection failing, and says so", async () => {
    const log = vi.fn();
    // A pool dials nothing until it is asked to query, so this address is never tried.
    const pool = createPool("postgres://oth:oth@127.0.0.1:1/oth", log);
    expect(() => pool.emit("error", new Error("terminating connection due to administrator command"))).not.toThrow();
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/idle connection failed/), expect.any(Error));
    await pool.end();
  });
});
