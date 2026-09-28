import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { MAY_PUBLISH_BY_DEFAULT } from "./policy";
import { TooManyTokensError, hashToken, listTokens, mintToken, revokeToken } from "./service";

const CreateBody = z.object({
  name: z.string().trim().min(1).max(60),
  mayPublish: z.boolean().default(MAY_PUBLISH_BY_DEFAULT),
});

/**
 * Tokens for teammates' own Claude Code (spec §6.1). A signed-in session
 * only: a token reaches /mcp and nothing else, so a token can never make a
 * token.
 */
export const tokenRoutes = new Hono<AppEnv>();
tokenRoutes.use("*", requireUser);

tokenRoutes.get("/", async c =>
  c.json({ tokens: await listTokens(c.get("db")), mayPublishByDefault: MAY_PUBLISH_BY_DEFAULT }),
);

tokenRoutes.post("/", async c => {
  const body = CreateBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "Give the token a name, such as the laptop it is for." }, 400);
  try {
    const made = await mintToken(c.get("db"), c.get("user"), body.data);
    // So it works at once even while a flood of made-up tokens holds /mcp shut.
    c.get("liveTokens").add(hashToken(made.secret));
    // Shown once: nothing on this server can show the token again, and no
    // cache between here and the browser may keep a copy.
    return c.json(made, 201, { "cache-control": "no-store" });
  } catch (err) {
    if (err instanceof TooManyTokensError) return c.json({ error: err.message }, 409);
    throw err;
  }
});

tokenRoutes.delete("/:id", async c => {
  const found = await revokeToken(c.get("db"), c.req.param("id"), c.get("user").id);
  if (!found) return c.json({ error: "There is no token by that id. Reload the page." }, 404);
  return c.body(null, 204);
});
