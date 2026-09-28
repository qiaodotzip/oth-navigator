import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createPool } from "./client";

// A pool dials nothing until it is asked to query, so this address is never tried.
const NOWHERE = "postgres://oth:oth@127.0.0.1:1/oth";

describe("createPool", () => {
  it("survives an idle connection failing, and says so in a line", async () => {
    const log = vi.fn();
    const pool = createPool(NOWHERE, log);
    // pg hangs the whole client off the error; the log line must leave it out.
    const err = Object.assign(new Error("terminating connection due to administrator command"), {
      code: "57P01",
      client: { connection: { stream: "forty lines of it" } },
    });
    expect(() => pool.emit("error", err)).not.toThrow();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toMatch(/idle connection failed/);
    expect(log.mock.calls[0]?.[1]).toEqual({
      message: "terminating connection due to administrator command",
      code: "57P01",
    });
    await pool.end();
  });

  it("survives a connection failing while a query or transaction holds it", async () => {
    const pool = createPool(NOWHERE, vi.fn());
    // What the pool hands out: once checked out, it loses the pool's own listener.
    const client = new EventEmitter();
    pool.emit("connect", client);
    expect(() => client.emit("error", new Error("Connection terminated unexpectedly"))).not.toThrow();
    await pool.end();
  });
});
