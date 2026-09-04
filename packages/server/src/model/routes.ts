import { validateModel } from "@oth/model";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { requireUser } from "../auth/middleware";
import { assembleModel } from "./assemble";

export const modelRoutes = new Hono<AppEnv>();

modelRoutes.use("*", requireUser);

modelRoutes.get("/", async c => c.json(await assembleModel(c.get("db"))));

/** The same report the publish gate runs, so the editor can show problems live. */
modelRoutes.get("/validate", async c => c.json(validateModel(await assembleModel(c.get("db")))));
