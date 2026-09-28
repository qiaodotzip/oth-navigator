import type { ReviewStatus } from "@oth/model";

/*
 * The user's answers of 2026-09-28 to the spec's open questions (§11), each
 * in one place so that a different answer is a one-line change. The fourth,
 * name-only sign-in, needs no constant: the login route is unchanged.
 */

/**
 * §11.1: Claude publishes only with a token made with "May publish" ticked,
 * and the tick starts off. The Team page reads this through GET /api/tokens;
 * the publish tool's one branch on `token.mayPublish` enforces it.
 */
export const MAY_PUBLISH_BY_DEFAULT = false;

/** §11.2: 90 days, past the 18 December deployment. Renewing is making a new one. */
export const TOKEN_LIFETIME_DAYS = 90;

/** §11.3: what Claude reads off frames arrives as a claim for Review, like the labelling agent's. */
export const CLAUDE_TAG_STATUS: ReviewStatus = "proposed";

/** §6.1: a person may hold this many live tokens. */
export const MAX_LIVE_TOKENS = 5;
