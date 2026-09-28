import { describe, expect, it } from "vitest";
import { BadTokens, LIMITS, RefusedTokens, TokenLimits, callKinds } from "./limits";

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
    expect(limits.admit("t", ["publish"], 2)).toMatchObject({ retryAfterS: 60 });
  });

  it("says how long a write must wait, and that reads go on meanwhile, so Claude looks over its work rather than sleeping", () => {
    const limits = new TokenLimits(small);
    expect(limits.admit("t", ["write"], 0)).toBeNull();
    expect(limits.admit("t", ["write"], 15_000)).toEqual({
      retryAfterS: 45,
      message: "Slow down: this token has made 1 change in the last minute. Wait 45 seconds, then carry on. " +
        "Reads don't count: check your work with view_plan meanwhile.",
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

describe("BadTokens", () => {
  it("counts lookups still running, so a burst sent at once can't all reach the database", () => {
    const bad = new BadTokens({ max: 3, windowMs: 60_000 });
    bad.begin();
    bad.begin();
    expect(bad.blocked(0)).toBe(false);
    bad.begin();
    expect(bad.blocked(0)).toBe(true);
    // A lookup that found a real token gives its place back and records nothing.
    bad.end(false, 0);
    expect(bad.blocked(0)).toBe(false);
  });

  it("records only a token nobody made, and forgets it once the window has passed", () => {
    const bad = new BadTokens({ max: 1, windowMs: 60_000 });
    bad.begin();
    bad.end(true, 0);
    expect(bad.blocked(59_999)).toBe(true);
    expect(bad.blocked(60_000)).toBe(false);
  });
});

describe("RefusedTokens", () => {
  it("remembers a revoked or expired token for good, and a disabled person's for a minute", () => {
    const refused = new RefusedTokens();
    refused.add("r", "revoked", 0);
    refused.add("e", "expired", 0);
    refused.add("d", "disabled", 0);
    const tomorrow = 24 * 3600_000;
    expect(refused.get("r", tomorrow)).toBe("revoked");
    expect(refused.get("e", tomorrow)).toBe("expired");
    // A person can be enabled again, so their tokens are looked up again soon.
    expect(refused.get("d", 59_999)).toBe("disabled");
    expect(refused.get("d", 60_000)).toBeUndefined();
    expect(refused.get("never-seen", 0)).toBeUndefined();
  });

  it("keeps at most its limit, forgetting the oldest first", () => {
    const refused = new RefusedTokens(2);
    refused.add("a", "revoked", 0);
    refused.add("b", "revoked", 0);
    refused.add("c", "revoked", 0);
    expect(refused.get("a", 0)).toBeUndefined();
    expect(refused.get("b", 0)).toBe("revoked");
    expect(refused.get("c", 0)).toBe("revoked");
  });
});
