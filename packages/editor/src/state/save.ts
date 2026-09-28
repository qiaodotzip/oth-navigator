import type { Api, EntityType, LevelImage } from "../api/client";
import { ApiError, ConflictError, isUnauthorized } from "../api/client";
import { reportFailure, serverWords, worthRetrying } from "../ui/failure";
import { toast } from "../ui/toast";
import { useEditorStore } from "./store";

/**
 * The plans a reload listed, each kept at the newest version this page has
 * seen. A list read before a plan save and answered after it still carries the
 * version that save moved past; put back, it would make the plan's next save
 * a 409 against your own change.
 */
function newestPlans(listed: readonly LevelImage[], held: readonly LevelImage[]): LevelImage[] {
  const heldById = new Map(held.map(i => [i.id, i]));
  return listed.map(i => {
    const mine = heldById.get(i.id);
    return mine && mine.version > i.version ? mine : i;
  });
}

/**
 * Every mutation goes through here so four rules hold everywhere:
 *
 * 1. A 409 becomes a conflict in the store, never an automatic retry. Retrying
 *    with the fresh version is precisely the silent overwrite optimistic
 *    locking exists to prevent — the user has to see what someone else did.
 * 2. A successful write refreshes model and report together, so the canvas
 *    always shows what the server actually accepted rather than a local guess.
 * 3. Nothing throws at the call site; callers get a boolean — true when the
 *    write landed, even if the reload after it did not.
 * 4. Any other failure is a toast that stays until dismissed, with Retry when
 *    trying again could help (spec §6).
 *
 * `validate: false` is for Survey and Review, which never show the report.
 * Running the validator bakes every level's nav grid, which costs about half
 * a second on each write for nothing anyone there looks at — and every survey
 * rule is a warning, so skipping it never hides a publish blocker.
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
    store.getState().setLevelImages(newestPlans(levelImages, store.getState().levelImages));
  }

  async function guard(
    entityType: string, entityId: string, run: () => Promise<unknown>,
    { retry }: { retry?: false } = {},
  ): Promise<boolean> {
    try {
      await run();
    } catch (err) {
      if (err instanceof ConflictError) {
        store.getState().setConflict({ entityType, entityId, current: err.current });
        return false;
      }
      // Refused as signed out: keep the page, ask for a sign-in over it, and
      // let the dialog say that this change did not land.
      if (isUnauthorized(err)) {
        store.getState().endSession("expired", true);
        return false;
      }
      // Anything else: say so, and offer to send the same write again where
      // that could work (spec §6) — unless the caller has already undone what
      // this write depended on, so that sending it again would land it alone.
      reportFailure(err, {
        doing: "save your change",
        retry: retry === false ? undefined : async () => {
          await guard(entityType, entityId, run);
        },
      });
      return false;
    }

    store.getState().setConflict(null);
    try {
      await refresh();
    } catch (err) {
      // The change landed; only the reload after it did not. Retrying the
      // write would make it twice, so the Retry here is the reload.
      if (isUnauthorized(err)) {
        store.getState().endSession("expired");
      } else {
        reportFailure(err, {
          doing: "reload the map after saving",
          retry: async () => {
            await refresh().catch(() => {});
          },
        });
      }
    }
    return true;
  }

  // One load at a time, shared by everyone who asks while it runs: StrictMode
  // runs the mount effect twice in development, and two identical failure
  // toasts read as two failures.
  let loading: Promise<boolean> | null = null;

  /**
   * The first load of a screen, which nothing is awaiting.
   *
   * An expired session asks you to sign in again; anything else is a toast,
   * with Retry where trying again could work. A bare `void refresh()` threw
   * into nowhere, and the screen just sat there empty.
   */
  function load(): Promise<boolean> {
    loading ??= attemptLoad().finally(() => {
      loading = null;
    });
    return loading;
  }

  async function attemptLoad(): Promise<boolean> {
    try {
      await refresh();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        store.getState().endSession("expired");
        return false;
      }
      // A refusal would only be refused again, so there is no Retry to offer;
      // but the screen behind it is empty, so it still says what to do next.
      if (err instanceof ApiError && !worthRetrying(err)) {
        const said = serverWords(err) ?? `the server refused it (HTTP ${err.status})`;
        toast({ tone: "error", message: `Couldn't load the map: ${said}. Reload the page to try again.` });
        return false;
      }
      reportFailure(err, {
        doing: "load the map",
        retry: async () => {
          await load();
        },
      });
      return false;
    }
  }

  return {
    refresh,
    load,

    /** `retry: false` leaves Retry off the failure toast, for a create whose caller cleans up after it fails. */
    create: (type: EntityType, data: Record<string, unknown>, options?: { retry?: false }) =>
      guard(type, String(data.id ?? "new"), () => api.createEntity(type, data), options),

    update: (type: EntityType, id: string, expectedVersion: number, data: Record<string, unknown>) =>
      guard(type, id, () => api.updateEntity(type, id, expectedVersion, data)),

    remove: (type: EntityType, id: string, expectedVersion: number) =>
      guard(type, id, () => api.deleteEntity(type, id, expectedVersion)),

    /** Any other write, under the same rules: one request, one reload. A frame is not a generic entity, so it is named here. */
    apply: (type: EntityType | "keyframe", id: string, run: () => Promise<unknown>) => guard(type, id, run),
  };
}

export type Saver = ReturnType<typeof createSaver>;
