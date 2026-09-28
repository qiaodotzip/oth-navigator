import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { createTestDb, json } from "../testing/harness";
import {
  GATE_COOKIE, GATE_FORM_MAX_BYTES, GATE_REFUSAL, TOO_MANY, WRONG_CODE, WRONG_CODE_LIMIT, WrongCodes,
  codeMatches, gateToken, safeNext, teamGate,
} from "./gate";
import { escapeHtml } from "./page";

const CODE = "red kite hill";

async function gatedApp(teamCode: string | null = CODE) {
  return createApp({ db: await createTestDb(), teamCode });
}

/** What the team-code page's form sends. */
const form = (fields: Record<string, string>) => ({ method: "POST", body: new URLSearchParams(fields) });

describe("the team code gate", () => {
  it("serves only the health check to a browser without the code", async () => {
    const app = await gatedApp();
    expect((await app.request("/api/health")).status).toBe(200);

    // Not even the list of names: the gate comes before the sign-in.
    const people = await app.request("/api/auth/people");
    expect(people.status).toBe(401);
    expect(await json(people)).toMatchObject({ gate: true });

    const home = await app.request("/");
    expect(home.status).toBe(401);
    expect(home.headers.get("cache-control")).toBe("no-store");
    expect(await home.text()).toContain("Team code");

    // Nor the app's own code.
    expect((await app.request("/assets/index-abc123.js")).status).toBe(401);
  });

  it("is a page of its own: no script, and nothing else to fetch", async () => {
    const html = await (await (await gatedApp()).request("/")).text();
    expect(html).not.toMatch(/<script|<link|src=/);
  });

  it("remembers where you were going", async () => {
    const res = await (await gatedApp()).request("/floors/L1/survey?frame=kf_1&view=grid");
    expect(await res.text()).toContain('name="next" value="/floors/L1/survey?frame=kf_1&amp;view=grid"');
  });

  it("lets the right code in with a cookie that proves it without holding it", async () => {
    const app = await gatedApp();
    const res = await app.request("/api/gate", form({ code: CODE, next: "/floors/L1/survey" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/floors/L1/survey");

    const set = res.headers.get("set-cookie") ?? "";
    expect(set).toMatch(new RegExp(`^${GATE_COOKIE}=`));
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Lax");
    expect(set).toContain("Path=/");
    expect(set).toContain("Max-Age=31536000");
    expect(set).not.toContain(CODE);
    expect(set).not.toContain(encodeURIComponent(CODE));

    const cookie = set.split(";")[0]!;
    expect((await app.request("/api/auth/people", { headers: { cookie } })).status).toBe(200);
  });

  it("marks the cookie Secure when asked to, as production does", async () => {
    const { routes } = teamGate(CODE, { secure: true });
    const res = await routes.request("/", form({ code: CODE, next: "/" }));
    expect(res.headers.get("set-cookie")).toContain("Secure");
  });

  it("says a wrong code is wrong, and lets nobody in", async () => {
    const res = await (await gatedApp()).request("/api/gate", form({ code: "red kite hil", next: "/" }));
    expect(res.status).toBe(401);
    // As the page writes it: the apostrophe in "isn't" is escaped like any other text.
    expect(await res.text()).toContain(escapeHtml(WRONG_CODE));
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("after too many wrong codes, even the right one waits, so a guess is never confirmed", async () => {
    const app = await gatedApp();
    for (let i = 0; i < WRONG_CODE_LIMIT.max; i++) {
      expect((await app.request("/api/gate", form({ code: `guess ${i}`, next: "/" }))).status).toBe(401);
    }
    const res = await app.request("/api/gate", form({ code: CODE, next: "/" }));
    expect(res.status).toBe(429);
    expect(await res.text()).toContain(TOO_MANY);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("turns every old cookie away once the code is changed", async () => {
    const before = await gatedApp(CODE);
    const set = (await before.request("/api/gate", form({ code: CODE, next: "/" }))).headers.get("set-cookie") ?? "";
    const cookie = set.split(";")[0]!;
    const after = await gatedApp("amber fox meadow");
    expect((await after.request("/api/auth/people", { headers: { cookie } })).status).toBe(401);
  });

  it("escapes the address it writes back into the page", async () => {
    const res = await (await gatedApp()).request(
      "/api/gate", form({ code: "wrong", next: '/"><script>alert(1)</script>' }),
    );
    const html = await res.text();
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;");
  });

  it("sends a reload of the form's own address back to the start", async () => {
    const res = await (await gatedApp()).request("/api/gate");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
  });

  it("gates nothing without a team code, as in local development", async () => {
    const app = await gatedApp(null);
    expect((await app.request("/api/auth/people")).status).toBe(200);
    expect((await app.request("/api/gate", form({ code: CODE, next: "/" }))).status).toBe(404);
  });
});

describe("gate pieces", () => {
  it("returns only to a path on this site", () => {
    expect(safeNext("/floors/L1/survey?frame=kf_1")).toBe("/floors/L1/survey?frame=kf_1");
    for (const bad of [
      "https://evil.example", "//evil.example", "/\\evil.example", "floors", "",
      "/api/model", "/api", "/floors\r\nSet-Cookie: x=1", `/${"a".repeat(2001)}`,
    ]) {
      expect(safeNext(bad)).toBe("/");
    }
  });

  it("matches the code exactly, apart from spaces around it", () => {
    expect(codeMatches("red kite hill", CODE)).toBe(true);
    expect(codeMatches("  red kite hill ", CODE)).toBe(true);
    expect(codeMatches("Red kite hill", CODE)).toBe(false);
    expect(codeMatches("", CODE)).toBe(false);
  });

  it("makes a token that is stable for a code, differs between codes, and does not contain it", () => {
    expect(gateToken(CODE)).toBe(gateToken(CODE));
    expect(gateToken("amber fox meadow")).not.toBe(gateToken(CODE));
    expect(gateToken(CODE)).not.toContain("kite");
  });

  it("counts wrong codes in a sliding window", () => {
    const wrong = new WrongCodes({ max: 3, windowMs: 1000 });
    wrong.record(0);
    wrong.record(10);
    expect(wrong.blocked(20)).toBe(false);
    wrong.record(20);
    expect(wrong.blocked(30)).toBe(true);
    // The first two have aged out.
    expect(wrong.blocked(1015)).toBe(false);
  });
});

/** A built editor, so the static routes would serve these files if the gate let them. */
async function distWithBuild() {
  const dir = await mkdtemp(join(tmpdir(), "oth-gate-dist-"));
  await writeFile(join(dir, "index.html"), "<!doctype html><title>OTH Map Editor</title>");
  await mkdir(join(dir, "assets"), { recursive: true });
  await writeFile(join(dir, "assets", "index-abc123.js"), "console.log(1)");
  return dir;
}

async function passFor(app: ReturnType<typeof createApp>) {
  const set = (await app.request("/api/gate", form({ code: CODE, next: "/" }))).headers.get("set-cookie") ?? "";
  return set.split(";")[0]!;
}

describe("what the gate stands in front of", () => {
  it("serves its own page, not the built app, for the index, a client route and an asset", async () => {
    const app = createApp({ db: await createTestDb(), teamCode: CODE, editorDist: await distWithBuild() });
    for (const path of ["/", "/floors/L1/survey", "/assets/index-abc123.js"]) {
      const res = await app.request(path);
      expect(res.status).toBe(401);
      expect(res.headers.get("content-type")).toContain("text/html");
      const html = await res.text();
      expect(html).toContain("Team code");
      expect(html).not.toContain("OTH Map Editor");
      expect(html).not.toContain("console.log(1)");
    }
  });

  it("refuses uploads, floorplans, survey frames and published bundles to a call without the code", async () => {
    const app = await gatedApp();
    for (const [method, path] of [
      ["GET", "/api/published/v1/building.json"],
      ["GET", "/api/level-images/img_1/file"],
      ["GET", "/api/keyframes/kf_1/file"],
      ["GET", "/api/assets/asset_1/file"],
      ["POST", "/api/assets"],
      ["POST", "/api/level-images"],
      ["POST", "/api/auth/login"],
    ] as const) {
      const res = await app.request(path, { method });
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(await json(res)).toEqual(GATE_REFUSAL);
    }
  });

  it("opens only the exact addresses of the health check and the form", async () => {
    const app = await gatedApp();
    for (const path of ["/api/health/", "/api/healthz", "/api/gate/", "/api/gate/x"]) {
      expect((await app.request(path)).status, path).toBe(401);
    }
  });

  it("serves the app once the code is typed, and tells any cache between to keep it private", async () => {
    const app = createApp({ db: await createTestDb(), teamCode: CODE, editorDist: await distWithBuild() });
    const cookie = await passFor(app);
    const asset = await app.request("/assets/index-abc123.js", { headers: { cookie } });
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(await (await app.request("/", { headers: { cookie } })).text()).toContain("OTH Map Editor");
  });

  it("marks the cookie Secure in production, though TLS ends at Railway's proxy and the request arrives as http", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const app = await gatedApp();
      const res = await app.request("http://oth.internal/api/gate", form({ code: CODE, next: "/" }));
      expect(res.status).toBe(303);
      expect(res.headers.get("set-cookie")).toContain("Secure");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("the gate under attack", () => {
  it("turns away a forged cookie as long as the pass but different in bytes, rather than failing", async () => {
    // The cookie arrives URL-decoded, so this is one character longer in bytes than in length.
    const forged = encodeURIComponent(`é${"a".repeat(gateToken(CODE).length - 1)}`);
    const res = await (await gatedApp()).request("/api/auth/people", {
      headers: { cookie: `${GATE_COOKIE}=${forged}` },
    });
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual(GATE_REFUSAL);
  });

  it("never returns to an address a browser would read as another site", () => {
    // A browser drops tabs and newlines from a Location before following it,
    // so "/<tab>/evil.example" would be followed as "//evil.example".
    for (const bad of ["/\t/evil.example", "/\n/evil.example", "/\u0000", "/floors\u007f"]) {
      expect(safeNext(bad)).toBe("/");
    }
  });

  it("refuses a form too large to hold a code, without a cookie", async () => {
    const res = await (await gatedApp()).request(
      "/api/gate", form({ code: "x".repeat(GATE_FORM_MAX_BYTES), next: "/" }),
    );
    expect(res.status).toBe(413);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("writes nothing to the logs: not the code, a guess, or the pass", async () => {
    const app = await gatedApp();
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(level => vi.spyOn(console, level));
    try {
      const cookie = await passFor(app);
      await app.request("/api/gate", form({ code: "a wrong guess", next: "/" }));
      await app.request("/api/auth/people", { headers: { cookie } });
      await app.request("/api/auth/people");
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
