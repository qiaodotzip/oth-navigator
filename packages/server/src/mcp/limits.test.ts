import { describe, expect, it } from "vitest";
import { LIMITS, TokenLimits, callKinds } from "./limits";

const tool = (name: string) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } });

describe("callKinds", () => {
  it("reads for anything but a tool call, and for the read tools", () => {
    expect(callKinds({ jsonrpc: "2.0", id: 1, method: "initialize" })).toEqual(["read"]);
    expect(callKinds({ jsonrpc: "2.0", method: "notifications/initialized" })).toEqual(["read"]);
    expect(callKinds(tool("view_frame"))).toEqual(["read"]);
  });

  it("writes for every other tool, one added later included, and publishes for publish", () => {
    expect(callKinds([tool("update"), tool("made_up_later"), tool("publish")])).toEqual(["write", "write", "publish"]);
  });

  it("treats junk as a read", () => {
    expect(callKinds(null)).toEqual(["read"]);
    expect(callKinds("hello")).toEqual(["read"]);
  });
});

describe("TokenLimits", () => {
  const small = { ...LIMITS, readsPerMinute: 2, writesPerMinute: 1 };

  it("lets reads through up to the limit, then says how long to wait, and counts nothing refused", () => {
    const limits = new TokenLimits(small);
    expect(limits.admit("t", ["read"], 0)).toBeNull();
    expect(limits.admit("t", ["read"], 10_000)).toBeNull();
    expect(limits.admit("t", ["read"], 20_000)).toEqual({
      retryAfterS: 40,
      message: "Slow down: this token has read the map 2 times in the last minute. Wait 40 seconds, then carry on.",
    });
    // The read at 0 has left the window; the refused one at 20s never entered it.
    expect(limits.admit("t", ["read"], 60_000)).toBeNull();
    expect(limits.admit("t", ["read"], 60_001)).not.toBeNull();
  });

  it("counts writes apart from reads, and a publish as a write", () => {
    const limits = new TokenLimits(small);
    expect(limits.admit("t", ["write"], 0)).toBeNull();
    expect(limits.admit("t", ["read", "read"], 1)).toBeNull();
    expect(limits.admit("t", ["publish"], 2)).toMatchObject({
      message: "Slow down: this token has made 1 change in the last minute. Wait 60 seconds, then carry on.",
    });
  });

  it("keeps each token's counts apart", () => {
    const limits = new TokenLimits(small);
    expect(limits.admit("a", ["write"], 0)).toBeNull();
    expect(limits.admit("b", ["write"], 0)).toBeNull();
  });

  it("allows one publish in ten minutes, and gives the slot back when nothing was published", () => {
    const limits = new TokenLimits();
    expect(limits.claimPublish("t", 0)).toBe(true);
    expect(limits.claimPublish("t", 1_000)).toBe(false);
    expect(limits.admit("t", ["publish"], 1_000)).toEqual({
      retryAfterS: 599,
      message: "This token published less than ten minutes ago. Wait 599 seconds, then publish again.",
    });
    limits.releasePublish("t", 0);
    expect(limits.claimPublish("t", 2_000)).toBe(true);
    expect(limits.claimPublish("t", 2_000 + LIMITS.publishEveryMs)).toBe(true);
  });

  it("lets four requests run at once, and a fifth waits until one ends", () => {
    const limits = new TokenLimits();
    for (let i = 0; i < 4; i++) expect(limits.enter("t")).toBe(true);
    expect(limits.enter("t")).toBe(false);
    expect(limits.enter("other")).toBe(true);
    limits.leave("t");
    expect(limits.enter("t")).toBe(true);
  });
});
