import type { Api, EntityType } from "../api/client";
import { ApiError, ConflictError } from "../api/client";
import { useEditorStore } from "./store";

/**
 * Every mutation goes through here so three rules hold everywhere:
 *
 * 1. A 409 becomes a conflict in the store, never an automatic retry. Retrying
 *    with the fresh version is precisely the silent overwrite optimistic
 *    locking exists to prevent — the user has to see what someone else did.
 * 2. A successful write refreshes model and report together, so the canvas
 *    always shows what the server actually accepted rather than a local guess.
 * 3. Nothing throws at the call site; callers get a boolean.
 *
 * `validate: false` is for the survey, which never shows the report. Running
 * the validator bakes every level's nav grid, which costs about half a second
 * on each write for nothing anyone there looks at.
 */
export function createSaver(api: Api, options: { validate?: boolean } = {}) {
  const store = useEditorStore;
  const validates = options.validate ?? true;

  async function refresh(): Promise<void> {
    const [model, report, levelImages] = await Promise.all([
      api.getModel(),
      validates ? api.validate() : Promise.resolve(null),
      api.listLevelImages(),
    ]);
    store.getState().setModel(model);
    if (validates) store.getState().setReport(report);
    store.getState().setLevelImages(levelImages);
  }

  async function guard(
    entityType: string, entityId: string, run: () => Promise<unknown>,
  ): Promise<boolean> {
    try {
      await run();
      store.getState().setConflict(null);
      await refresh();
      return true;
    } catch (err) {
      if (err instanceof ConflictError) {
        store.getState().setConflict({ entityType, entityId, current: err.current });
        return false;
      }
      store.getState().setStatus(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  /**
   * The first load of a screen, which nothing is awaiting.
   *
   * An expired session sends you back to sign in; anything else is said out
   * loud in the status bar. A bare `void refresh()` threw into nowhere, and the
   * screen just sat there empty.
   */
  async function load(): Promise<boolean> {
    try {
      await refresh();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        store.getState().setUser(null);
        return false;
      }
      store.getState().setStatus(
        err instanceof ApiError
          ? `The server refused to load the map (HTTP ${err.status}). Try reloading the page.`
          : "Can't reach the server. Check your connection and reload the page.",
      );
      return false;
    }
  }

  return {
    refresh,
    load,

    create: (type: EntityType, data: Record<string, unknown>) =>
      guard(type, String(data.id ?? "new"), () => api.createEntity(type, data)),

    update: (type: EntityType, id: string, expectedVersion: number, data: Record<string, unknown>) =>
      guard(type, id, () => api.updateEntity(type, id, expectedVersion, data)),

    remove: (type: EntityType, id: string, expectedVersion: number) =>
      guard(type, id, () => api.deleteEntity(type, id, expectedVersion)),

    /** Any other write, under the same rules: one request, one reload. */
    apply: (type: EntityType, id: string, run: () => Promise<unknown>) => guard(type, id, run),
  };
}

export type Saver = ReturnType<typeof createSaver>;
