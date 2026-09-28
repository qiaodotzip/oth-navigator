/**
 * Plan 6E's half of the setup contract with Plan 6C (interfaces.md): what
 * the four setup calls return. 6C's routes and its client methods in
 * `api/client.ts` answer in these shapes; `setupApi.ts` is where the compiler
 * holds the two to it.
 *
 * `SetupStepId`, `SetupStatus`, `SetupStepState`, `SetupCounts`, `SetupState`,
 * `CheckGroup`, `ClaudeChangeGroup` and `ClaudeChange` are already 6C's,
 * defined in `api/client.ts` — re-exported here rather than redeclared, so
 * the two sides can never drift apart.
 */
export type {
  SetupStepId,
  SetupStatus,
  SetupStepState,
  SetupCounts,
  SetupState,
  CheckGroup,
  ClaudeChangeGroup,
  ClaudeChange,
} from "../api/client";
export { CHECK_GROUPS } from "../api/client";

import type { ClaudeChange, SetupState, SetupStepId, SetupStatus } from "../api/client";

/** The nine steps, in order: 6C's `SETUP_STEPS`. Step n in an address is index n − 1. */
export const SETUP_STEP_IDS = [
  "footage", "label", "review", "floorplan", "rooms", "things", "paths", "check", "finish",
] as const satisfies readonly SetupStepId[];

/**
 * The four calls the wizard makes. 6C adds them to `createApi`. A refused
 * undo is a 409, which the client throws as a ConflictError whose body is
 * `{ reason: string }`: why, in a sentence ("Wei has bound Starbucks to it since").
 */
export interface SetupApi {
  /** Light is cheap: no routes worked out, so `paths.unreachable` is null. */
  getSetup(levelId: string, opts?: { light?: boolean }): Promise<SetupState>;
  /** Answers with the whole setup as the step left it, which the wizard keeps rather than asking again. */
  setSetupStep(levelId: string, step: SetupStepId, body: { status: SetupStatus; note?: string }): Promise<SetupState>;
  /**
   * `since` is ISO; the wizard sends the epoch to mean every change there
   * is. `limit` caps how many rows come back (the route takes 1–1000).
   */
  listClaudeChanges(levelId: string, since: string, limit?: number): Promise<ClaudeChange[]>;
  undoChange(auditId: string): Promise<unknown>;
}
