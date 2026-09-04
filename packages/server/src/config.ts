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
