import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ConflictError } from "../api/client";
import { reportFailure, serverWords, worthRetrying } from "./failure";
import { useToasts } from "./toast";

beforeEach(() => useToasts.getState().clear());

const last = () => useToasts.getState().toasts.at(-1);

describe("worthRetrying", () => {
  it("retries what never arrived, and a server that fell over", () => {
    expect(worthRetrying(new TypeError("Failed to fetch"))).toBe(true);
    expect(worthRetrying(new ApiError(503, null))).toBe(true);
  });

  it("does not retry a refusal, which would only be refused again", () => {
    expect(worthRetrying(new ApiError(422, { error: "invalid entity" }))).toBe(false);
    expect(worthRetrying(new ConflictError(null, null))).toBe(false);
  });
});

describe("serverWords", () => {
  it("is what the server said, when it said something", () => {
    expect(serverWords(new ApiError(422, { error: "not a PNG or JPEG file" }))).toBe("not a PNG or JPEG file");
    expect(serverWords(new ApiError(500, null))).toBeNull();
    expect(serverWords(new Error("boom"))).toBeNull();
  });
});

describe("reportFailure", () => {
  it("offers Retry when the connection failed, and Retry tries again", async () => {
    const retry = vi.fn();
    reportFailure(new TypeError("Failed to fetch"), { doing: "save your change", retry });
    expect(last()).toMatchObject({
      tone: "error",
      message: "Couldn't save your change. Check your connection, then retry.",
      action: { label: "Retry" },
    });
    await last()!.action!.run();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("blames the server, not the connection, for a 5xx", () => {
    reportFailure(new ApiError(500, null), { doing: "save your change", retry: vi.fn() });
    expect(last()!.message).toMatch(/server had a problem/i);
    expect(last()!.action?.label).toBe("Retry");
  });

  it("gives a refusal in the server's own words, with nothing to retry", () => {
    reportFailure(new ApiError(422, { error: "not a PNG or JPEG file." }), { doing: "add notes.txt", retry: vi.fn() });
    expect(last()).toMatchObject({ tone: "error", message: "Couldn't add notes.txt: not a PNG or JPEG file." });
    expect(last()!.action).toBeUndefined();
  });

  it("says a teammate got there first on a conflict", () => {
    reportFailure(new ConflictError({ version: 4 }, null), { doing: "move the plan" });
    expect(last()!.message).toMatch(/someone changed it since/i);
  });

  it("says nothing on a 401: the session-ended dialog is the message", () => {
    reportFailure(new ApiError(401, null), { doing: "save your change", retry: vi.fn() });
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});
