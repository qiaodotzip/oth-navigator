import { vi } from "vitest";
import type { Api } from "../api/client";
import { fakeApi } from "../testing/fakeApi";
import {
  SETUP_STEP_IDS, type ClaudeChange, type SetupApi, type SetupCounts, type SetupState, type SetupStepId,
  type SetupStepState,
} from "./types";

export const NO_COUNTS: SetupCounts = {
  label: { tagged: 0, binned: 0, left: 0 },
  review: { left: 0 },
  rooms: { waiting: 0, accepted: 0, rejectedOrSetAside: 0, stops: 0 },
  things: { bound: 0, unbound: 0, objects: [] },
  paths: { pathways: 0, entrances: 0, unreachable: 0 },
};

/** A floor's setup as the server gives it: every step open unless `steps` says otherwise. */
export function setupState(
  steps: Partial<Record<SetupStepId, Partial<SetupStepState>>> = {},
  counts: Partial<SetupCounts> = {},
): SetupState {
  return {
    steps: SETUP_STEP_IDS.map(step => ({
      step, status: "open", note: "", finishedBy: null, finishedVia: null, finishedAt: null, ...steps[step],
    })),
    counts: { ...NO_COUNTS, ...counts },
  };
}

/** One of Claude's changes; a room made from a draft unless `over` says otherwise. */
export function change(over: Partial<ClaudeChange> & Pick<ClaudeChange, "auditId">): ClaudeChange {
  return {
    at: "2026-09-28T10:00:00.000Z", group: "rooms", summary: "Made Starbucks from a draft",
    entityType: "room", entityId: "L1-a", action: "create", ...over,
  };
}

/**
 * fakeApi, plus the four setup calls 6C adds, with harmless defaults. Tests
 * use this rather than fakeApi so they run before 6C's client lands.
 */
export function fakeSetupApi(overrides: Partial<Record<keyof (Api & SetupApi), unknown>> = {}): Api & SetupApi {
  return {
    ...fakeApi(),
    getSetup: vi.fn().mockResolvedValue(setupState()),
    setSetupStep: vi.fn().mockResolvedValue({}),
    listClaudeChanges: vi.fn().mockResolvedValue([]),
    undoChange: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as Api & SetupApi;
}
