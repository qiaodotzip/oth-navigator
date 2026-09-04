# Map Model Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/server` — the hosted API three or four non-technical teammates edit the OTH map through: invite-only auth, one row per entity with optimistic locking and an audit trail, soft locks and presence, `.glb` asset ingest, and the publish endpoint that snapshots an immutable bundle.

**Architecture:** Hono on Node with Drizzle over Postgres. `packages/model` stays the source of truth for shape and rules — the server stores rows, assembles them into a `MapModel`, and hands that to the model package's validator and bundle builder. Nothing about geometry or validity is re-implemented here. Tests run against PGlite (embedded Postgres, no Docker, works on Windows), so the whole suite is `npm test` with no services to start.

**Tech Stack:** Hono 4, Drizzle ORM, Postgres (PGlite in tests), `@gltf-transform/core` for asset inspection, `node:crypto` scrypt for passwords, SSE for presence. Deployed on Railway.

**Spec:** [`docs/design-and-plans/specs/2026-09-04-oth-map-model-design.md`](../specs/2026-09-04-oth-map-model-design.md)

**Depends on:** [`2026-09-04-map-model-foundation.md`](2026-09-04-map-model-foundation.md) — complete. Consumes `@oth/model` (schemas, `parseModel`, `validateModel`) and `@oth/model/bundle` (`buildBundle`).

## Global Constraints

- **`packages/model` owns correctness.** The server never re-implements a validation rule, a geometry predicate, or a budget. Asset limits come from `ASSET_MAX_BYTES` / `ASSET_MAX_TRIANGLES`, not from local constants.
- **Every entity row carries** `id`, `version`, `updated_by`, `updated_at`, `deleted_at`. Updates are `WHERE id = ? AND version = ?`; a miss is **409**, never a silent overwrite.
- **Deletes are soft.** No route issues `DELETE FROM` on an entity table.
- **Every mutation writes an audit row** with before/after. Four people editing one model means "who moved this wall" must be answerable.
- **No native-compilation dependencies.** Passwords use `node:crypto` scrypt rather than argon2/bcrypt, because the team is on Windows and a failed node-gyp build is a bad first-day experience.
- **Sessions are opaque tokens** in `httpOnly`, `sameSite=lax`, `secure` (in production) cookies. No JWTs.
- **The publish output is immutable.** A published version is never rewritten.
- **TypeScript strict**, tests as `*.test.ts` beside the code, Vitest.

---

## API surface

Plan 3 (the editor) is written against exactly this. Fixing it here is the point of doing the server first.

```
POST   /api/auth/login              {email, password}          -> {user}, sets cookie
POST   /api/auth/logout                                        -> 204
GET    /api/auth/me                                            -> {user}

GET    /api/model                                              -> MapModel
GET    /api/model/validate                                     -> ValidationReport

GET    /api/entities/:type                                     -> {items}
POST   /api/entities/:type          {data}                     -> {entity}
PATCH  /api/entities/:type/:id      {expectedVersion, data}    -> {entity} | 409
DELETE /api/entities/:type/:id      {expectedVersion}          -> {entity} | 409

POST   /api/locks/:type/:id                                    -> {lock} | 423
DELETE /api/locks/:type/:id                                    -> 204

POST   /api/presence                {levelId}                  -> 204
GET    /api/presence/stream                                    -> SSE

GET    /api/assets                                             -> {items}
POST   /api/assets                  multipart file             -> {asset}
GET    /api/assets/:id/file                                    -> .glb bytes

POST   /api/publish                 {notes?}                   -> {version, warningCount} | 422
GET    /api/published/:version/*                               -> bundle file
```

`:type` is one of `level | room | doorway | entrance | portal | portalEndpoint | navHint | placement | tenant`.

---

## File Structure

- **Create** `packages/server/package.json`, `tsconfig.json`, `drizzle.config.ts`
- **Create** `src/config.ts` — environment parsing, one place
- **Create** `src/db/schema.ts` — every Drizzle table
- **Create** `src/db/client.ts` — driver selection (pg in production, PGlite in tests)
- **Create** `src/db/migrate.ts` — apply migrations at boot
- **Create** `src/testing/harness.ts` — spin up an isolated PGlite database per test file
- **Create** `src/auth/password.ts` — scrypt hash/verify
- **Create** `src/auth/users.ts` — invite/create user
- **Create** `src/auth/sessions.ts` — create/validate/revoke
- **Create** `src/auth/middleware.ts` — `requireUser`
- **Create** `src/auth/routes.ts` — login/logout/me
- **Create** `src/entities/registry.ts` — type name → table + Zod schema
- **Create** `src/entities/repository.ts` — optimistic-locked CRUD + audit
- **Create** `src/entities/routes.ts` — the generic REST surface
- **Create** `src/model/assemble.ts` — rows → `MapModel`
- **Create** `src/model/routes.ts` — `/api/model`, `/api/model/validate`
- **Create** `src/locks/service.ts`, `src/locks/routes.ts` — soft locks with TTL
- **Create** `src/presence/service.ts`, `src/presence/routes.ts` — SSE presence
- **Create** `src/assets/inspect.ts` — glTF validation and stats
- **Create** `src/assets/storage.ts` — content-addressed file store
- **Create** `src/assets/routes.ts` — upload/list/download
- **Create** `src/publish/service.ts`, `src/publish/routes.ts` — bundle + copy assets + version row
- **Create** `src/app.ts` — compose the Hono app
- **Create** `src/index.ts` — Node entry point

---

## Task 1: Server package, PGlite harness, health route

**Files:**
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`, `src/config.ts`, `src/db/client.ts`, `src/testing/harness.ts`, `src/app.ts`, `src/app.test.ts`
- Modify: root `tsconfig.json` (add a project reference)

**Interfaces:**
- Produces: `createApp(deps: AppDeps): Hono`, `AppDeps = { db: Database }`, `type Database`, `createTestDb(): Promise<Database>`, `loadConfig(env): Config`.

- [ ] **Step 1: Create the package**

`packages/server/package.json`:

```json
{
  "name": "@oth/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "db:generate": "drizzle-kit generate"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "@oth/model": "*",
    "drizzle-orm": "^0.36.0",
    "hono": "^4.6.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@electric-sql/pglite": "^0.2.0",
    "@types/node": "^20",
    "drizzle-kit": "^0.28.0",
    "tsx": "^4.22.3"
  }
}
```

`packages/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"],
  "compilerOptions": {
    "composite": true,
    "noEmit": false,
    "emitDeclarationOnly": true,
    "outDir": "dist"
  },
  "references": [{ "path": "../model" }]
}
```

Add to root `tsconfig.json` references: `{ "path": "./packages/server" }`.

- [ ] **Step 2: Write the failing test**

`packages/server/src/app.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createTestDb } from "./testing/harness";

describe("app", () => {
  it("serves a health check", async () => {
    const db = await createTestDb();
    const res = await createApp({ db }).request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("404s an unknown route as JSON, not HTML", async () => {
    const db = await createTestDb();
    const res = await createApp({ db }).request("/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run packages/server`
Expected: FAIL — cannot resolve `./app`.

- [ ] **Step 4: Implement config and the database client**

`packages/server/src/config.ts`:

```ts
import { z } from "zod";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().optional(),
  /** Railway volume mount. Assets and published bundles live here. */
  DATA_DIR: z.string().default("./data"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24 * 14),
  /** Soft locks expire quickly; the editor refreshes while you are editing. */
  LOCK_TTL_SECONDS: z.coerce.number().int().positive().default(300),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}
```

`packages/server/src/db/client.ts`:

```ts
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export async function createPostgresDb(url: string): Promise<Database> {
  const { Pool } = await import("pg");
  return drizzlePg(new Pool({ connectionString: url }), { schema });
}
```

`packages/server/src/testing/harness.ts`:

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { resolve } from "node:path";
import * as schema from "../db/schema";
import type { Database } from "../db/client";

/**
 * A fresh in-memory Postgres per call. PGlite rather than Docker so the whole
 * suite is `npm test` on any machine, Windows included.
 */
export async function createTestDb(): Promise<Database> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
  return db as unknown as Database;
}
```

- [ ] **Step 5: Implement the app**

`packages/server/src/app.ts`:

```ts
import { Hono } from "hono";
import type { Database } from "./db/client";

export type AppDeps = { db: Database };

export type AppEnv = { Variables: { db: Database } };

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("db", deps.db);
    await next();
  });

  app.get("/api/health", c => c.json({ ok: true }));

  app.notFound(c => c.json({ error: "not found" }, 404));
  app.onError((err, c) => c.json({ error: err.message }, 500));

  return app;
}
```

- [ ] **Step 6: Create the auth tables and generate the first migration**

The PGlite harness migrates on startup, so the schema and a migration folder must
exist before any test can run.

`packages/server/src/db/schema.ts`:

```ts
import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  invitedBy: text("invited_by"),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
}, t => ({
  emailIdx: uniqueIndex("users_email_idx").on(t.email),
}));

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, t => ({
  userIdx: index("sessions_user_idx").on(t.userId),
}));
```

`packages/server/drizzle.config.ts`:

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
} satisfies Config;
```

```bash
npm run db:generate --workspace @oth/server
```

Commit the generated SQL — migrations are source, not build output.

- [ ] **Step 7: Run the test**

Run: `npx vitest run packages/server`
Expected: PASS — 2 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/server tsconfig.json package-lock.json
git commit -m "feat(server): package scaffold, PGlite test harness and health route"
```

---

## Task 2: Password hashing

**Files:**
- Create: `src/auth/password.ts`
- Test: `src/auth/password.test.ts`

**Interfaces:**
- Consumes: the `users` and `sessions` tables from Task 1.
- Produces: `hashPassword(plain): Promise<string>`, `verifyPassword(plain, stored): Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

`packages/server/src/auth/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("Tr0ub4dor&3", stored)).toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("returns false rather than throwing on a malformed stored value", async () => {
    expect(await verifyPassword("x", "not-a-real-hash")).toBe(false);
  });
});
```

The last case matters: a corrupted row must fail closed, not crash the login route.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/auth/password.test.ts`
Expected: FAIL — cannot resolve `./password`.

- [ ] **Step 3: Implement**

`packages/server/src/auth/password.ts`:

```ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const KEY_LEN = 64;
const SALT_LEN = 16;

/**
 * scrypt from node:crypto rather than argon2 or bcrypt: both need native
 * compilation, and the team is on Windows where a failed node-gyp build is a
 * bad first-day experience. scrypt is a memory-hard KDF and is more than
 * adequate for a handful of accounts.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = (await scryptAsync(plain, salt, KEY_LEN)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const [scheme, saltHex, keyHex] = stored.split("$");
    if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(keyHex, "hex");
    if (expected.length !== KEY_LEN) return false;
    const actual = (await scryptAsync(plain, salt, KEY_LEN)) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/server`
Expected: PASS — the health tests from Task 1 and 4 password tests.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): scrypt password hashing"
```

---

## Task 3: Sessions, login, and the requireUser middleware

**Files:**
- Create: `src/auth/users.ts`, `src/auth/sessions.ts`, `src/auth/middleware.ts`, `src/auth/routes.ts`
- Modify: `src/app.ts`
- Test: `src/auth/routes.test.ts`

**Interfaces:**
- Produces: `createUser(db, {email, password, displayName, invitedBy?}): Promise<User>`, `createSession(db, userId, ttlHours): Promise<{id, expiresAt}>`, `resolveSession(db, token): Promise<User | null>`, `revokeSession(db, token)`, `requireUser` middleware setting `c.get("user")`, `authRoutes`.
- `AppEnv.Variables` gains `user?: User`.

- [ ] **Step 1: Write the failing test**

`packages/server/src/auth/routes.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import type { Database } from "../db/client";
import { createTestDb } from "../testing/harness";
import { createUser } from "./users";

let db: Database;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db });
  await createUser(db, {
    email: "wei@example.com",
    password: "a-good-passphrase",
    displayName: "Wei",
  });
});

function login(email: string, password: string) {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

describe("auth routes", () => {
  it("logs in with correct credentials and sets an httpOnly cookie", async () => {
    const res = await login("wei@example.com", "a-good-passphrase");
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("rejects a wrong password with 401", async () => {
    expect((await login("wei@example.com", "wrong")).status).toBe(401);
  });

  it("gives the same 401 for an unknown email, so accounts cannot be enumerated", async () => {
    const unknown = await login("nobody@example.com", "a-good-passphrase");
    const wrong = await login("wei@example.com", "wrong");
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  it("returns the current user for a valid session", async () => {
    const cookie = (await login("wei@example.com", "a-good-passphrase")).headers.get("set-cookie") ?? "";
    const me = await app.request("/api/auth/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    expect((await me.json()).user.displayName).toBe("Wei");
  });

  it("never returns the password hash", async () => {
    const res = await login("wei@example.com", "a-good-passphrase");
    expect(JSON.stringify(await res.json())).not.toContain("scrypt$");
  });

  it("401s /api/auth/me without a session", async () => {
    expect((await app.request("/api/auth/me")).status).toBe(401);
  });

  it("invalidates the session on logout", async () => {
    const cookie = (await login("wei@example.com", "a-good-passphrase")).headers.get("set-cookie") ?? "";
    await app.request("/api/auth/logout", { method: "POST", headers: { cookie } });
    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(401);
  });

  it("rejects a disabled user", async () => {
    await createUser(db, { email: "gone@example.com", password: "pw-pw-pw", displayName: "Gone" });
    const cookie = (await login("gone@example.com", "pw-pw-pw")).headers.get("set-cookie") ?? "";
    await db.update((await import("../db/schema")).users)
      .set({ disabledAt: new Date() });
    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(401);
  });
});
```

The account-enumeration test is deliberate: identical responses for "no such user" and "wrong password".

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/auth/routes.test.ts`
Expected: FAIL — cannot resolve `./users`.

- [ ] **Step 3: Implement users and sessions**

`packages/server/src/auth/users.ts`:

```ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import { hashPassword } from "./password";

export type User = {
  id: string;
  email: string;
  displayName: string;
};

export type CreateUserInput = {
  email: string;
  password: string;
  displayName: string;
  invitedBy?: string;
};

/** Invite-only: there is no self-service signup route anywhere in this server. */
export async function createUser(db: Database, input: CreateUserInput): Promise<User> {
  const id = `user_${randomUUID()}`;
  await db.insert(users).values({
    id,
    email: input.email.toLowerCase().trim(),
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName,
    invitedBy: input.invitedBy ?? null,
  });
  return { id, email: input.email.toLowerCase().trim(), displayName: input.displayName };
}

export async function findUserByEmail(db: Database, email: string) {
  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  return rows[0] ?? null;
}
```

`packages/server/src/auth/sessions.ts`:

```ts
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { sessions, users } from "../db/schema";
import type { User } from "./users";

export const SESSION_COOKIE = "oth_session";

export async function createSession(db: Database, userId: string, ttlHours: number) {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

/** Returns null for an unknown, expired, or disabled-user session. */
export async function resolveSession(db: Database, token: string): Promise<User | null> {
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, token));

  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt.getTime() < Date.now()) return null;
  if (row.user.disabledAt) return null;
  return { id: row.user.id, email: row.user.email, displayName: row.user.displayName };
}

export async function revokeSession(db: Database, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, token));
}
```

- [ ] **Step 4: Implement the middleware and routes**

`packages/server/src/auth/middleware.ts`:

```ts
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../app";
import { SESSION_COOKIE, resolveSession } from "./sessions";

/** Every route except health and login sits behind this. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "unauthenticated" }, 401);
  const user = await resolveSession(c.get("db"), token);
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  c.set("user", user);
  await next();
});
```

`packages/server/src/auth/routes.ts`:

```ts
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../app";
import { loadConfig } from "../config";
import { requireUser } from "./middleware";
import { SESSION_COOKIE, createSession, revokeSession } from "./sessions";
import { findUserByEmail } from "./users";
import { verifyPassword } from "./password";

const LoginSchema = z.object({ email: z.string().min(1), password: z.string().min(1) });

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", async c => {
  const config = loadConfig();
  const parsed = LoginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid credentials" }, 401);

  const db = c.get("db");
  const row = await findUserByEmail(db, parsed.data.email);
  // Identical response for unknown email and wrong password: no account enumeration.
  const ok = row && !row.disabledAt && (await verifyPassword(parsed.data.password, row.passwordHash));
  if (!row || !ok) return c.json({ error: "invalid credentials" }, 401);

  const session = await createSession(db, row.id, config.SESSION_TTL_HOURS);
  setCookie(c, SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "Lax",
    secure: config.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
  });
  return c.json({ user: { id: row.id, email: row.email, displayName: row.displayName } });
});

authRoutes.post("/logout", async c => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await revokeSession(c.get("db"), token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.body(null, 204);
});

authRoutes.get("/me", requireUser, c => c.json({ user: c.get("user") }));
```

- [ ] **Step 5: Mount them**

In `src/app.ts`, extend `AppEnv` and mount:

```ts
import type { User } from "./auth/users";
import { authRoutes } from "./auth/routes";

export type AppEnv = { Variables: { db: Database; user: User } };

// inside createApp, after the db middleware:
app.route("/api/auth", authRoutes);
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run packages/server`
Expected: PASS — all auth tests.

- [ ] **Step 7: Commit**

```bash
git add packages/server
git commit -m "feat(server): invite-only sessions, login/logout/me, requireUser middleware"
```

---

## Task 4: Entity tables

**Files:**
- Modify: `src/db/schema.ts`
- Test: `src/db/schema.test.ts`

**Interfaces:**
- Produces: `buildings`, `levels`, `rooms`, `doorways`, `entrances`, `portals`, `portalEndpoints`, `navHints`, `assets`, `placements`, `tenants`, `auditLog`, `publishedVersions` tables.

- [ ] **Step 1: Write the failing test**

`packages/server/src/db/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../testing/harness";
import { buildings, levels, rooms } from "./schema";

describe("entity tables", () => {
  it("round-trips a room with a jsonb footprint", async () => {
    const db = await createTestDb();
    await db.insert(buildings).values({
      id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0,
    });
    await db.insert(levels).values({
      id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
      nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
    });
    await db.insert(rooms).values({
      id: "L1-lobby", levelId: "oth-L1", kind: "atrium",
      footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
      holes: [], heightM: 6, walkable: true,
      nameEn: "Lobby", nameZh: "大堂",
      verification: { status: "unverified", evidence: [] },
    });

    const [row] = await db.select().from(rooms).where(eq(rooms.id, "L1-lobby"));
    expect(row?.footprint).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(row?.version).toBe(0);
    expect(row?.deletedAt).toBeNull();
  });

  it("defaults version to 0 so the first optimistic update expects 0", async () => {
    const db = await createTestDb();
    await db.insert(buildings).values({
      id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0,
    });
    const [row] = await db.select().from(buildings);
    expect(row?.version).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/db/schema.test.ts`
Expected: FAIL — `rooms` is not exported.

- [ ] **Step 3: Implement**

Append to `packages/server/src/db/schema.ts`:

```ts
/** Columns every authored entity carries. Spread into each table. */
const auditColumns = {
  version: integer("version").notNull().default(0),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

export const buildings = pgTable("buildings", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  anchorLat: doublePrecision("anchor_lat").notNull(),
  anchorLng: doublePrecision("anchor_lng").notNull(),
  rotationDeg: doublePrecision("rotation_deg").notNull().default(0),
  ...auditColumns,
});

export const levels = pgTable("levels", {
  id: text("id").primaryKey(),
  buildingId: text("building_id").notNull(),
  code: text("code").notNull(),
  ordinal: integer("ordinal").notNull(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh").notNull(),
  elevationM: doublePrecision("elevation_m").notNull(),
  heightM: doublePrecision("height_m").notNull(),
  ...auditColumns,
});

export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  kind: text("kind").notNull(),
  footprint: jsonb("footprint").$type<[number, number][]>().notNull(),
  holes: jsonb("holes").$type<[number, number][][]>().notNull().default([]),
  heightM: doublePrecision("height_m").notNull(),
  walkable: boolean("walkable").notNull().default(false),
  nameEn: text("name_en").notNull().default(""),
  nameZh: text("name_zh").notNull().default(""),
  verification: jsonb("verification").$type<Record<string, unknown>>().notNull()
    .default({ status: "unverified", evidence: [] }),
  ...auditColumns,
}, t => ({ levelIdx: index("rooms_level_idx").on(t.levelId) }));

export const doorways = pgTable("doorways", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  roomA: text("room_a").notNull(),
  roomB: text("room_b").notNull(),
  segment: jsonb("segment").$type<[[number, number], [number, number]]>().notNull(),
  widthM: doublePrecision("width_m").notNull(),
  stepFree: boolean("step_free").notNull().default(true),
  ...auditColumns,
}, t => ({ levelIdx: index("doorways_level_idx").on(t.levelId) }));

export const entrances = pgTable("entrances", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  roomId: text("room_id").notNull(),
  point: jsonb("point").$type<[number, number]>().notNull(),
  nameEn: text("name_en").notNull().default(""),
  nameZh: text("name_zh").notNull().default(""),
  stepFree: boolean("step_free").notNull().default(true),
  isPrimary: boolean("is_primary").notNull().default(false),
  hours: text("hours"),
  ...auditColumns,
});

export const portals = pgTable("portals", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  stepFree: boolean("step_free"),
  nameEn: text("name_en").notNull().default(""),
  nameZh: text("name_zh").notNull().default(""),
  ...auditColumns,
});

export const portalEndpoints = pgTable("portal_endpoints", {
  id: text("id").primaryKey(),
  portalId: text("portal_id").notNull(),
  levelId: text("level_id").notNull(),
  roomId: text("room_id").notNull(),
  point: jsonb("point").$type<[number, number]>().notNull(),
  ...auditColumns,
});

export const navHints = pgTable("nav_hints", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  polyline: jsonb("polyline").$type<[number, number][]>().notNull(),
  ...auditColumns,
});

export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  storagePath: text("storage_path").notNull(),
  checksum: text("checksum").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  triangleCount: integer("triangle_count").notNull(),
  bbox: jsonb("bbox").$type<Record<string, number>>().notNull(),
  uploadedBy: text("uploaded_by"),
  ...auditColumns,
});

export const placements = pgTable("placements", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  assetId: text("asset_id").notNull(),
  roomId: text("room_id"),
  position: jsonb("position").$type<[number, number, number]>().notNull(),
  rotationDeg: doublePrecision("rotation_deg").notNull().default(0),
  scale: doublePrecision("scale").notNull().default(1),
  ...auditColumns,
});

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  roomId: text("room_id").notNull(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh").notNull(),
  category: text("category").notNull(),
  unitNo: text("unit_no"),
  counters: jsonb("counters").$type<string[]>().notNull().default([]),
  accessibility: jsonb("accessibility").$type<Record<string, unknown>>().notNull()
    .default({ liftAccess: true, stepFreeRoute: true }),
  hours: text("hours"),
  sourceUrl: text("source_url").notNull(),
  validFrom: text("valid_from"),
  validTo: text("valid_to"),
  verification: jsonb("verification").$type<Record<string, unknown>>().notNull()
    .default({ status: "unverified", evidence: [] }),
  ...auditColumns,
});

/** Who changed what, when. With soft deletes, this is what makes human error recoverable. */
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  actorId: text("actor_id"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  before: jsonb("before"),
  after: jsonb("after"),
}, t => ({ entityIdx: index("audit_entity_idx").on(t.entityType, t.entityId) }));

export const publishedVersions = pgTable("published_versions", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by"),
  notes: text("notes").notNull().default(""),
  warningCount: integer("warning_count").notNull().default(0),
  manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
});

/** Soft locks. Short TTL, refreshed while editing — advisory only; `version` is the real guarantee. */
export const entityLocks = pgTable("entity_locks", {
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  lockedBy: text("locked_by").notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, t => ({ pk: uniqueIndex("entity_locks_pk").on(t.entityType, t.entityId) }));
```

- [ ] **Step 4: Regenerate migrations and run**

```bash
npm run db:generate --workspace @oth/server
npx vitest run packages/server
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): entity, audit-log, lock and published-version tables"
```

---

## Task 5: Optimistic-locked repository with audit trail

**Files:**
- Create: `src/entities/registry.ts`, `src/entities/repository.ts`
- Test: `src/entities/repository.test.ts`

**Interfaces:**
- Produces: `ENTITY_TYPES` (readonly tuple), `EntityType`, `entityRegistry: Record<EntityType, {table, schema}>`; `createEntity(db, type, data, actorId)`, `updateEntity(db, type, id, expectedVersion, patch, actorId)`, `softDeleteEntity(db, type, id, expectedVersion, actorId)`, `listEntities(db, type)`. Update and delete throw `VersionConflictError` (carrying `current`) on a version mismatch.

- [ ] **Step 1: Write the failing test**

`packages/server/src/entities/repository.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, buildings, levels, rooms } from "../db/schema";
import type { Database } from "../db/client";
import { createTestDb } from "../testing/harness";
import { VersionConflictError, createEntity, listEntities, softDeleteEntity, updateEntity } from "./repository";

let db: Database;

const roomData = {
  id: "L1-lobby", levelId: "oth-L1", kind: "atrium",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 6, walkable: true, nameEn: "Lobby", nameZh: "大堂",
};

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values({
    id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
    nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
  });
});

describe("createEntity", () => {
  it("creates a room at version 0", async () => {
    const room = await createEntity(db, "room", roomData, "user_1");
    expect(room.version).toBe(0);
    expect(room.nameEn).toBe("Lobby");
  });

  it("rejects data that fails the model schema", async () => {
    await expect(createEntity(db, "room", { ...roomData, footprint: [[0, 0]] }, "user_1")).rejects.toThrow();
  });

  it("writes an audit row", async () => {
    await createEntity(db, "room", roomData, "user_1");
    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("create");
    expect(rows[0]?.actorId).toBe("user_1");
  });
});

describe("updateEntity", () => {
  it("bumps the version and applies the patch", async () => {
    await createEntity(db, "room", roomData, "user_1");
    const updated = await updateEntity(db, "room", "L1-lobby", 0, { nameEn: "Main Lobby" }, "user_2");
    expect(updated.version).toBe(1);
    expect(updated.nameEn).toBe("Main Lobby");
  });

  it("throws VersionConflictError on a stale expected version", async () => {
    await createEntity(db, "room", roomData, "user_1");
    await updateEntity(db, "room", "L1-lobby", 0, { nameEn: "First" }, "user_1");
    await expect(updateEntity(db, "room", "L1-lobby", 0, { nameEn: "Second" }, "user_2"))
      .rejects.toBeInstanceOf(VersionConflictError);
  });

  it("does not apply the losing write — last-writer-wins is exactly what we are preventing", async () => {
    await createEntity(db, "room", roomData, "user_1");
    await updateEntity(db, "room", "L1-lobby", 0, { nameEn: "First" }, "user_1");
    await updateEntity(db, "room", "L1-lobby", 0, { nameEn: "Second" }, "user_2").catch(() => {});
    const [row] = await db.select().from(rooms).where(eq(rooms.id, "L1-lobby"));
    expect(row?.nameEn).toBe("First");
  });

  it("carries the current state on the conflict so the editor can show a diff", async () => {
    await createEntity(db, "room", roomData, "user_1");
    await updateEntity(db, "room", "L1-lobby", 0, { nameEn: "First" }, "user_1");
    await expect(updateEntity(db, "room", "L1-lobby", 0, {}, "user_2"))
      .rejects.toMatchObject({ current: expect.objectContaining({ nameEn: "First", version: 1 }) });
  });

  it("records before and after in the audit row", async () => {
    await createEntity(db, "room", roomData, "user_1");
    await updateEntity(db, "room", "L1-lobby", 0, { nameEn: "Renamed" }, "user_2");
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, "update"));
    expect((rows[0]?.before as Record<string, unknown>).nameEn).toBe("Lobby");
    expect((rows[0]?.after as Record<string, unknown>).nameEn).toBe("Renamed");
  });
});

describe("softDeleteEntity", () => {
  it("sets deletedAt rather than removing the row", async () => {
    await createEntity(db, "room", roomData, "user_1");
    await softDeleteEntity(db, "room", "L1-lobby", 0, "user_1");
    const [row] = await db.select().from(rooms).where(eq(rooms.id, "L1-lobby"));
    expect(row).toBeDefined();
    expect(row?.deletedAt).not.toBeNull();
  });

  it("hides soft-deleted rows from listEntities", async () => {
    await createEntity(db, "room", roomData, "user_1");
    await softDeleteEntity(db, "room", "L1-lobby", 0, "user_1");
    expect(await listEntities(db, "room")).toHaveLength(0);
  });

  it("respects optimistic locking", async () => {
    await createEntity(db, "room", roomData, "user_1");
    await expect(softDeleteEntity(db, "room", "L1-lobby", 7, "user_1"))
      .rejects.toBeInstanceOf(VersionConflictError);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/entities/repository.test.ts`
Expected: FAIL — cannot resolve `./repository`.

- [ ] **Step 3: Implement the registry**

`packages/server/src/entities/registry.ts`:

```ts
import {
  DoorwaySchema, EntranceSchema, LevelSchema, NavHintSchema,
  PlacementSchema, PortalEndpointSchema, PortalSchema, RoomSchema, TenantSchema,
} from "@oth/model";
import * as schema from "../db/schema";

export const ENTITY_TYPES = [
  "level", "room", "doorway", "entrance",
  "portal", "portalEndpoint", "navHint", "placement", "tenant",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

/**
 * One place mapping a URL type name to its table and its validating schema.
 * The schema comes from @oth/model, so the API cannot accept a shape the model
 * would reject.
 */
export const entityRegistry = {
  level: { table: schema.levels, schema: LevelSchema },
  room: { table: schema.rooms, schema: RoomSchema },
  doorway: { table: schema.doorways, schema: DoorwaySchema },
  entrance: { table: schema.entrances, schema: EntranceSchema },
  portal: { table: schema.portals, schema: PortalSchema },
  portalEndpoint: { table: schema.portalEndpoints, schema: PortalEndpointSchema },
  navHint: { table: schema.navHints, schema: NavHintSchema },
  placement: { table: schema.placements, schema: PlacementSchema },
  tenant: { table: schema.tenants, schema: TenantSchema },
} as const;

export function isEntityType(v: string): v is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(v);
}
```

- [ ] **Step 4: Implement the repository**

`packages/server/src/entities/repository.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { auditLog } from "../db/schema";
import { entityRegistry, type EntityType } from "./registry";

export class VersionConflictError extends Error {
  constructor(public readonly current: Record<string, unknown> | null) {
    super("version conflict");
    this.name = "VersionConflictError";
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("not found");
    this.name = "NotFoundError";
  }
}

type Row = Record<string, unknown>;

async function audit(
  db: Database, entityType: string, entityId: string, action: string,
  actorId: string | null, before: Row | null, after: Row | null,
): Promise<void> {
  await db.insert(auditLog).values({
    id: `audit_${randomUUID()}`,
    entityType, entityId, action, actorId,
    before: before as never, after: after as never,
  });
}

async function findRow(db: Database, type: EntityType, id: string): Promise<Row | null> {
  const { table } = entityRegistry[type];
  const rows = await db.select().from(table as never).where(eq((table as never as Row).id as never, id));
  return (rows[0] as Row | undefined) ?? null;
}

export async function listEntities(db: Database, type: EntityType): Promise<Row[]> {
  const { table } = entityRegistry[type];
  const t = table as never as Row;
  return (await db.select().from(table as never).where(isNull(t.deletedAt as never))) as Row[];
}

/** Validates through the model's schema before touching the database. */
export async function createEntity(
  db: Database, type: EntityType, data: unknown, actorId: string | null,
): Promise<Row> {
  const { table, schema } = entityRegistry[type];
  const parsed = schema.parse(data) as Row;
  await db.insert(table as never).values(parsed as never);
  const row = await findRow(db, type, String(parsed.id));
  await audit(db, type, String(parsed.id), "create", actorId, null, row);
  return row as Row;
}

/**
 * `WHERE id = ? AND version = ?` — a miss means someone else wrote first, and
 * the caller gets their state back rather than silently losing the edit.
 */
export async function updateEntity(
  db: Database, type: EntityType, id: string,
  expectedVersion: number, patch: Record<string, unknown>, actorId: string | null,
): Promise<Row> {
  const { table, schema } = entityRegistry[type];
  const t = table as never as Row;

  const before = await findRow(db, type, id);
  if (!before) throw new NotFoundError();
  if (before.deletedAt != null) throw new NotFoundError();

  const merged = schema.parse({ ...before, ...patch, id, version: expectedVersion }) as Row;

  const updated = await db
    .update(table as never)
    .set({ ...merged, version: sql`${t.version as never} + 1`, updatedBy: actorId, updatedAt: new Date() } as never)
    .where(and(eq(t.id as never, id), eq(t.version as never, expectedVersion)))
    .returning();

  const after = updated[0] as Row | undefined;
  if (!after) throw new VersionConflictError(before);

  await audit(db, type, id, "update", actorId, before, after);
  return after;
}

export async function softDeleteEntity(
  db: Database, type: EntityType, id: string, expectedVersion: number, actorId: string | null,
): Promise<Row> {
  const { table } = entityRegistry[type];
  const t = table as never as Row;

  const before = await findRow(db, type, id);
  if (!before) throw new NotFoundError();

  const updated = await db
    .update(table as never)
    .set({
      deletedAt: new Date(),
      version: sql`${t.version as never} + 1`,
      updatedBy: actorId,
      updatedAt: new Date(),
    } as never)
    .where(and(eq(t.id as never, id), eq(t.version as never, expectedVersion)))
    .returning();

  const after = updated[0] as Row | undefined;
  if (!after) throw new VersionConflictError(before);

  await audit(db, type, id, "delete", actorId, before, after);
  return after;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run packages/server/src/entities`
Expected: PASS — 12 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "feat(server): optimistic-locked entity repository with audit trail and soft deletes"
```

---

## Task 6: Entity REST routes

**Files:**
- Create: `src/entities/routes.ts`
- Modify: `src/app.ts`
- Test: `src/entities/routes.test.ts`

**Interfaces:**
- Produces: `entityRoutes` mounted at `/api/entities`.

- [ ] **Step 1: Write the failing test**

`packages/server/src/entities/routes.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { buildings, levels } from "../db/schema";
import { createTestDb } from "../testing/harness";

let db: Database;
let app: ReturnType<typeof createApp>;
let cookie: string;

const roomData = {
  id: "L1-lobby", levelId: "oth-L1", kind: "atrium",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 6, walkable: true, nameEn: "Lobby", nameZh: "大堂",
};

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db });
  await createUser(db, { email: "wei@example.com", password: "passphrase", displayName: "Wei" });
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "wei@example.com", password: "passphrase" }),
  });
  cookie = res.headers.get("set-cookie") ?? "";
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values({
    id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
    nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
  });
});

function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

function patch(path: string, body: unknown) {
  return app.request(path, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

describe("entity routes", () => {
  it("requires authentication", async () => {
    expect((await app.request("/api/entities/room")).status).toBe(401);
  });

  it("creates and lists a room", async () => {
    expect((await post("/api/entities/room", { data: roomData })).status).toBe(201);
    const list = await app.request("/api/entities/room", { headers: { cookie } });
    expect((await list.json()).items).toHaveLength(1);
  });

  it("400s an unknown entity type", async () => {
    expect((await post("/api/entities/wormhole", { data: {} })).status).toBe(400);
  });

  it("422s data the model schema rejects", async () => {
    const res = await post("/api/entities/room", { data: { ...roomData, footprint: [[0, 0]] } });
    expect(res.status).toBe(422);
  });

  it("409s a stale update and returns the current state", async () => {
    await post("/api/entities/room", { data: roomData });
    await patch("/api/entities/room/L1-lobby", { expectedVersion: 0, data: { nameEn: "First" } });
    const res = await patch("/api/entities/room/L1-lobby", { expectedVersion: 0, data: { nameEn: "Second" } });
    expect(res.status).toBe(409);
    expect((await res.json()).current.nameEn).toBe("First");
  });

  it("soft-deletes and drops the room from the list", async () => {
    await post("/api/entities/room", { data: roomData });
    const del = await app.request("/api/entities/room/L1-lobby", {
      method: "DELETE",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ expectedVersion: 0 }),
    });
    expect(del.status).toBe(200);
    const list = await app.request("/api/entities/room", { headers: { cookie } });
    expect((await list.json()).items).toHaveLength(0);
  });

  it("attributes the edit to the logged-in user", async () => {
    await post("/api/entities/room", { data: roomData });
    const res = await patch("/api/entities/room/L1-lobby", { expectedVersion: 0, data: { nameEn: "X" } });
    expect((await res.json()).entity.updatedBy).toMatch(/^user_/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/entities/routes.test.ts`
Expected: FAIL — cannot resolve `./routes`.

- [ ] **Step 3: Implement**

`packages/server/src/entities/routes.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { isEntityType } from "./registry";
import {
  NotFoundError, VersionConflictError,
  createEntity, listEntities, softDeleteEntity, updateEntity,
} from "./repository";

const CreateBody = z.object({ data: z.unknown() });
const UpdateBody = z.object({ expectedVersion: z.number().int().nonnegative(), data: z.record(z.unknown()) });
const DeleteBody = z.object({ expectedVersion: z.number().int().nonnegative() });

export const entityRoutes = new Hono<AppEnv>();

entityRoutes.use("*", requireUser);

entityRoutes.get("/:type", async c => {
  const type = c.req.param("type");
  if (!isEntityType(type)) return c.json({ error: "unknown entity type" }, 400);
  return c.json({ items: await listEntities(c.get("db"), type) });
});

entityRoutes.post("/:type", async c => {
  const type = c.req.param("type");
  if (!isEntityType(type)) return c.json({ error: "unknown entity type" }, 400);
  const body = CreateBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { data }" }, 400);
  try {
    const entity = await createEntity(c.get("db"), type, body.data.data, c.get("user").id);
    return c.json({ entity }, 201);
  } catch (err) {
    // A schema rejection is the client's fault, not a server error.
    return c.json({ error: "invalid entity", detail: String(err) }, 422);
  }
});

entityRoutes.patch("/:type/:id", async c => {
  const type = c.req.param("type");
  if (!isEntityType(type)) return c.json({ error: "unknown entity type" }, 400);
  const body = UpdateBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion, data }" }, 400);
  try {
    const entity = await updateEntity(
      c.get("db"), type, c.req.param("id"),
      body.data.expectedVersion, body.data.data, c.get("user").id,
    );
    return c.json({ entity });
  } catch (err) {
    if (err instanceof VersionConflictError) return c.json({ error: "version conflict", current: err.current }, 409);
    if (err instanceof NotFoundError) return c.json({ error: "not found" }, 404);
    return c.json({ error: "invalid entity", detail: String(err) }, 422);
  }
});

entityRoutes.delete("/:type/:id", async c => {
  const type = c.req.param("type");
  if (!isEntityType(type)) return c.json({ error: "unknown entity type" }, 400);
  const body = DeleteBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion }" }, 400);
  try {
    const entity = await softDeleteEntity(
      c.get("db"), type, c.req.param("id"), body.data.expectedVersion, c.get("user").id,
    );
    return c.json({ entity });
  } catch (err) {
    if (err instanceof VersionConflictError) return c.json({ error: "version conflict", current: err.current }, 409);
    return c.json({ error: "not found" }, 404);
  }
});
```

Mount in `src/app.ts`: `app.route("/api/entities", entityRoutes);`

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): generic entity REST surface with 409 on version conflict"
```

---

## Task 7: Model assembly and the validation endpoint

**Files:**
- Create: `src/model/assemble.ts`, `src/model/routes.ts`
- Modify: `src/app.ts`
- Test: `src/model/assemble.test.ts`

**Interfaces:**
- Produces: `assembleModel(db): Promise<MapModel>`; routes `GET /api/model`, `GET /api/model/validate`.

- [ ] **Step 1: Write the failing test**

`packages/server/src/model/assemble.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { buildings, levels } from "../db/schema";
import { createEntity, softDeleteEntity } from "../entities/repository";
import { createTestDb } from "../testing/harness";
import { assembleModel } from "./assemble";

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values({
    id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
    nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
  });
});

const lobby = {
  id: "L1-lobby", levelId: "oth-L1", kind: "atrium",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 6, walkable: true, nameEn: "Lobby", nameZh: "大堂",
};

describe("assembleModel", () => {
  it("produces a model that parses against the model schema", async () => {
    await createEntity(db, "room", lobby, "user_1");
    const model = await assembleModel(db);
    expect(model.building.id).toBe("oth");
    expect(model.rooms).toHaveLength(1);
    expect(model.rooms[0]?.footprint).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
  });

  it("omits soft-deleted entities", async () => {
    await createEntity(db, "room", lobby, "user_1");
    await softDeleteEntity(db, "room", "L1-lobby", 0, "user_1");
    expect((await assembleModel(db)).rooms).toHaveLength(0);
  });

  it("throws a clear error when no building row exists yet", async () => {
    const empty = await createTestDb();
    await expect(assembleModel(empty)).rejects.toThrow(/building/i);
  });

  it("feeds the model package's validator", async () => {
    const { validateModel } = await import("@oth/model");
    await createEntity(db, "room", lobby, "user_1");
    // Walkable room, no entrance → the reachability rule must fire.
    const report = validateModel(await assembleModel(db));
    expect(report.issues.map(i => i.code)).toContain("building.entrances.none");
  });
});
```

The last test is the point of this task: the server's job is to produce a `MapModel` the model package can judge, not to judge it itself.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/model`
Expected: FAIL — cannot resolve `./assemble`.

- [ ] **Step 3: Implement**

`packages/server/src/model/assemble.ts`:

```ts
import { parseModel, type MapModel } from "@oth/model";
import { isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import * as schema from "../db/schema";

function iso(v: unknown): string | undefined {
  return v instanceof Date ? v.toISOString() : undefined;
}

/** Drizzle returns Dates; the model schema wants ISO strings. */
function normalise(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(r => ({
    ...r,
    updatedAt: iso(r.updatedAt),
    deletedAt: r.deletedAt == null ? null : iso(r.deletedAt),
  }));
}

async function liveRows(db: Database, table: { deletedAt: unknown }) {
  return normalise((await db.select().from(table as never).where(isNull(table.deletedAt as never))) as Record<string, unknown>[]);
}

/**
 * Reads the whole editing database into one MapModel. Deliberately simple: the
 * model is small enough (hundreds of rooms across 8 levels) that assembling it
 * whole is cheaper than incremental syncing, and it means validation always sees
 * a consistent snapshot.
 */
export async function assembleModel(db: Database): Promise<MapModel> {
  const buildingRows = await db.select().from(schema.buildings);
  const building = buildingRows[0];
  if (!building) throw new Error("no building row: the model has not been initialised");

  return parseModel({
    building: { ...building, updatedAt: iso(building.updatedAt), deletedAt: null },
    levels: await liveRows(db, schema.levels),
    rooms: await liveRows(db, schema.rooms),
    doorways: await liveRows(db, schema.doorways),
    entrances: await liveRows(db, schema.entrances),
    portals: await liveRows(db, schema.portals),
    portalEndpoints: await liveRows(db, schema.portalEndpoints),
    navHints: await liveRows(db, schema.navHints),
    assets: await liveRows(db, schema.assets),
    placements: await liveRows(db, schema.placements),
    tenants: await liveRows(db, schema.tenants),
  });
}
```

`packages/server/src/model/routes.ts`:

```ts
import { validateModel } from "@oth/model";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { assembleModel } from "./assemble";

export const modelRoutes = new Hono<AppEnv>();

modelRoutes.use("*", requireUser);

modelRoutes.get("/", async c => c.json(await assembleModel(c.get("db"))));

modelRoutes.get("/validate", async c => c.json(validateModel(await assembleModel(c.get("db")))));
```

Mount: `app.route("/api/model", modelRoutes);`

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): assemble rows into a MapModel and expose the live validation report"
```

---

## Task 8: Soft locks

**Files:**
- Create: `src/locks/service.ts`, `src/locks/routes.ts`
- Modify: `src/app.ts`
- Test: `src/locks/service.test.ts`

**Interfaces:**
- Produces: `acquireLock(db, type, id, userId, ttlSeconds): Promise<Lock | null>`, `releaseLock(db, type, id, userId)`, `activeLocks(db)`; routes `POST/DELETE /api/locks/:type/:id`.

- [ ] **Step 1: Write the failing test**

`packages/server/src/locks/service.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { createTestDb } from "../testing/harness";
import { acquireLock, activeLocks, releaseLock } from "./service";

let db: Database;
beforeEach(async () => { db = await createTestDb(); });

describe("locks", () => {
  it("grants a lock on a free entity", async () => {
    expect(await acquireLock(db, "room", "L1-lobby", "user_1", 300)).not.toBeNull();
  });

  it("refuses a lock another user holds", async () => {
    await acquireLock(db, "room", "L1-lobby", "user_1", 300);
    expect(await acquireLock(db, "room", "L1-lobby", "user_2", 300)).toBeNull();
  });

  it("lets the holder refresh their own lock", async () => {
    const first = await acquireLock(db, "room", "L1-lobby", "user_1", 300);
    const again = await acquireLock(db, "room", "L1-lobby", "user_1", 300);
    expect(again).not.toBeNull();
    expect(again!.expiresAt.getTime()).toBeGreaterThanOrEqual(first!.expiresAt.getTime());
  });

  it("grants a lock whose previous holder let it expire", async () => {
    await acquireLock(db, "room", "L1-lobby", "user_1", -1);
    expect(await acquireLock(db, "room", "L1-lobby", "user_2", 300)).not.toBeNull();
  });

  it("releases only if you hold it", async () => {
    await acquireLock(db, "room", "L1-lobby", "user_1", 300);
    expect(await releaseLock(db, "room", "L1-lobby", "user_2")).toBe(false);
    expect(await releaseLock(db, "room", "L1-lobby", "user_1")).toBe(true);
  });

  it("omits expired locks from the active list", async () => {
    await acquireLock(db, "room", "a", "user_1", 300);
    await acquireLock(db, "room", "b", "user_1", -1);
    expect((await activeLocks(db)).map(l => l.entityId)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/locks`
Expected: FAIL — cannot resolve `./service`.

- [ ] **Step 3: Implement**

`packages/server/src/locks/service.ts`:

```ts
import { and, eq, gt } from "drizzle-orm";
import type { Database } from "../db/client";
import { entityLocks } from "../db/schema";

export type Lock = {
  entityType: string;
  entityId: string;
  lockedBy: string;
  lockedAt: Date;
  expiresAt: Date;
};

/**
 * Advisory only. Optimistic locking on `version` is the real correctness
 * guarantee; this just stops two people starting the same edit, which is what
 * actually happens in practice.
 */
export async function acquireLock(
  db: Database, entityType: string, entityId: string, userId: string, ttlSeconds: number,
): Promise<Lock | null> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const existing = (await db.select().from(entityLocks)
    .where(and(eq(entityLocks.entityType, entityType), eq(entityLocks.entityId, entityId))))[0];

  if (existing && existing.expiresAt.getTime() > now.getTime() && existing.lockedBy !== userId) {
    return null;
  }

  if (existing) {
    const [row] = await db.update(entityLocks)
      .set({ lockedBy: userId, lockedAt: now, expiresAt })
      .where(and(eq(entityLocks.entityType, entityType), eq(entityLocks.entityId, entityId)))
      .returning();
    return row ?? null;
  }

  const [row] = await db.insert(entityLocks)
    .values({ entityType, entityId, lockedBy: userId, lockedAt: now, expiresAt })
    .returning();
  return row ?? null;
}

export async function releaseLock(
  db: Database, entityType: string, entityId: string, userId: string,
): Promise<boolean> {
  const rows = await db.delete(entityLocks)
    .where(and(
      eq(entityLocks.entityType, entityType),
      eq(entityLocks.entityId, entityId),
      eq(entityLocks.lockedBy, userId),
    ))
    .returning();
  return rows.length > 0;
}

export async function activeLocks(db: Database): Promise<Lock[]> {
  return db.select().from(entityLocks).where(gt(entityLocks.expiresAt, new Date()));
}
```

`packages/server/src/locks/routes.ts`:

```ts
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { loadConfig } from "../config";
import { acquireLock, activeLocks, releaseLock } from "./service";

export const lockRoutes = new Hono<AppEnv>();

lockRoutes.use("*", requireUser);

lockRoutes.get("/", async c => c.json({ locks: await activeLocks(c.get("db")) }));

lockRoutes.post("/:type/:id", async c => {
  const lock = await acquireLock(
    c.get("db"), c.req.param("type"), c.req.param("id"),
    c.get("user").id, loadConfig().LOCK_TTL_SECONDS,
  );
  // 423 Locked: someone else is editing this right now.
  if (!lock) return c.json({ error: "locked by another user" }, 423);
  return c.json({ lock });
});

lockRoutes.delete("/:type/:id", async c => {
  await releaseLock(c.get("db"), c.req.param("type"), c.req.param("id"), c.get("user").id);
  return c.body(null, 204);
});
```

Mount: `app.route("/api/locks", lockRoutes);`

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/server
git add packages/server
git commit -m "feat(server): advisory soft locks with TTL and holder-only release"
```

---

## Task 9: Presence over SSE

**Files:**
- Create: `src/presence/service.ts`, `src/presence/routes.ts`
- Modify: `src/app.ts`
- Test: `src/presence/service.test.ts`

**Interfaces:**
- Produces: `PresenceTracker` with `heartbeat(userId, displayName, levelId)`, `list()`, `subscribe(fn): () => void`; routes `POST /api/presence`, `GET /api/presence/stream`.

- [ ] **Step 1: Write the failing test**

`packages/server/src/presence/service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { PresenceTracker } from "./service";

describe("PresenceTracker", () => {
  it("lists a user after a heartbeat", () => {
    const t = new PresenceTracker(5000);
    t.heartbeat("user_1", "Wei", "oth-L2");
    expect(t.list()).toEqual([expect.objectContaining({ userId: "user_1", displayName: "Wei", levelId: "oth-L2" })]);
  });

  it("replaces a user's entry rather than duplicating it", () => {
    const t = new PresenceTracker(5000);
    t.heartbeat("user_1", "Wei", "oth-L1");
    t.heartbeat("user_1", "Wei", "oth-L2");
    expect(t.list()).toHaveLength(1);
    expect(t.list()[0]?.levelId).toBe("oth-L2");
  });

  it("drops a user who has stopped sending heartbeats", () => {
    vi.useFakeTimers();
    const t = new PresenceTracker(5000);
    t.heartbeat("user_1", "Wei", "oth-L1");
    vi.advanceTimersByTime(6000);
    expect(t.list()).toEqual([]);
    vi.useRealTimers();
  });

  it("notifies subscribers on a heartbeat", () => {
    const t = new PresenceTracker(5000);
    const seen: unknown[] = [];
    t.subscribe(p => seen.push(p));
    t.heartbeat("user_1", "Wei", "oth-L1");
    expect(seen).toHaveLength(1);
  });

  it("stops notifying after unsubscribe", () => {
    const t = new PresenceTracker(5000);
    const seen: unknown[] = [];
    const off = t.subscribe(p => seen.push(p));
    off();
    t.heartbeat("user_1", "Wei", "oth-L1");
    expect(seen).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/presence`
Expected: FAIL — cannot resolve `./service`.

- [ ] **Step 3: Implement**

`packages/server/src/presence/service.ts`:

```ts
export type Presence = {
  userId: string;
  displayName: string;
  levelId: string | null;
  lastSeen: number;
};

/**
 * In-memory and deliberately so. Presence is ephemeral, worthless after a
 * restart, and this server runs as a single Railway instance. Persisting it
 * would be pure cost.
 */
export class PresenceTracker {
  private readonly entries = new Map<string, Presence>();
  private readonly subscribers = new Set<(all: Presence[]) => void>();

  constructor(private readonly ttlMs: number = 30_000) {}

  heartbeat(userId: string, displayName: string, levelId: string | null): void {
    this.entries.set(userId, { userId, displayName, levelId, lastSeen: Date.now() });
    const all = this.list();
    for (const fn of this.subscribers) fn(all);
  }

  list(): Presence[] {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, p] of this.entries) {
      if (p.lastSeen < cutoff) this.entries.delete(id);
    }
    return [...this.entries.values()];
  }

  subscribe(fn: (all: Presence[]) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}
```

`packages/server/src/presence/routes.ts`:

```ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import type { PresenceTracker } from "./service";

const Body = z.object({ levelId: z.string().nullable().optional() });

export function presenceRoutes(tracker: PresenceTracker) {
  const routes = new Hono<AppEnv>();
  routes.use("*", requireUser);

  routes.post("/", async c => {
    const body = Body.safeParse(await c.req.json().catch(() => ({})));
    const user = c.get("user");
    tracker.heartbeat(user.id, user.displayName, body.success ? body.data.levelId ?? null : null);
    return c.body(null, 204);
  });

  routes.get("/stream", c =>
    streamSSE(c, async stream => {
      await stream.writeSSE({ event: "presence", data: JSON.stringify(tracker.list()) });
      const off = tracker.subscribe(all => {
        void stream.writeSSE({ event: "presence", data: JSON.stringify(all) });
      });
      stream.onAbort(() => off());
      // Hold the stream open until the client disconnects.
      while (!stream.closed) {
        await stream.sleep(15_000);
        await stream.writeSSE({ event: "ping", data: "1" });
      }
    }),
  );

  return routes;
}
```

In `src/app.ts`, add the tracker to `AppDeps` and mount the routes:

```ts
import { PresenceTracker } from "./presence/service";
import { presenceRoutes } from "./presence/routes";

export type AppDeps = { db: Database; presence?: PresenceTracker };

// inside createApp:
const presence = deps.presence ?? new PresenceTracker();
app.route("/api/presence", presenceRoutes(presence));
```

It defaults to a fresh tracker so every existing `createApp({ db })` call site —
including every test — keeps working unchanged.

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/server
git add packages/server
git commit -m "feat(server): in-memory presence tracker with an SSE stream"
```

---

## Task 10: Asset inspection and content-addressed storage

**Files:**
- Create: `src/assets/inspect.ts`, `src/assets/storage.ts`
- Test: `src/assets/inspect.test.ts`, `src/assets/storage.test.ts`

**Interfaces:**
- Produces: `inspectGlb(bytes): Promise<GlbStats>` where `GlbStats = { triangleCount, bbox: {minX..maxZ} }`, throwing `InvalidAssetError` on anything unreadable; `storeAsset(dataDir, bytes): Promise<{checksum, storagePath}>`, `readAsset(dataDir, storagePath)`.

- [ ] **Step 1: Add the dependency**

```bash
npm install --save --workspace @oth/server @gltf-transform/core@^4
```

- [ ] **Step 2: Write the failing storage test**

`packages/server/src/assets/storage.test.ts`:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { storeAsset } from "./storage";

async function dir() {
  return mkdtemp(join(tmpdir(), "oth-assets-"));
}

describe("storeAsset", () => {
  it("addresses content by checksum", async () => {
    const d = await dir();
    const a = await storeAsset(d, new Uint8Array([1, 2, 3]));
    expect(a.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(a.storagePath).toContain(a.checksum);
  });

  it("deduplicates identical bytes to the same path", async () => {
    const d = await dir();
    const a = await storeAsset(d, new Uint8Array([1, 2, 3]));
    const b = await storeAsset(d, new Uint8Array([1, 2, 3]));
    expect(b.storagePath).toBe(a.storagePath);
  });

  it("gives different bytes different paths", async () => {
    const d = await dir();
    const a = await storeAsset(d, new Uint8Array([1, 2, 3]));
    const b = await storeAsset(d, new Uint8Array([9, 9, 9]));
    expect(b.storagePath).not.toBe(a.storagePath);
  });

  it("actually writes the bytes", async () => {
    const d = await dir();
    const a = await storeAsset(d, new Uint8Array([7, 7]));
    expect([...(await readFile(join(d, a.storagePath)))]).toEqual([7, 7]);
  });
});
```

- [ ] **Step 3: Implement storage**

`packages/server/src/assets/storage.ts`:

```ts
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Content-addressed. Two teammates uploading the same export share one file, and
 * a published bundle can reference assets by hash without copying duplicates.
 */
export async function storeAsset(dataDir: string, bytes: Uint8Array) {
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const storagePath = join("assets", checksum.slice(0, 2), `${checksum}.glb`);
  const full = join(dataDir, storagePath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return { checksum, storagePath };
}

export async function readAsset(dataDir: string, storagePath: string): Promise<Buffer> {
  return readFile(join(dataDir, storagePath));
}
```

- [ ] **Step 4: Write the failing inspection test**

`packages/server/src/assets/inspect.test.ts`:

```ts
import { Document, NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { InvalidAssetError, inspectGlb } from "./inspect";

/** A 2 m × 3 m × 1 m box: two triangles per face, six faces. */
async function boxGlb(): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc.createAccessor()
    .setArray(new Float32Array([
      0, 0, 0, 2, 0, 0, 2, 3, 0,
      0, 0, 0, 2, 3, 0, 0, 3, 0,
      0, 0, 1, 2, 0, 1, 2, 3, 1,
    ]))
    .setType("VEC3")
    .setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute("POSITION", position);
  const mesh = doc.createMesh().addPrimitive(prim);
  doc.createScene().addChild(doc.createNode().setMesh(mesh));
  return new NodeIO().writeBinary(doc);
}

describe("inspectGlb", () => {
  it("counts triangles", async () => {
    expect((await inspectGlb(await boxGlb())).triangleCount).toBe(3);
  });

  it("computes the bounding box in metres", async () => {
    const { bbox } = await inspectGlb(await boxGlb());
    expect(bbox.minX).toBeCloseTo(0);
    expect(bbox.maxX).toBeCloseTo(2);
    expect(bbox.maxY).toBeCloseTo(3);
    expect(bbox.maxZ).toBeCloseTo(1);
  });

  it("rejects bytes that are not a glTF at all", async () => {
    await expect(inspectGlb(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(InvalidAssetError);
  });

  it("rejects an empty upload", async () => {
    await expect(inspectGlb(new Uint8Array())).rejects.toBeInstanceOf(InvalidAssetError);
  });
});
```

- [ ] **Step 5: Implement inspection**

`packages/server/src/assets/inspect.ts`:

```ts
import { NodeIO } from "@gltf-transform/core";

export class InvalidAssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAssetError";
  }
}

export type GlbStats = {
  triangleCount: number;
  bbox: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
};

/**
 * Reads a .glb well enough to enforce the spec's budgets and to know where the
 * asset sits, so a placement's bounding box can be checked against its anchor
 * room. Anything unreadable is the uploader's problem, not a 500.
 */
export async function inspectGlb(bytes: Uint8Array): Promise<GlbStats> {
  if (bytes.byteLength === 0) throw new InvalidAssetError("empty upload");

  let doc;
  try {
    doc = await new NodeIO().readBinary(bytes);
  } catch (err) {
    throw new InvalidAssetError(`not a readable glTF 2.0 binary: ${String(err)}`);
  }

  let triangleCount = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute("POSITION");
      if (!position) continue;

      triangleCount += Math.floor((indices ? indices.getCount() : position.getCount()) / 3);

      for (let i = 0; i < position.getCount(); i++) {
        const p = position.getElement(i, [0, 0, 0]);
        const [x = 0, y = 0, z = 0] = p;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }
    }
  }

  if (!Number.isFinite(minX)) {
    throw new InvalidAssetError("no geometry: the file contains no positioned mesh");
  }

  return { triangleCount, bbox: { minX, minY, minZ, maxX, maxY, maxZ } };
}
```

- [ ] **Step 6: Run and commit**

```bash
npx vitest run packages/server/src/assets
git add packages/server
git commit -m "feat(server): glTF inspection for budgets and bbox, content-addressed asset storage"
```

---

## Task 11: Asset upload routes

**Files:**
- Create: `src/assets/routes.ts`
- Modify: `src/app.ts`
- Test: `src/assets/routes.test.ts`

**Interfaces:**
- Produces: routes `GET /api/assets`, `POST /api/assets` (multipart), `GET /api/assets/:id/file`.

- [ ] **Step 1: Write the failing test**

`packages/server/src/assets/routes.test.ts`:

```ts
import { Document, NodeIO } from "@gltf-transform/core";
import { ASSET_MAX_TRIANGLES } from "@oth/model";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { createTestDb } from "../testing/harness";

let db: Database;
let app: ReturnType<typeof createApp>;
let cookie: string;

async function triangleGlb(count = 1): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const verts: number[] = [];
  for (let i = 0; i < count; i++) verts.push(0, 0, 0, 1, 0, 0, 1, 1, 0);
  const position = doc.createAccessor().setArray(new Float32Array(verts)).setType("VEC3").setBuffer(buffer);
  const mesh = doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute("POSITION", position));
  doc.createScene().addChild(doc.createNode().setMesh(mesh));
  return new NodeIO().writeBinary(doc);
}

function upload(bytes: Uint8Array, filename = "arch.glb") {
  const form = new FormData();
  form.append("file", new Blob([bytes]), filename);
  return app.request("/api/assets", { method: "POST", headers: { cookie }, body: form });
}

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db });
  await createUser(db, { email: "wei@example.com", password: "passphrase", displayName: "Wei" });
  cookie = (await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "wei@example.com", password: "passphrase" }),
  })).headers.get("set-cookie") ?? "";
});

describe("asset routes", () => {
  it("requires authentication", async () => {
    expect((await app.request("/api/assets")).status).toBe(401);
  });

  it("accepts a valid glb and records its stats", async () => {
    const res = await upload(await triangleGlb(2));
    expect(res.status).toBe(201);
    const { asset } = await res.json();
    expect(asset.triangleCount).toBe(2);
    expect(asset.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(asset.uploadedBy).toMatch(/^user_/);
  });

  it("rejects a file that is not a glb with 422, not 500", async () => {
    expect((await upload(new Uint8Array([1, 2, 3]))).status).toBe(422);
  });

  it("rejects an upload over the triangle budget", async () => {
    const res = await upload(await triangleGlb(ASSET_MAX_TRIANGLES + 1));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/triangle/i);
  });

  it("serves the stored bytes back", async () => {
    const { asset } = await (await upload(await triangleGlb(1))).json();
    const file = await app.request(`/api/assets/${asset.id}/file`, { headers: { cookie } });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("model/gltf-binary");
  });

  it("lists uploaded assets", async () => {
    await upload(await triangleGlb(1));
    const list = await app.request("/api/assets", { headers: { cookie } });
    expect((await list.json()).items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/assets/routes.test.ts`
Expected: FAIL — cannot resolve `./routes`.

- [ ] **Step 3: Implement**

`packages/server/src/assets/routes.ts`:

```ts
import { randomUUID } from "node:crypto";
import { ASSET_MAX_BYTES, ASSET_MAX_TRIANGLES } from "@oth/model";
import { eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { loadConfig } from "../config";
import { assets } from "../db/schema";
import { InvalidAssetError, inspectGlb } from "./inspect";
import { readAsset, storeAsset } from "./storage";

export const assetRoutes = new Hono<AppEnv>();

assetRoutes.use("*", requireUser);

assetRoutes.get("/", async c =>
  c.json({ items: await c.get("db").select().from(assets).where(isNull(assets.deletedAt)) }),
);

assetRoutes.post("/", async c => {
  const config = loadConfig();
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return c.json({ error: "expected a multipart 'file' field" }, 400);

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Budgets come from @oth/model so editor, server and publish agree.
  if (bytes.byteLength > ASSET_MAX_BYTES) {
    return c.json({ error: `asset exceeds the ${ASSET_MAX_BYTES} byte budget` }, 422);
  }

  let stats;
  try {
    stats = await inspectGlb(bytes);
  } catch (err) {
    if (err instanceof InvalidAssetError) return c.json({ error: err.message }, 422);
    throw err;
  }

  if (stats.triangleCount > ASSET_MAX_TRIANGLES) {
    return c.json({ error: `asset exceeds the ${ASSET_MAX_TRIANGLES} triangle budget` }, 422);
  }

  const stored = await storeAsset(config.DATA_DIR, bytes);
  const id = `asset_${randomUUID()}`;
  await c.get("db").insert(assets).values({
    id,
    filename: file.name,
    storagePath: stored.storagePath,
    checksum: stored.checksum,
    sizeBytes: bytes.byteLength,
    triangleCount: stats.triangleCount,
    bbox: stats.bbox,
    uploadedBy: c.get("user").id,
  });

  const [row] = await c.get("db").select().from(assets).where(eq(assets.id, id));
  return c.json({ asset: row }, 201);
});

assetRoutes.get("/:id/file", async c => {
  const [row] = await c.get("db").select().from(assets).where(eq(assets.id, c.req.param("id")));
  if (!row) return c.json({ error: "not found" }, 404);
  const bytes = await readAsset(loadConfig().DATA_DIR, row.storagePath);
  return c.body(bytes, 200, {
    "content-type": "model/gltf-binary",
    "content-disposition": `inline; filename="${row.filename}"`,
  });
});
```

Mount: `app.route("/api/assets", assetRoutes);`

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/server
git add packages/server
git commit -m "feat(server): .glb upload with budget enforcement, listing and download"
```

---

## Task 12: The publish endpoint

**Files:**
- Create: `src/publish/service.ts`, `src/publish/routes.ts`
- Modify: `src/app.ts`
- Test: `src/publish/service.test.ts`

**Interfaces:**
- Produces: `publish(db, dataDir, {createdBy, notes}): Promise<{version, warningCount, manifest}>`, throwing `PublishBlockedError` (carrying the `ValidationReport`) when validation fails; routes `POST /api/publish`, `GET /api/published/:version/*`.

- [ ] **Step 1: Write the failing test**

`packages/server/src/publish/service.test.ts`:

```ts
import { readFile, readdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { buildings, levels, publishedVersions } from "../db/schema";
import { createEntity } from "../entities/repository";
import { createTestDb } from "../testing/harness";
import { PublishBlockedError, publish } from "./service";

let db: Database;
let dir: string;

const lobby = {
  id: "L1-lobby", levelId: "oth-L1", kind: "atrium",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 6, walkable: true, nameEn: "Lobby", nameZh: "大堂",
};
const entrance = { id: "e-main", levelId: "oth-L1", roomId: "L1-lobby", point: [5, 5] };

beforeEach(async () => {
  db = await createTestDb();
  dir = await mkdtemp(join(tmpdir(), "oth-publish-"));
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values({
    id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
    nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
  });
});

describe("publish", () => {
  it("writes the bundle files to disk", async () => {
    await createEntity(db, "room", lobby, "user_1");
    await createEntity(db, "entrance", entrance, "user_1");
    const result = await publish(db, dir, { createdBy: "user_1", notes: "first" });
    const files = await readdir(join(dir, "published", result.version));
    expect(files.sort()).toEqual(["building.json", "levels", "manifest.json", "nav.json", "placements.json"].sort());
  });

  it("records the version in the database", async () => {
    await createEntity(db, "room", lobby, "user_1");
    await createEntity(db, "entrance", entrance, "user_1");
    const result = await publish(db, dir, { createdBy: "user_1", notes: "first" });
    const rows = await db.select().from(publishedVersions);
    expect(rows[0]?.id).toBe(result.version);
    expect(rows[0]?.notes).toBe("first");
  });

  it("refuses to publish a model with validation errors", async () => {
    // Walkable room with no entrance → unreachable.
    await createEntity(db, "room", lobby, "user_1");
    await expect(publish(db, dir, { createdBy: "user_1" })).rejects.toBeInstanceOf(PublishBlockedError);
  });

  it("carries the validation report on the block so the editor can list the problems", async () => {
    await createEntity(db, "room", lobby, "user_1");
    await expect(publish(db, dir, { createdBy: "user_1" })).rejects.toMatchObject({
      report: expect.objectContaining({ ok: false }),
    });
  });

  it("writes nothing to disk when publishing is blocked", async () => {
    await createEntity(db, "room", lobby, "user_1");
    await publish(db, dir, { createdBy: "user_1" }).catch(() => {});
    await expect(readdir(join(dir, "published"))).rejects.toThrow();
  });

  it("reports warnings without blocking", async () => {
    await createEntity(db, "room", { ...lobby, nameEn: "", nameZh: "" }, "user_1");
    await createEntity(db, "entrance", entrance, "user_1");
    const result = await publish(db, dir, { createdBy: "user_1" });
    expect(result.warningCount).toBeGreaterThan(0);
  });

  it("points latest at the newest version", async () => {
    await createEntity(db, "room", lobby, "user_1");
    await createEntity(db, "entrance", entrance, "user_1");
    const first = await publish(db, dir, { createdBy: "user_1" });
    const latest = JSON.parse(await readFile(join(dir, "published", "latest.json"), "utf8"));
    expect(latest.version).toBe(first.version);
  });
});
```

"Writes nothing when blocked" is the important one: a half-written bundle directory is worse than no bundle.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/publish`
Expected: FAIL — cannot resolve `./service`.

- [ ] **Step 3: Implement**

`packages/server/src/publish/service.ts`:

```ts
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { validateModel, type ValidationReport } from "@oth/model";
import { buildBundle } from "@oth/model/bundle";
import { isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { assets, publishedVersions } from "../db/schema";
import { assembleModel } from "../model/assemble";

export class PublishBlockedError extends Error {
  constructor(public readonly report: ValidationReport) {
    super(`publish blocked: ${report.errorCount} validation error(s)`);
    this.name = "PublishBlockedError";
  }
}

/** Sortable and human-readable: 2026-09-04T12-00-00-000Z. */
function versionId(now: Date): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

export type PublishInput = { createdBy: string; notes?: string };

/**
 * Snapshots the editing database into an immutable published bundle.
 *
 * Validation runs first and nothing is written if it fails — a half-written
 * bundle directory is worse than no bundle at all.
 */
export async function publish(db: Database, dataDir: string, input: PublishInput) {
  const model = await assembleModel(db);

  const report = validateModel(model);
  if (!report.ok) throw new PublishBlockedError(report);

  const now = new Date();
  const version = versionId(now);
  const files = buildBundle(model, {
    version,
    createdAt: now.toISOString(),
    createdBy: input.createdBy,
    notes: input.notes ?? "",
  });

  const root = join(dataDir, "published", version);
  for (const file of files) {
    const full = join(root, file.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, file.contents, "utf8");
  }

  // Copy the referenced .glb files alongside. The bundle builder is I/O-free,
  // so this is the server's half of the contract.
  const assetRows = await db.select().from(assets).where(isNull(assets.deletedAt));
  const referenced = new Set(model.placements.map(p => p.assetId));
  for (const asset of assetRows) {
    if (!referenced.has(asset.id)) continue;
    const dest = join(root, "assets", `${asset.checksum}.glb`);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(join(dataDir, asset.storagePath), dest);
  }

  const manifest = JSON.parse(files.find(f => f.path === "manifest.json")?.contents ?? "{}");

  await db.insert(publishedVersions).values({
    id: version,
    createdBy: input.createdBy,
    notes: input.notes ?? "",
    warningCount: report.warningCount,
    manifest,
  });

  await writeFile(
    join(dataDir, "published", "latest.json"),
    JSON.stringify({ version, publishedAt: now.toISOString() }),
    "utf8",
  );

  return { version, warningCount: report.warningCount, manifest };
}
```

`packages/server/src/publish/routes.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { loadConfig } from "../config";
import { PublishBlockedError, publish } from "./service";

const Body = z.object({ notes: z.string().max(2000).optional() });

export const publishRoutes = new Hono<AppEnv>();

publishRoutes.post("/publish", requireUser, async c => {
  const body = Body.safeParse(await c.req.json().catch(() => ({})));
  try {
    const result = await publish(c.get("db"), loadConfig().DATA_DIR, {
      createdBy: c.get("user").id,
      notes: body.success ? body.data.notes : undefined,
    });
    return c.json(result, 201);
  } catch (err) {
    if (err instanceof PublishBlockedError) {
      return c.json({ error: "validation failed", report: err.report }, 422);
    }
    throw err;
  }
});

/** Published bundles are public: this is what the visitor app reads. */
publishRoutes.get("/published/:version/*", async c => {
  const version = c.req.param("version");
  const rest = c.req.path.split(`/published/${version}/`)[1] ?? "";
  // Reject traversal before touching the filesystem.
  if (rest.includes("..")) return c.json({ error: "bad path" }, 400);
  try {
    const bytes = await readFile(join(loadConfig().DATA_DIR, "published", version, rest));
    const type = rest.endsWith(".glb") ? "model/gltf-binary" : "application/json";
    return c.body(bytes, 200, { "content-type": type, "cache-control": "public, max-age=31536000, immutable" });
  } catch {
    return c.json({ error: "not found" }, 404);
  }
});
```

Mount: `app.route("/api", publishRoutes);`

- [ ] **Step 4: Run and commit**

```bash
npx vitest run packages/server
git add packages/server
git commit -m "feat(server): publish endpoint writing immutable validated bundles"
```

---

## Task 13: Bootstrap CLI and the Node entry point

**Files:**
- Create: `src/index.ts`, `src/db/migrate.ts`, `src/cli/invite.ts`
- Modify: `packages/server/package.json` scripts
- Test: `src/cli/invite.test.ts`

**Interfaces:**
- Produces: `npm run invite --workspace @oth/server -- <email> <displayName>`; a listening server on `PORT`.

- [ ] **Step 1: Write the failing test**

`packages/server/src/cli/invite.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { verifyPassword } from "../auth/password";
import { findUserByEmail } from "../auth/users";
import { createTestDb } from "../testing/harness";
import { inviteUser } from "./invite";

describe("inviteUser", () => {
  it("creates a user with a generated passphrase it returns exactly once", async () => {
    const db = await createTestDb();
    const { user, password } = await inviteUser(db, "wei@example.com", "Wei");
    expect(user.email).toBe("wei@example.com");
    expect(password.length).toBeGreaterThanOrEqual(16);
    const row = await findUserByEmail(db, "wei@example.com");
    expect(await verifyPassword(password, row!.passwordHash)).toBe(true);
  });

  it("refuses to invite an email that already exists", async () => {
    const db = await createTestDb();
    await inviteUser(db, "wei@example.com", "Wei");
    await expect(inviteUser(db, "wei@example.com", "Wei Again")).rejects.toThrow(/already/i);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/server/src/cli`
Expected: FAIL — cannot resolve `./invite`.

- [ ] **Step 3: Implement**

`packages/server/src/cli/invite.ts`:

```ts
import { randomBytes } from "node:crypto";
import type { Database } from "../db/client";
import { createUser, findUserByEmail, type User } from "../auth/users";

/**
 * There is no signup route. Accounts exist because someone ran this, which is
 * the whole of "invite-only" for a team of four.
 */
export async function inviteUser(
  db: Database, email: string, displayName: string,
): Promise<{ user: User; password: string }> {
  if (await findUserByEmail(db, email)) {
    throw new Error(`a user with email ${email} already exists`);
  }
  const password = randomBytes(16).toString("base64url");
  const user = await createUser(db, { email, password, displayName });
  return { user, password };
}
```

- [ ] **Step 4: Implement the entry point**

`packages/server/src/db/migrate.ts`:

```ts
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Database } from "./client";

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
}
```

`packages/server/src/index.ts`:

```ts
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createPostgresDb } from "./db/client";
import { runMigrations } from "./db/migrate";
import { inviteUser } from "./cli/invite";

const config = loadConfig();

if (!config.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const db = await createPostgresDb(config.DATABASE_URL);
await runMigrations(db);

// `npm run invite --workspace @oth/server -- someone@example.com "Their Name"`
if (process.argv[2] === "invite") {
  const [, , , email, displayName] = process.argv;
  if (!email || !displayName) throw new Error('usage: invite <email> "<display name>"');
  const { password } = await inviteUser(db, email, displayName);
  console.log(`invited ${email}. One-time password: ${password}`);
  process.exit(0);
}

serve({ fetch: createApp({ db }).fetch, port: config.PORT });
console.log(`oth server listening on :${config.PORT}`);
```

Add to `packages/server/package.json` scripts: `"invite": "tsx src/index.ts invite"`.

- [ ] **Step 5: Run everything and commit**

```bash
npm test
npm run typecheck
git add packages/server
git commit -m "feat(server): migrations, Node entry point and the invite CLI"
```

---

## Task 14: Railway deployment notes

**Files:**
- Create: `packages/server/README.md`, `railway.json`
- Modify: `.env.example`

- [ ] **Step 1: Write the deployment config**

`railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "npm run start --workspace @oth/server",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

- [ ] **Step 2: Document the required environment**

Replace `.env.example` with:

```
# Postgres — Railway provides this when you add a Postgres plugin
DATABASE_URL=

# Railway volume mount path. Assets and published bundles live here.
DATA_DIR=/data

PORT=3000
NODE_ENV=production

# Optional overrides
SESSION_TTL_HOURS=336
LOCK_TTL_SECONDS=300
```

- [ ] **Step 3: Write `packages/server/README.md`**

Cover: attaching a Postgres plugin and a volume mounted at `/data`; setting `DATA_DIR=/data`; that migrations run at boot; and that the first account is created with `npm run invite --workspace @oth/server -- <email> "<name>"` from a Railway shell, with the one-time password given to the teammate to change later.

- [ ] **Step 4: Commit**

```bash
git add railway.json .env.example packages/server/README.md
git commit -m "docs(server): Railway deployment configuration and operator notes"
```

---

## Deliberately deferred from the spec

Two things the spec's §9 describes are not built here, stated plainly rather than
quietly skipped:

- **Draco/meshopt compression on asset ingest.** Compression needs a wasm encoder
  dependency, and getting it wrong silently corrupts a teammate's mesh. Upload
  validates and enforces the budgets, which is what actually protects the
  product; compression is a later optimisation, and because assets are
  content-addressed it can be added without a schema change. Uncompressed assets
  within the 5 MB budget are perfectly serviceable for ~20 hero meshes.
- **Blender context export.** Exporting a region as a locked reference `.glb`
  belongs in plan 3, not here: the editor already has the geometry loaded and
  three.js `GLTFExporter`, whereas the server would have to re-implement footprint
  extrusion just to write a file the editor could produce for free.

## Done criteria

- `npm test` green across `@oth/model` and `@oth/server`.
- `npm run typecheck` clean.
- Every route in the API surface above exists and is covered by a test.
- A stale write returns 409 with the current state; no route can silently clobber.
- Publishing an invalid model is refused and leaves no files behind.

Plan 3 (editor + renderer) is written against this API surface.
