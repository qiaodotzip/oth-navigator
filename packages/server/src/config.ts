import { isAbsolute, relative, resolve, sep } from "node:path";
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
  /** Set by Railway on every service it runs; see isDeployed. */
  RAILWAY_ENVIRONMENT_NAME: optionalSetting,
  RAILWAY_PROJECT_ID: optionalSetting,
  /** Set by Railway only when a volume is attached, to where it is mounted; see volumeProblem. */
  RAILWAY_VOLUME_MOUNT_PATH: optionalSetting,
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}

/**
 * Whether this is the deployed app: production by NODE_ENV, or anywhere
 * Railway runs it. Railway's own variables count too, so a NODE_ENV left out
 * or overridden on the service can never serve the app open.
 */
export function isDeployed(config: Config): boolean {
  return config.NODE_ENV === "production" || onRailway(config);
}

function onRailway(config: Config): boolean {
  return config.RAILWAY_ENVIRONMENT_NAME !== undefined || config.RAILWAY_PROJECT_ID !== undefined;
}

const ATTACH_VOLUME = "Attach a volume at /data to this service";

/**
 * Why this server must not start serving on Railway, or null when it may.
 * Without a volume under DATA_DIR, the gate's key and every uploaded photo,
 * plan and model land on the container's own disk and vanish on the next
 * deploy, signing everyone out and losing the work, with nothing to say so.
 * Off Railway there is no volume to ask about.
 */
export function volumeProblem(config: Config): string | null {
  if (!onRailway(config)) return null;
  const lost = "so the team gate's key and every uploaded photo, plan and model would be lost on the next deploy.";
  const mount = config.RAILWAY_VOLUME_MOUNT_PATH;
  if (!mount) return `No volume is attached to this service, ${lost} ${ATTACH_VOLUME}, then redeploy.`;
  const within = relative(resolve(mount), resolve(config.DATA_DIR));
  if (within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    return `DATA_DIR (${config.DATA_DIR}) is not on the volume mounted at ${mount}, ${lost} ` +
      `${ATTACH_VOLUME} and leave DATA_DIR at /data, then redeploy.`;
  }
  return null;
}

/**
 * Why this server must not start serving, or null when it may. Deployed
 * without a team code would be the whole app, open to anyone with its
 * address, so it is refused rather than served (spec §13). Never repeats the
 * code, which would put it in Railway's logs.
 */
export function teamCodeProblem(config: Config): string | null {
  if (!isDeployed(config)) return null;
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
