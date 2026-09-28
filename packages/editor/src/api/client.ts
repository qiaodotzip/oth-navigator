import type { MapModel, ValidationReport } from "@oth/model";
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
  | "capture" | "place" | "sighting" | "pathwayKind";

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
};

export type LevelImagePatch = {
  metresPerPixel?: number | null;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
};

/** A tag moved by a merge, and how it stood before: what an unmerge puts back. */
export type MovedSighting = { id: string; status: "proposed" | "confirmed" };

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
  };
}

export type Api = ReturnType<typeof createApi>;
