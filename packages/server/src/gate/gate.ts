import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app";
import { MCP_PATH } from "../tokens/bearer";
import { gatePage } from "./page";

export const GATE_COOKIE = "oth_gate";

/** A year: typed once per browser (spec §13). Changing TEAM_CODE ends every one at once. */
const GATE_COOKIE_MAX_AGE_S = 365 * 24 * 3600;

/**
 * The gate's form is a code and a path of at most 2000 characters, a few KB
 * encoded. It is the one body anyone can send without the code, so a larger
 * one is turned away before it is read into memory.
 */
export const GATE_FORM_MAX_BYTES = 16 * 1024;

/**
 * Wrong codes allowed across the whole server in any window. At this pace an
 * eight-letter code would take centuries to guess; a team of six mistyping
 * now and then never meets it.
 */
export const WRONG_CODE_LIMIT = { max: 20, windowMs: 15 * 60_000 };

export const WRONG_CODE = "That isn't the team code. Check it and try again.";
export const TOO_MANY = "Too many wrong codes. Wait 15 minutes, then try again.";
export const TOO_LARGE = "That form is too large. Check the code and try again.";

/** What an API call gets without the code. `gate` tells the editor this is not a signed-out session. */
export const GATE_REFUSAL = { error: "Enter the team code first: reload the page.", gate: true };

/**
 * Every answer that is the team-code page. It needs nothing but its own inline
 * style and its own form, so it is allowed nothing else, and it is never shown
 * in another site's frame, where the code could be typed into a disguise.
 */
const PAGE_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "x-frame-options": "DENY",
};

/** Deployed, the page also tells the browser to come back only over HTTPS for a year, before any code is typed. */
const DEPLOYED_PAGE_HEADERS = { ...PAGE_HEADERS, "strict-transport-security": "max-age=31536000" };

/** Where in DATA_DIR the gate's key is kept. On Railway that is the volume, so it outlives a deploy. */
export const GATE_KEY_FILE = "gate.key";
const GATE_KEY_BYTES = 32;

/**
 * The server's own secret for the gate cookie: made on first boot, then read
 * on every boot after, so a deploy keeps everyone through the gate. The repo
 * is public, so a pass made from the code alone could be computed for every
 * guess and tried against the cookie check, which no limit slows. A file that
 * is not a whole key is replaced, which only asks everyone for the code again.
 *
 * Anything else that stops it being read or written is thrown, with what to
 * do next, and never the key: the server must stop rather than make up a key
 * that would last only until the next restart and hide a missing volume.
 */
export async function loadGateKey(dataDir: string): Promise<Buffer> {
  const path = join(dataDir, GATE_KEY_FILE);
  try {
    const kept = await readFile(path).catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return null;
      throw err;
    });
    if (kept?.length === GATE_KEY_BYTES) {
      // Closed up on every boot: a key copied in by hand, or left by an older
      // server, may be readable by others.
      await chmod(path, 0o600);
      return kept;
    }
    const key = randomBytes(GATE_KEY_BYTES);
    await mkdir(dataDir, { recursive: true });
    // Written whole to a new private file, then renamed over: never readable by
    // others even for a moment, and a crash mid-write leaves no part of a key.
    const temp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      await writeFile(temp, key, { mode: 0o600, flag: "wx" });
      await rename(temp, path);
    } finally {
      await rm(temp, { force: true });
    }
    return key;
  } catch (err) {
    const reason = (err as NodeJS.ErrnoException).code ?? "unknown error";
    throw new Error(
      `The team gate's key at ${path} could not be read or written (${reason}). ` +
      "Check that DATA_DIR points at the mounted volume and that the server can write to it, then redeploy.",
    );
  }
}

/**
 * What the cookie holds: proof of the code, never the code. It is the
 * server's key over the code, so no one without the key can make one, and a
 * new code turns every old cookie away with no list of cookies to revoke.
 */
export function gateToken(key: Buffer, code: string): string {
  return createHmac("sha256", key).update(code).digest("base64url");
}

/** Constant time whatever the lengths: both sides are hashed to 32 bytes first. */
export function codeMatches(typed: string, code: string): boolean {
  const a = createHash("sha256").update(typed.trim()).digest();
  const b = createHash("sha256").update(code).digest();
  return timingSafeEqual(a, b);
}

/**
 * Compared as bytes, not characters: the cookie arrives URL-decoded, so one
 * as long as the token can still be longer in bytes, and timingSafeEqual
 * throws on buffers of different lengths rather than saying no.
 */
function holdsPass(cookie: string | undefined, token: Buffer): boolean {
  if (!cookie) return false;
  const given = Buffer.from(cookie);
  return given.length === token.length && timingSafeEqual(given, token);
}

/**
 * Where to go once the code is right: a path on this site, and nothing
 * else. Another host, `//host`, a header-splitting newline, or an API route
 * whose JSON would be a dead end all go home instead. So does any control
 * character: a browser drops tabs and newlines from the address it is sent
 * to, so "/<tab>/host" would be followed as "//host".
 */
export function safeNext(raw: string): string {
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (/[\x00-\x1f\x7f]/.test(raw) || raw.length > 2000) return "/";
  if (raw === "/api" || raw.startsWith("/api/")) return "/";
  return raw;
}

/**
 * Wrong codes across the whole server, in a sliding window. The count is
 * global rather than per address because the forwarded-for header can be
 * written by the caller. A flood locks out new browsers for the window, but a
 * browser already through is never asked again.
 */
export class WrongCodes {
  private times: number[] = [];

  constructor(private readonly limit: { max: number; windowMs: number } = WRONG_CODE_LIMIT) {}

  blocked(now: number): boolean {
    this.times = this.times.filter(t => now - t < this.limit.windowMs);
    return this.times.length >= this.limit.max;
  }

  record(now: number): void {
    this.times.push(now);
  }
}

/**
 * The one way past the gate that is not the cookie (spec §6.2): Claude Code
 * calling the map's MCP endpoint with a personal token. The /mcp route
 * checks the token itself, gate or no gate. This only decides which
 * requests reach it without the cookie.
 *
 * - Exactly /mcp, on the parsed pathname. Hono routes "/%6Dcp" to /mcp as
 *   well, but its pathname is not "/mcp", so it still meets the gate.
 * - POST for the calls. GET too, but only so the client's request for an
 *   event stream gets the route's 405: from the gate, a 401 there reads to
 *   a client that knows OAuth as "sign in first".
 * - Never with an Origin header. Browsers send one and Claude Code does not.
 */
export function claudeCodeCall(req: Request): boolean {
  if (req.method !== "POST" && req.method !== "GET") return false;
  if (req.headers.has("origin")) return false;
  if (!/^Bearer\s+\S/i.test(req.headers.get("authorization") ?? "")) return false;
  return new URL(req.url).pathname === MCP_PATH;
}

/**
 * The shared team code in front of the app (spec §13): `guard` goes before
 * every route, `routes` answers the form at `/api/gate`. `key` is the one
 * loadGateKey keeps.
 */
export function teamGate(code: string, options: { key: Buffer; secure: boolean; now?: () => number }) {
  const token = gateToken(options.key, code);
  const tokenBytes = Buffer.from(token);
  const wrong = new WrongCodes();
  const now = options.now ?? Date.now;
  const noStore = { "cache-control": "no-store" };
  // Secure means served over HTTPS, which is what HSTS pins the browser to.
  const pageHeaders = options.secure ? DEPLOYED_PAGE_HEADERS : PAGE_HEADERS;

  const guard = createMiddleware<AppEnv>(async (c, next) => {
    const path = c.req.path;
    // Railway's health check, and the form's own answer, come before any code.
    if (path === "/api/health" || path === "/api/gate") return next();
    if (claudeCodeCall(c.req.raw)) return next();
    if (!holdsPass(getCookie(c, GATE_COOKIE), tokenBytes)) {
      if (path.startsWith("/api/")) return c.json(GATE_REFUSAL, 401, noStore);
      const url = new URL(c.req.url);
      return c.html(gatePage({ next: safeNext(url.pathname + url.search) }), 401, pageHeaders);
    }
    await next();
    // Behind the gate is for the team alone. A cache between here and the
    // browser, such as a CDN put in front one day, would hand anything marked
    // public, a floorplan included, to the next caller, cookie or none.
    const cache = c.res.headers.get("cache-control");
    if (cache && /\bpublic\b/i.test(cache)) {
      c.res.headers.set("cache-control", cache.replace(/\bpublic\b/i, "private"));
    }
  });

  const routes = new Hono<AppEnv>();

  const formLimit = bodyLimit({
    maxSize: GATE_FORM_MAX_BYTES,
    onError: c => c.html(gatePage({ next: "/", error: TOO_LARGE }), 413, pageHeaders),
  });

  routes.post("/", formLimit, async c => {
    const body: Record<string, unknown> = await c.req.parseBody().catch(() => ({}));
    const typed = typeof body.code === "string" ? body.code : "";
    const next = safeNext(typeof body.next === "string" ? body.next : "/");
    const at = now();
    // Refused unchecked while blocked, the right code too: otherwise a guess
    // that redirected would still say it was right.
    if (wrong.blocked(at)) return c.html(gatePage({ next, error: TOO_MANY }), 429, pageHeaders);
    if (!codeMatches(typed, code)) {
      wrong.record(at);
      return c.html(gatePage({ next, error: WRONG_CODE }), 401, pageHeaders);
    }
    setCookie(c, GATE_COOKIE, token, {
      httpOnly: true,
      secure: options.secure,
      sameSite: "Lax",
      path: "/",
      maxAge: GATE_COOKIE_MAX_AGE_S,
    });
    return c.redirect(next, 303);
  });

  // A reload of the refused form's address, or a bookmark of it: start again.
  routes.get("/", c => c.redirect("/", 303));

  return { guard, routes };
}
