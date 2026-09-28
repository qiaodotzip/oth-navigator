import { parseModel } from "@oth/model";
import { vi } from "vitest";
import type { Api } from "../api/client";

/**
 * A small real-shaped model for shell and screen tests: two floors with
 * owners, a walkthrough on L1 with two frames, and one proposal waiting.
 */
export const sampleModel = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6, ownerIds: ["u_sc"] },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4, ownerIds: ["u_wei"] },
  ],
  captures: [{ id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" }],
  keyframes: [
    { id: "kf_1", captureId: "cap_1", timeMs: 1000, imageId: "kf_1", widthPx: 640, heightPx: 480 },
    { id: "kf_2", captureId: "cap_1", timeMs: 2000, imageId: "kf_2", widthPx: 640, heightPx: 480 },
  ],
  places: [{ id: "pl_1", nameEn: "Festive Mall", category: "retail", status: "proposed", proposedBy: "claude-code" }],
  sightings: [{ id: "sg_1", placeId: "pl_1", keyframeId: "kf_1", status: "proposed" }],
});

export const sampleTeam = [
  { id: "u_sc", displayName: "Stef Chan" },
  { id: "u_wei", displayName: "Wei Kang" },
];

/** Every Api method as a vi.fn with a harmless default; pass overrides for the ones a test cares about. */
export function fakeApi(overrides: Partial<Record<keyof Api, unknown>> = {}): Api {
  return {
    login: vi.fn().mockResolvedValue({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" }),
    logout: vi.fn().mockResolvedValue(undefined),
    me: vi.fn().mockResolvedValue({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" }),
    people: vi.fn().mockResolvedValue(sampleTeam),
    listUsers: vi.fn().mockResolvedValue(sampleTeam),
    inviteUser: vi.fn(),
    getModel: vi.fn().mockResolvedValue(sampleModel),
    validate: vi.fn().mockResolvedValue({ issues: [], errorCount: 0, warningCount: 0, ok: true }),
    listLevelImages: vi.fn().mockResolvedValue([]),
    createEntity: vi.fn().mockResolvedValue({}),
    updateEntity: vi.fn().mockResolvedValue({}),
    deleteEntity: vi.fn().mockResolvedValue({}),
    restoreEntity: vi.fn().mockResolvedValue({}),
    restoreKeyframe: vi.fn().mockResolvedValue({ sightings: 0 }),
    uploadKeyframe: vi.fn().mockResolvedValue({}),
    keyframeFileUrl: (id: string, w?: number) => `/api/keyframes/${id}/file${w ? `?w=${w}` : ""}`,
    deleteKeyframe: vi.fn().mockResolvedValue(undefined),
    acceptPlace: vi.fn().mockResolvedValue({ sightings: 1, confirmed: ["sg_1"] }),
    reopenPlace: vi.fn().mockResolvedValue({ sightings: 1 }),
    mergePlace: vi.fn().mockResolvedValue({ moved: [] }),
    unmergePlace: vi.fn().mockResolvedValue({ sightings: 0 }),
    rejectPlace: vi.fn().mockResolvedValue({ sightings: 1 }),
    deleteCapture: vi.fn().mockResolvedValue({ frames: 0 }),
    listLocks: vi.fn().mockResolvedValue([]),
    listPresence: vi.fn().mockResolvedValue([]),
    acquireLock: vi.fn().mockResolvedValue({ lock: null }),
    releaseLock: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    listAssets: vi.fn().mockResolvedValue([]),
    uploadAsset: vi.fn(),
    assetFileUrl: (id: string) => `/api/assets/${id}/file`,
    uploadLevelImage: vi.fn(),
    patchLevelImage: vi.fn(),
    levelImageFileUrl: (id: string) => `/api/level-images/${id}/file`,
    publish: vi.fn().mockResolvedValue({ version: "v1", warningCount: 0 }),
    latestPublished: vi.fn().mockResolvedValue(null),
    health: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as Api;
}
