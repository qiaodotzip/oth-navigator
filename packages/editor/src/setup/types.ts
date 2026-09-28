/**
 * Plan 6E's half of the setup contract with Plan 6C (interfaces.md): what
 * the four setup calls return. 6C's routes and its client methods in
 * `api/client.ts` answer in these shapes; `setupApi.ts` is where the compiler
 * holds the two to it.
 *
 * `SetupStepId`, `SetupStatus`, `SetupStepState`, `SetupCounts` and
 * `SetupState` are already 6C's, defined in `api/client.ts` — re-exported
 * here rather than redeclared, so the two sides can never drift apart.
 */
export type {
  SetupStepId,
  SetupStatus,
  SetupStepState,
  SetupCounts,
  SetupState,
} from "../api/client";

import type { SetupState, SetupStepId, SetupStatus } from "../api/client";

/** The nine steps, in order: 6C's `SETUP_STEPS`. Step n in an address is index n − 1. */
export const SETUP_STEP_IDS = [
  "footage", "label", "review", "floorplan", "rooms", "things", "paths", "check", "finish",
] as const satisfies readonly SetupStepId[];

/** Spec §8's groups, in the order the check lists them. */
export const CHECK_GROUPS = [
  "rooms", "drafts", "names", "stops", "places", "objects", "pathways", "entrances",
] as const;
export type CheckGroup = (typeof CHECK_GROUPS)[number];
/** Also: Claude's survey labels, which Review checks, and anything else. */
export type ClaudeChangeGroup = CheckGroup | "labels" | "other";

/**
 * One audit row with a Claude token in `via`, as
 * `GET /api/levels/:id/claude-changes?since=` lists them, newest first.
 */
export type ClaudeChange = {
  auditId: string;
  /** When, as ISO. */
  at: string;
  group: ClaudeChangeGroup;
  /** One plain line: "Made Starbucks from a draft". */
  summary: string;
  /**
   * What changed, as the audit log names it. A room made from a draft is one
   * row, the room's own (`room`, group `rooms`), not a second for its draft.
   */
  entityType: string;
  entityId: string;
  /** The audit log's action: create, update, delete, restore. */
  action: string;
  /** Objects placed only: high with two or more anchors, low for a capture-order guess (spec §5.4). */
  confidence?: "high" | "low";
  /** True once undone through `POST /api/changes/:id/undo`. May be left out. */
  undone?: boolean;
};

/**
 * The four calls the wizard makes. 6C adds them to `createApi`. A refused
 * undo is a 409, which the client throws as a ConflictError whose body is
 * `{ reason: string }`: why, in a sentence ("Wei has bound Starbucks to it since").
 */
export interface SetupApi {
  getSetup(levelId: string): Promise<SetupState>;
  setSetupStep(levelId: string, step: SetupStepId, body: { status: SetupStatus; note?: string }): Promise<unknown>;
  /** `since` is ISO; the wizard sends the epoch to mean every change there is. */
  listClaudeChanges(levelId: string, since: string): Promise<ClaudeChange[]>;
  undoChange(auditId: string): Promise<unknown>;
}
