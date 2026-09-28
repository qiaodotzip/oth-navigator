import type { MapModel, ValidationReport } from "@oth/model";
import type { DraftSource, PlanSheet, PlanSource, RoomDraft, RoomDraftInput, RoomKind } from "@oth/model";
import type { LockEntry, PresenceEntry } from "../collab/types";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: unknown) {
    super(`api error ${status}`);
    this.name = "ApiError";
  }
}

/** A 409 is a real editorial event, not a transport failure — it gets its own type. */
export class ConflictError extends ApiError {
  constructor(public readonly current: Record<string, unknown> | null, body: unknown) {
    super(409, body);
    this.name = "ConflictError";
  }
}

/**
 * A direct write's own 401. The client's `onUnauthorized` hook already opens
 * the "session ended" dialog for this, so a caller that reaches this far
 * should show nothing of its own — no "check your connection" toast, no
 * inline error — rather than duplicate or contradict that message.
 */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/**
 * The server's answer when this browser's team code is missing or out of
 * date (spec §13). It is not a signed-out session, so it must not open the
 * sign-in dialog: the gate would refuse every name the same way.
 */
export function isGateRefusal(status: number, body: unknown): boolean {
  return status === 401 && (body as { gate?: unknown } | null)?.gate === true;
}

/**
 * Whether a refused request was trying to change something, so the sign-in
 * dialog can say that change did not land. Presence and lock pings are POSTs
 * too, but they save nothing anyone made.
 */
export function wasWrite(request: { method: string; path: string }): boolean {
  if (request.method === "GET" || request.method === "HEAD") return false;
  return !request.path.startsWith("/api/presence") && !request.path.startsWith("/api/locks");
}

export type EntityType =
  | "level" | "room" | "pathway" | "doorway" | "entrance"
  | "portal" | "portalEndpoint" | "navHint" | "placement" | "tenant"
  | "capture" | "place" | "sighting" | "pathwayKind" | "objectKind";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
};

export type TeamMember = { id: string; displayName: string };

export type PublishedVersion = { version: string; createdAt: string; warningCount: number };

export type AssetRecord = {
  id: string;
  filename: string;
  checksum: string;
  sizeBytes: number;
  triangleCount: number;
  bbox: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number };
};

export type LevelImage = {
  id: string;
  levelId: string;
  filename: string;
  widthPx: number;
  heightPx: number;
  sizeBytes: number;
  metresPerPixel: number | null;
  offsetX: number;
  offsetY: number;
  opacity: number;
  version: number;
  /**
   * ISO time it was last saved. The server always sends it; optional so a
   * test's plan need not invent one. `imageForLevel` picks the newest by it.
   */
  updatedAt?: string;
  /** Where the plan was drawn from on its PDF; absent or null for a plan that came as an image. */
  source?: PlanSource | null;
};

export type LevelImagePatch = {
  metresPerPixel?: number | null;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
};

/** A tag moved by a merge, and how it stood before: what an unmerge puts back. */
export type MovedSighting = { id: string; status: "proposed" | "confirmed" };

// --- Claude Code tokens (plan 5C) ---

/** A Claude Code token as the Team page lists it: never the token itself. */
export type ApiToken = {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  mayPublish: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
};

export type TokenList = { tokens: ApiToken[]; mayPublishByDefault: boolean };

export type TokenNotice = { id: string; name: string; createdAt: string };

// --- PDF plans and room drafts (plan 5B) ---

/** What an accepted draft became, and the versions its undo sends back. */
export type AcceptedDraft = { draftId: string; draftVersion: number; roomId: string; roomVersion: number };

/**
 * Claude's mark on a draft it left for a person (contract v2): whose Claude
 * Code it was, as a user id, its one-line reason, and when, as ISO. The draft
 * is still waiting; a person accepting or rejecting it ends the mark.
 */
export type DraftSetAside = { by: string; reason: string; at: string };

/** A draft as the floor's drafts list gives it: a set-aside one carries Claude's mark. */
export type RoomDraftRow = RoomDraft & { setAside?: DraftSetAside };

// --- Floor setup and Claude's changes (plan 6C) ---
// The same shapes as Plan 6E's setup/types.ts, which is the contract; its
// setupApi.ts holds the methods below to its SetupApi.

export type SetupStepId = "footage" | "label" | "review" | "floorplan" | "rooms" | "things" | "paths" | "check" | "finish";
export type SetupStatus = "open" | "done" | "skipped";

/** One step as the server stores it. A step with no row comes back open, and everything else empty. */
export type SetupStepState = {
  step: SetupStepId;
  status: SetupStatus;
  note: string;
  finishedBy: string | null;
  /** Set when Claude Code finished it, through this token. */
  finishedVia: string | null;
  finishedAt: string | null;
};

export type SetupCounts = {
  label: { tagged: number; binned: number; left: number };
  review: { left: number };
  /**
   * The floor's drafts: `waiting` leaves out those Claude set aside for a
   * person, which are `setAside`, though they wait too.
   */
  rooms: { waiting: number; setAside: number; accepted: number; rejected: number; stops: number };
  things: { bound: number; unbound: number; objects: { kindId: string; name: string; count: number }[] };
  /**
   * `unreachable`: rooms with at least one doorway that no route reaches.
   * Null from the light setup, which doesn't work routes out.
   */
  paths: { pathways: number; entrances: number; unreachable: number | null };
};

export type SetupState = { steps: SetupStepState[]; counts: SetupCounts };

/**
 * Spec §8's groups, in the order the check step shows them. `frames` are
 * frames Claude binned, which Undo puts back.
 */
export const CHECK_GROUPS = ["rooms", "drafts", "names", "stops", "places", "objects", "pathways", "entrances", "frames"] as const;
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

export type ApiOptions = {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  /**
   * Called for a 401 on any request except login, `me`, `people` and logout —
   * a signed-out start-up `me` also answers 401, and that must lead to the
   * sign-in screen, not this. `people` is public, so only the team-code gate
   * ever 401s it, but it skips the hook for the same reason the others do: it
   * runs before anyone is signed in. Wired in `main.tsx` to end the session
   * as "expired" so every direct write notices the same way the saver does.
   */
  onUnauthorized?: (request: { method: string; path: string }) => void;
  /**
   * Called when the server turns this browser away at the team-code gate:
   * the code was changed since it was typed here. Wired in `main.tsx` to
   * reload, which brings up the server's team-code page. Called for every
   * request, the start-up ones included.
   */
  onGateClosed?: () => void;
};

export function createApi(options: ApiOptions = {}) {
  const doFetch = options.fetchImpl ?? fetch;
  const base = options.baseUrl ?? "";

  async function request<T>(
    path: string, init: RequestInit = {}, requestOptions: { skipUnauthorized?: boolean } = {},
  ): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      ...init,
      // The session lives in an httpOnly cookie, so every call must carry it.
      credentials: "same-origin",
      headers: init.body instanceof FormData
        ? init.headers
        : { "content-type": "application/json", ...(init.headers ?? {}) },
    });

    if (res.status === 204) return undefined as T;

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      if (isGateRefusal(res.status, body)) {
        options.onGateClosed?.();
        throw new ApiError(res.status, body);
      }
      if (res.status === 409) {
        const current = (body as { current?: Record<string, unknown> } | null)?.current ?? null;
        throw new ConflictError(current, body);
      }
      if (res.status === 401 && !requestOptions.skipUnauthorized) {
        options.onUnauthorized?.({ method: (init.method ?? "GET").toUpperCase(), path });
      }
      throw new ApiError(res.status, body);
    }
    return body as T;
  }

  const json = (data: unknown) => JSON.stringify(data);

  return {
    async login(userId: string): Promise<SessionUser> {
      const body = await request<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: json({ userId }),
      }, { skipUnauthorized: true });
      return body.user;
    },

    logout: () => request<void>("/api/auth/logout", { method: "POST" }, { skipUnauthorized: true }),

    async me(): Promise<SessionUser> {
      return (await request<{ user: SessionUser }>("/api/auth/me", {}, { skipUnauthorized: true })).user;
    },

    /** Everyone the sign-in dropdown can offer. Public: asked before anyone is signed in. */
    async people(): Promise<TeamMember[]> {
      return (await request<{ people: TeamMember[] }>("/api/auth/people", {}, { skipUnauthorized: true })).people;
    },

    listUsers: async (): Promise<TeamMember[]> =>
      (await request<{ users: TeamMember[] }>("/api/users")).users,

    inviteUser: (displayName: string) =>
      request<{ user: TeamMember }>("/api/users/invite", {
        method: "POST",
        body: json({ displayName }),
      }),

    /** The other half of Undo: brings back what a delete retired, at the version it left. */
    restoreEntity: async (type: EntityType, id: string, expectedVersion: number) =>
      (await request<{ entity: Record<string, unknown> }>(`/api/entities/${type}/${id}/restore`, {
        method: "POST",
        body: json({ expectedVersion }),
      })).entity,

    restoreKeyframe: (id: string) =>
      request<{ sightings: number }>(`/api/keyframes/${id}/restore`, { method: "POST" }),

    latestPublished: async (): Promise<PublishedVersion | null> =>
      (await request<{ latest: PublishedVersion | null }>("/api/publish/latest")).latest,

    /** Whether the server answers at all. Never throws: it is asked on a timer. */
    async health(): Promise<boolean> {
      try {
        await request<{ ok: boolean }>("/api/health");
        return true;
      } catch {
        return false;
      }
    },

    getModel: () => request<MapModel>("/api/model"),

    validate: () => request<ValidationReport>("/api/model/validate"),

    async createEntity(type: EntityType, data: unknown) {
      const body = await request<{ entity: Record<string, unknown> }>(`/api/entities/${type}`, {
        method: "POST",
        body: json({ data }),
      });
      return body.entity;
    },

    async updateEntity(
      type: EntityType, id: string, expectedVersion: number, data: Record<string, unknown>,
    ) {
      const body = await request<{ entity: Record<string, unknown> }>(`/api/entities/${type}/${id}`, {
        method: "PATCH",
        body: json({ expectedVersion, data }),
      });
      return body.entity;
    },

    async deleteEntity(type: EntityType, id: string, expectedVersion: number) {
      const body = await request<{ entity: Record<string, unknown> }>(`/api/entities/${type}/${id}`, {
        method: "DELETE",
        body: json({ expectedVersion }),
      });
      return body.entity;
    },

    /** Uploads one extracted frame. The video it came from is never sent. */
    async uploadKeyframe(blob: Blob, captureId: string, timeMs?: number, filename = "frame.jpg") {
      const form = new FormData();
      form.append("file", blob, filename);
      form.append("captureId", captureId);
      if (timeMs !== undefined) form.append("timeMs", String(Math.round(timeMs)));
      const body = await request<{ keyframe: Record<string, unknown> }>("/api/keyframes", {
        method: "POST",
        body: form,
      });
      return body.keyframe;
    },

    /** With a width, a smaller copy made by the server; the frames are 4K. */
    keyframeFileUrl: (id: string, width?: number) =>
      `${base}/api/keyframes/${id}/file${width ? `?w=${width}` : ""}`,

    deleteKeyframe: (id: string) =>
      request<void>(`/api/keyframes/${id}`, { method: "DELETE" }),

    /**
     * Confirms a proposed place, with any corrections, and the tags that were
     * still claims — saying which, for Undo. `levelId` files a place with no
     * floor of its own under the floor it was reviewed on.
     */
    acceptPlace: (id: string, expectedVersion: number, data: { nameEn: string; category: string; levelId?: string }) =>
      request<{ sightings: number; confirmed: string[] }>(`/api/places/${id}/accept`, {
        method: "POST",
        body: json({ expectedVersion, ...data }),
      }),

    /** Undoes an accept: the place back in the queue as it was, and the tags it confirmed back to claims. */
    reopenPlace: (
      id: string, expectedVersion: number,
      data: { nameEn: string; category: string; levelId: string | null; sightingIds: string[] },
    ) =>
      request<{ sightings: number }>(`/api/places/${id}/reopen`, {
        method: "POST",
        body: json({ expectedVersion, ...data }),
      }),

    /** "Same as…": the proposal's tags move to a place already on the map, and the proposal retires. */
    mergePlace: (id: string, expectedVersion: number, into: string) =>
      request<{ moved: MovedSighting[] }>(`/api/places/${id}/merge`, {
        method: "POST",
        body: json({ expectedVersion, into }),
      }),

    /** Undoes a merge, with exactly the tags it moved. */
    unmergePlace: (id: string, expectedVersion: number, moved: MovedSighting[]) =>
      request<{ sightings: number }>(`/api/places/${id}/unmerge`, {
        method: "POST",
        body: json({ expectedVersion, moved }),
      }),

    /** Retires a proposed place and its sightings together. */
    rejectPlace: (id: string, expectedVersion: number) =>
      request<{ sightings: number }>(`/api/places/${id}/reject`, {
        method: "POST",
        body: json({ expectedVersion }),
      }),

    /** Retires a capture, its frames, and everything labelled on them. */
    deleteCapture: (id: string) =>
      request<{ frames: number }>(`/api/captures/${id}`, { method: "DELETE" }),

    listLocks: async (): Promise<LockEntry[]> =>
      (await request<{ locks: LockEntry[] }>("/api/locks")).locks,

    listPresence: async (): Promise<PresenceEntry[]> =>
      (await request<{ presence: PresenceEntry[] }>("/api/presence")).presence,

    acquireLock: (type: string, id: string) =>
      request<{ lock: unknown }>(`/api/locks/${type}/${id}`, { method: "POST" }),

    releaseLock: (type: string, id: string) =>
      request<void>(`/api/locks/${type}/${id}`, { method: "DELETE" }),

    heartbeat: (levelId: string | null) =>
      request<void>("/api/presence", { method: "POST", body: json({ levelId }) }),

    async listAssets(): Promise<AssetRecord[]> {
      return (await request<{ items: AssetRecord[] }>("/api/assets")).items;
    },

    async uploadAsset(file: File): Promise<AssetRecord> {
      const form = new FormData();
      form.append("file", file);
      // No content-type header: the browser must set the multipart boundary.
      const body = await request<{ asset: AssetRecord }>("/api/assets", {
        method: "POST",
        body: form,
      });
      return body.asset;
    },

    assetFileUrl: (id: string) => `${base}/api/assets/${id}/file`,

    async listLevelImages(): Promise<LevelImage[]> {
      return (await request<{ items: LevelImage[] }>("/api/level-images")).items;
    },

    async uploadLevelImage(levelId: string, file: File): Promise<LevelImage> {
      const form = new FormData();
      form.append("file", file);
      form.append("levelId", levelId);
      // No content-type header: the browser must set the multipart boundary.
      const body = await request<{ image: LevelImage }>("/api/level-images", {
        method: "POST",
        body: form,
      });
      return body.image;
    },

    async patchLevelImage(id: string, expectedVersion: number, data: LevelImagePatch) {
      const body = await request<{ image: LevelImage }>(`/api/level-images/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ expectedVersion, data }),
      });
      return body.image;
    },

    levelImageFileUrl: (id: string) => `${base}/api/level-images/${id}/file`,

    publish: (notes?: string) =>
      request<{ version: string; warningCount: number }>("/api/publish", {
        method: "POST",
        body: json({ notes }),
      }),

    // --- Claude Code tokens (plan 5C) ---
    listTokens: () => request<TokenList>("/api/tokens"),

    /** The answer holds the token itself, once: the server keeps only its hash. */
    createToken: (name: string, mayPublish: boolean) =>
      request<{ token: ApiToken; secret: string }>("/api/tokens", {
        method: "POST",
        body: json({ name, mayPublish }),
      }),

    revokeToken: (id: string) => request<void>(`/api/tokens/${id}`, { method: "DELETE" }),

    /** Tokens made in your name since you were last told. It runs at sign-in, so a 401 here is no session ending. */
    claimTokenNotices: async (): Promise<TokenNotice[]> =>
      (await request<{ notices: TokenNotice[] }>("/api/tokens/notices", { method: "POST" }, { skipUnauthorized: true })).notices,

    // --- PDF plans and room drafts (plan 5B) ---

    /** Keeps the PDF a plan was drawn from beside it, with where on the sheet the plan is. */
    async uploadPlanSource(
      imageId: string, expectedVersion: number, pdf: Blob, filename: string, sheet: PlanSheet,
    ): Promise<LevelImage> {
      const form = new FormData();
      form.append("file", pdf, filename);
      form.append("sheet", JSON.stringify(sheet));
      form.append("expectedVersion", String(expectedVersion));
      return (await request<{ image: LevelImage }>(`/api/level-images/${imageId}/source`, { method: "POST", body: form })).image;
    },

    /** The PDF behind a plan, as bytes: a download, never shown on this origin. */
    async fetchPlanSource(imageId: string): Promise<Uint8Array> {
      const path = `/api/level-images/${imageId}/source`;
      const res = await doFetch(`${base}${path}`, { credentials: "same-origin" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (isGateRefusal(res.status, body)) options.onGateClosed?.();
        else if (res.status === 401) options.onUnauthorized?.({ method: "GET", path });
        throw new ApiError(res.status, body);
      }
      return new Uint8Array(await res.arrayBuffer());
    },

    /** The floor's drafts still waiting for review, those Claude set aside for a person with its mark. */
    listRoomDrafts: async (levelId: string): Promise<RoomDraftRow[]> =>
      (await request<{ drafts: RoomDraftRow[] }>(`/api/levels/${levelId}/drafts`)).drafts,

    /** A new search's drafts in place of the floor's old ones. */
    replaceRoomDrafts: async (levelId: string, body: { source: DraftSource; drafts: RoomDraftInput[] }): Promise<RoomDraft[]> =>
      (await request<{ drafts: RoomDraft[] }>(`/api/levels/${levelId}/drafts`, { method: "PUT", body: json(body) })).drafts,

    /** Drafts made rooms, all or none. */
    acceptRoomDrafts: async (items: { id: string; expectedVersion: number; nameEn?: string; kind?: RoomKind }[]): Promise<AcceptedDraft[]> =>
      (await request<{ accepted: AcceptedDraft[] }>("/api/room-drafts/accept", { method: "POST", body: json({ items }) })).accepted,

    /** The undo of an accept: the rooms off the map, the drafts back. */
    unacceptRoomDrafts: (items: { id: string; expectedVersion: number; roomVersion: number }[]) =>
      request<{ drafts: number }>("/api/room-drafts/unaccept", { method: "POST", body: json({ items }) }),

    /** Reject is a soft delete, like every removal; restore is its undo. */
    rejectRoomDraft: (id: string, expectedVersion: number) =>
      request<{ entity: Record<string, unknown> }>(`/api/entities/roomDraft/${id}`, { method: "DELETE", body: json({ expectedVersion }) }),

    restoreRoomDraft: (id: string, expectedVersion: number) =>
      request<{ entity: Record<string, unknown> }>(`/api/entities/roomDraft/${id}/restore`, { method: "POST", body: json({ expectedVersion }) }),

    // --- Floor setup and Claude's changes (plan 6C) ---

    /**
     * A floor's setup: its nine steps as stored, and each step's live counts
     * (spec §4.3). Light is the cheap one, for the Floors cards: the map isn't
     * validated, so `paths.unreachable` comes back null.
     */
    getSetup: (levelId: string, opts: { light?: boolean } = {}) =>
      request<SetupState>(`/api/levels/${levelId}/setup${opts.light ? "?light=1" : ""}`),

    /** Marks one step, as a person. Answers the whole setup again. */
    setSetupStep: (levelId: string, step: SetupStepId, body: { status: SetupStatus; note?: string }) =>
      request<SetupState>(`/api/levels/${levelId}/setup/${step}`, { method: "PUT", body: json(body) }),

    /** Claude's changes on a floor since `since`, newest first. The epoch asks for every change there is. */
    listClaudeChanges: async (levelId: string, since: string, limit?: number): Promise<ClaudeChange[]> =>
      (await request<{ changes: ClaudeChange[] }>(
        `/api/levels/${levelId}/claude-changes?since=${encodeURIComponent(since)}${limit ? `&limit=${limit}` : ""}`,
      )).changes,

    /**
     * Takes back one of Claude's changes, as you. A refusal is a
     * ConflictError whose body is { reason }: why, for the check step to show.
     */
    undoChange: (auditId: string) => request<{ summary: string }>(`/api/changes/${auditId}/undo`, { method: "POST" }),
  };
}

export type Api = ReturnType<typeof createApi>;
