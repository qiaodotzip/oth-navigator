import { z } from "zod";

/** Shorter than this, a code is a guess away even at the gate's pace (see gate/gate.ts). */
export const MIN_TEAM_CODE_LENGTH = 8;

/**
 * An optional setting where blank means unset, trimmed. Railway will save an
 * empty value, and a code pasted with a trailing space must still match the
 * code typed without one.
 */
const optionalSetting = z.preprocess(
  value => (typeof value === "string" ? value.trim() || undefined : value),
  z.string().optional(),
);

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().optional(),
  /** Railway volume mount. Assets and published bundles live here. */
  DATA_DIR: z.string().default("./data"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24 * 14),
  /** Soft locks expire quickly; the editor refreshes while you are editing. */
  LOCK_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  /**
   * The one code the whole team types once per browser, before the sign-in
   * list (spec §13). Set on the Railway service by hand, never committed.
   * Unset, nothing is gated: right locally, refused in production.
   */
  TEAM_CODE: optionalSetting,
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}

/**
 * Why this server must not start serving, or null when it may. Production
 * without a team code would be the whole app, open to anyone with its
 * address, so it is refused rather than served (spec §13). Never repeats the
 * code, which would put it in Railway's logs.
 */
export function teamCodeProblem(config: Config): string | null {
  if (config.NODE_ENV !== "production") return null;
  if (!config.TEAM_CODE) {
    return "TEAM_CODE is not set, and in production the app is not served without it. " +
      "Set TEAM_CODE on the Railway service, then redeploy.";
  }
  if (config.TEAM_CODE.length < MIN_TEAM_CODE_LENGTH) {
    return `TEAM_CODE is shorter than ${MIN_TEAM_CODE_LENGTH} characters. ` +
      "Choose a longer one (a few words is best), set it again, then redeploy.";
  }
  return null;
}
