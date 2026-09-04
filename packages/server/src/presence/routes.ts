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

  routes.get("/", c => c.json({ presence: tracker.list() }));

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
      // Hold the stream open, pinging so proxies do not time it out.
      while (!stream.closed) {
        await stream.sleep(15_000);
        await stream.writeSSE({ event: "ping", data: "1" });
      }
    }),
  );

  return routes;
}
