import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app";
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

/** What an API call gets without the code. `gate` tells the editor this is not a signed-out session. */
export const GATE_REFUSAL = { error: "Enter the team code first: reload the page.", gate: true };

/**
 * What the cookie holds: proof of the code, never the code. It is keyed on
 * the code itself, so a new code turns every old cookie away with no list of
 * cookies to revoke.
 */
export function gateToken(code: string): string {
  return createHmac("sha256", code).update("oth-team-gate/1").digest("base64url");
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
 * The shared team code in front of the app (spec §13): `guard` goes before
 * every route, `routes` answers the form at `/api/gate`.
 */
export function teamGate(code: string, options: { secure: boolean; now?: () => number }) {
  const token = gateToken(code);
  const tokenBytes = Buffer.from(token);
  const wrong = new WrongCodes();
  const now = options.now ?? Date.now;
  const noStore = { "cache-control": "no-store" };

  const guard = createMiddleware<AppEnv>(async (c, next) => {
    const path = c.req.path;
    // Railway's health check, and the form's own answer, come before any code.
    if (path === "/api/health" || path === "/api/gate") return next();
    if (!holdsPass(getCookie(c, GATE_COOKIE), tokenBytes)) {
      if (path.startsWith("/api/")) return c.json(GATE_REFUSAL, 401);
      const url = new URL(c.req.url);
      return c.html(gatePage({ next: safeNext(url.pathname + url.search) }), 401, noStore);
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
    onError: c => c.html(gatePage({ next: "/", error: WRONG_CODE }), 413, noStore),
  });

  routes.post("/", formLimit, async c => {
    const body: Record<string, unknown> = await c.req.parseBody().catch(() => ({}));
    const typed = typeof body.code === "string" ? body.code : "";
    const next = safeNext(typeof body.next === "string" ? body.next : "/");
    const at = now();
    // Refused unchecked while blocked, the right code too: otherwise a guess
    // that redirected would still say it was right.
    if (wrong.blocked(at)) return c.html(gatePage({ next, error: TOO_MANY }), 429, noStore);
    if (!codeMatches(typed, code)) {
      wrong.record(at);
      return c.html(gatePage({ next, error: WRONG_CODE }), 401, noStore);
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
