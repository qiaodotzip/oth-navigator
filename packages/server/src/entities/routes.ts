import { Hono } from "hono";
import { z, ZodError } from "zod";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { restorePlace } from "../survey/review";
import { isEntityType } from "./registry";
import {
  NotDeletedError, NotFoundError, VersionConflictError,
  createEntity, listEntities, restoreEntity, softDeleteEntity, updateEntity,
} from "./repository";

const CreateBody = z.object({ data: z.unknown() });
const UpdateBody = z.object({
  expectedVersion: z.number().int().nonnegative(),
  data: z.record(z.unknown()),
});
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
    if (err instanceof ZodError) return c.json({ error: "invalid entity", detail: String(err) }, 422);
    // Anything else — a dropped connection, a timeout — is the server's, and
    // onError's 500 is what lets the client offer Retry.
    throw err;
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
    if (err instanceof VersionConflictError) {
      return c.json({ error: "version conflict", current: err.current }, 409);
    }
    if (err instanceof NotFoundError) return c.json({ error: "not found" }, 404);
    if (err instanceof ZodError) return c.json({ error: "invalid entity", detail: String(err) }, 422);
    throw err;
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
    if (err instanceof VersionConflictError) {
      return c.json({ error: "version conflict", current: err.current }, 409);
    }
    return c.json({ error: "not found" }, 404);
  }
});

entityRoutes.post("/:type/:id/restore", async c => {
  const type = c.req.param("type");
  if (!isEntityType(type)) return c.json({ error: "unknown entity type" }, 400);
  // A capture's delete cascades to its keyframes and their sightings; restoring
  // only the capture row here would leave them all still deleted and undiscoverable.
  if (type === "capture") {
    return c.json({ error: "a capture is restored with its frames, which is not offered; its delete is final" }, 422);
  }
  const body = DeleteBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "expected { expectedVersion }" }, 400);
  try {
    // A rejected place comes back with the tags rejected with it.
    if (type === "place") {
      return c.json(await restorePlace(c.get("db"), c.req.param("id"), body.data.expectedVersion, c.get("user").id));
    }
    const entity = await restoreEntity(
      c.get("db"), type, c.req.param("id"), body.data.expectedVersion, c.get("user").id,
    );
    return c.json({ entity });
  } catch (err) {
    if (err instanceof VersionConflictError) {
      return c.json({ error: "version conflict", current: err.current }, 409);
    }
    if (err instanceof NotDeletedError) return c.json({ error: "not deleted" }, 422);
    return c.json({ error: "not found" }, 404);
  }
});
