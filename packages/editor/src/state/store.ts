import type { Level, MapModel, Ring, Room, ValidationReport, Vec2 } from "@oth/model";
import { create } from "zustand";
import type { AssetRecord, LevelImage, SessionUser, TeamMember } from "../api/client";
import type { LockEntry, PresenceEntry } from "../collab/types";
import { DEFAULT_VIEWPORT, type Viewport } from "../plan/viewport";

export type Tool =
  | "select"
  | "draw-area"
  | "draw-room"
  | "draw-detail"
  | "draw-pathway"
  | "draw-doorway"
  | "place-entrance"
  | "place-portal"
  | "calibrate";

export type Selection =
  | {
      type: "room" | "pathway" | "doorway" | "entrance" | "portalEndpoint" | "placement";
      id: string;
    }
  | null;

export type Conflict =
  | { entityType: string; entityId: string; current: Record<string, unknown> | null }
  | null;

export type EditorState = {
  user: SessionUser | null;
  model: MapModel | null;
  report: ValidationReport | null;
  activeLevelId: string | null;
  selection: Selection;
  tool: Tool;
  /** Points placed so far by a drawing tool, in world metres. */
  draft: Vec2[] | null;
  viewport: Viewport;
  conflict: Conflict;
  presence: PresenceEntry[];
  /** Advisory locks held by anyone, refreshed on the collaboration timer. */
  locks: LockEntry[];
  status: string | null;
  assets: AssetRecord[];
  selectedAssetId: string | null;
  levelImages: LevelImage[];
  /** The two points of an in-progress scale measurement, in world units. */
  calibrationDraft: Vec2[] | null;
  /** Everyone on the team, for owners, avatars and the team page. */
  team: TeamMember[];
  /**
   * Whether `team` reflects a real answer yet. "loading" is only the first
   * fetch in flight — an id not found in `team` means nothing until then. On
   * "error" it stays whatever it last was (usually still empty), so it must
   * not be read as "nobody is on the team" either.
   */
  teamStatus: "loading" | "loaded" | "error";
  /**
   * Why there is no user. "expired" keeps the page and asks you to sign in
   * again over it; "signed-out" (or null, before anyone signs in) shows the
   * sign-in screen.
   */
  sessionEnd: "signed-out" | "expired" | null;
  /**
   * Whether a write was refused when the session ended. The dialog says "your
   * last change was not saved" only then: usually a presence poll notices the
   * expiry first, and nothing was lost.
   */
  sessionEndUnsaved: boolean;

  setUser: (u: SessionUser | null) => void;
  setModel: (m: MapModel) => void;
  setReport: (r: ValidationReport | null) => void;
  setActiveLevel: (id: string) => void;
  select: (s: Selection) => void;
  setTool: (t: Tool) => void;
  beginDraft: () => void;
  pushDraftPoint: (p: Vec2) => void;
  popDraftPoint: () => void;
  clearDraft: () => void;
  setViewport: (v: Viewport) => void;
  setConflict: (c: Conflict) => void;
  setPresence: (p: PresenceEntry[]) => void;
  setLocks: (l: LockEntry[]) => void;
  setStatus: (s: string | null) => void;
  setAssets: (a: AssetRecord[]) => void;
  setLevelImages: (i: LevelImage[]) => void;
  beginCalibration: () => void;
  pushCalibrationPoint: (p: Vec2) => void;
  clearCalibration: () => void;
  selectAsset: (id: string | null) => void;
  setTeam: (t: TeamMember[]) => void;
  setTeamLoadError: () => void;
  endSession: (reason: "signed-out" | "expired", unsaved?: boolean) => void;
  reset: () => void;
};

function lowestLevelId(model: MapModel): string | null {
  const ordered = [...model.levels].sort((a, b) => a.ordinal - b.ordinal);
  return ordered[0]?.id ?? null;
}

const initial = {
  user: null,
  model: null,
  report: null,
  activeLevelId: null,
  selection: null,
  tool: "select" as Tool,
  draft: null,
  viewport: DEFAULT_VIEWPORT,
  conflict: null,
  presence: [],
  locks: [],
  status: null,
  assets: [],
  selectedAssetId: null,
  levelImages: [],
  calibrationDraft: null,
  team: [] as TeamMember[],
  teamStatus: "loading" as EditorState["teamStatus"],
  sessionEnd: null as EditorState["sessionEnd"],
  sessionEndUnsaved: false,
};

export const useEditorStore = create<EditorState>(set => ({
  ...initial,

  // Signing in, or back in, settles why the session had ended.
  setUser: user => set(user ? { user, sessionEnd: null, sessionEndUnsaved: false } : { user }),

  setModel: model =>
    set(state => {
      // Keep the level you were working on across a refresh; only fall back if it vanished.
      const stillThere = state.activeLevelId && model.levels.some(l => l.id === state.activeLevelId);
      return { model, activeLevelId: stillThere ? state.activeLevelId : lowestLevelId(model) };
    }),

  setReport: report => set({ report }),

  // Changing level clears the selection: a selected room on another floor is a confusing state.
  setActiveLevel: id => set({ activeLevelId: id, selection: null, draft: null }),

  select: selection => set({ selection }),

  // A half-drawn shape must never survive a tool change.
  setTool: tool =>
    set({ tool, draft: null, calibrationDraft: tool === "calibrate" ? [] : null }),

  beginDraft: () => set({ draft: [] }),
  pushDraftPoint: p => set(state => ({ draft: [...(state.draft ?? []), p] })),
  popDraftPoint: () =>
    set(state => ({
      draft: state.draft && state.draft.length > 0 ? state.draft.slice(0, -1) : state.draft,
    })),
  clearDraft: () => set({ draft: null }),

  setViewport: viewport => set({ viewport }),
  setConflict: conflict => set({ conflict }),
  setPresence: presence => set({ presence }),
  setLocks: locks => set({ locks }),
  setStatus: status => set({ status }),
  setAssets: assets => set({ assets }),
  setLevelImages: levelImages => set({ levelImages }),

  beginCalibration: () => set({ tool: "calibrate", calibrationDraft: [] }),
  pushCalibrationPoint: p =>
    set(state => ({ calibrationDraft: [...(state.calibrationDraft ?? []), p] })),
  clearCalibration: () => set({ calibrationDraft: null }),
  selectAsset: selectedAssetId => set({ selectedAssetId }),
  setTeam: team => set({ team, teamStatus: "loaded" }),
  setTeamLoadError: () => set({ teamStatus: "error" }),
  // A lost change stays lost until someone signs in: a later 401 from a poll
  // must not make the dialog forget it.
  endSession: (reason, unsaved = false) =>
    set(state => ({ user: null, sessionEnd: reason, sessionEndUnsaved: state.sessionEndUnsaved || unsaved })),

  reset: () => set(initial),
}));

export function activeLevel(state: EditorState): Level | null {
  if (!state.model || !state.activeLevelId) return null;
  return state.model.levels.find(l => l.id === state.activeLevelId) ?? null;
}

export function roomsOnActiveLevel(state: EditorState): Room[] {
  if (!state.model || !state.activeLevelId) return [];
  return state.model.rooms.filter(r => r.levelId === state.activeLevelId);
}

export function ringsOnActiveLevel(state: EditorState): Ring[] {
  return roomsOnActiveLevel(state).map(r => r.footprint);
}
