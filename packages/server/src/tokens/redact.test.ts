import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import type { Database } from "../db/client";
import { redactError, redactSecrets } from "./redact";

/** Shaped like a token (43 characters after the prefix), made up for the test. */
const SECRET = `oth_pat_${"a1B2-_".repeat(7)}x`;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("redactSecrets", () => {
  it("hides a token wherever it appears, and whatever follows Bearer", () => {
    expect(redactSecrets(`Authorization: Bearer ${SECRET}`)).toBe("Authorization: Bearer [redacted]");
    expect(redactSecrets(`token=${SECRET}&x=1`)).toBe("token=oth_pat_[redacted]&x=1");
    expect(redactSecrets("bearer abc.def")).toBe("bearer [redacted]");
    expect(redactSecrets("nothing to hide")).toBe("nothing to hide");
  });
});

describe("redactError", () => {
  it("passes an error that holds no token through as itself", () => {
    const err = new Error("relation \"users\" does not exist");
    expect(redactError(err)).toBe(err);
  });

  it("copies an error that holds a token, hiding it in the message and the stack", () => {
    const err = new TypeError(`upstream refused ${SECRET}`);
    const out = redactError(err) as Error;
    expect(out).not.toBe(err);
    expect(out.name).toBe("TypeError");
    expect(out.message).toBe("upstream refused oth_pat_[redacted]");
    expect(out.stack ?? "").not.toContain(SECRET);
  });
});

describe("the server's error log", () => {
  it("never prints a token, even when an error quotes one", async () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      select: () => { throw new Error(`upstream refused Authorization: Bearer ${SECRET}`); },
    } as unknown as Database;
    const res = await createApp({ db: broken }).request("/api/auth/people");
    expect(res.status).toBe(500);
    const printed = logged.mock.calls.flat()
      .map(a => (a instanceof Error ? `${a.message}\n${a.stack ?? ""}` : String(a))).join("\n");
    expect(printed).toContain("[redacted]");
    expect(printed).not.toContain(SECRET);
  });
});
