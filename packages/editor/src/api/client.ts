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

export type EntityType =
  | "level" | "room" | "pathway" | "doorway" | "entrance"
  | "portal" | "portalEndpoint" | "navHint" | "placement" | "tenant"
  | "capture" | "place" | "sighting" | "pathwayKind";

export type SessionUser = { id: string; email: string; displayName: string };

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

export type ApiOptions = { fetchImpl?: typeof fetch; baseUrl?: string };

export function createApi(options: ApiOptions = {}) {
  const doFetch = options.fetchImpl ?? fetch;
  const base = options.baseUrl ?? "";

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
      if (res.status === 409) {
        const current = (body as { current?: Record<string, unknown> } | null)?.current ?? null;
        throw new ConflictError(current, body);
      }
      throw new ApiError(res.status, body);
    }
    return body as T;
  }

  const json = (data: unknown) => JSON.stringify(data);

  return {
    async login(email: string, password: string): Promise<SessionUser> {
      const body = await request<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: json({ email, password }),
      });
      return body.user;
    },

    logout: () => request<void>("/api/auth/logout", { method: "POST" }),

    async me(): Promise<SessionUser> {
      return (await request<{ user: SessionUser }>("/api/auth/me")).user;
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

    keyframeFileUrl: (id: string) => `${base}/api/keyframes/${id}/file`,

    deleteKeyframe: (id: string) =>
      request<void>(`/api/keyframes/${id}`, { method: "DELETE" }),

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
