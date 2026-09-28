import type { RoomDraft, RoomKind } from "@oth/model";
import { ApiError, ConflictError, type AcceptedDraft, type Api } from "../api/client";
import type { Saver } from "../state/save";
import { reportFailure } from "../ui/failure";
import { offerUndo } from "../ui/offerUndo";
import { loadDrafts } from "./drafts";

export type ReviewContext = { api: Api; saver: Saver; levelId: string };
export type Decision = { draft: RoomDraft; nameEn: string; kind: RoomKind };

/**
 * Drafts made rooms, all or none, with one Undo for the lot (spec §5.2 step
 * 7). A person's accept is the only way a draft becomes a room: Claude Code's
 * generic tools can't write drafts. Through the saver, so a conflict is the
 * banner, a failure is the usual toast, and the map reloads once it lands.
 * The drafts reload either way: after a refusal, the list has usually moved
 * on (a teammate searched again).
 */
export async function acceptDrafts(ctx: ReviewContext, decisions: readonly Decision[]): Promise<boolean> {
  if (decisions.length === 0) return false;
  let accepted: AcceptedDraft[] = [];
  const landed = await ctx.saver.apply("room", decisions[0]!.draft.id, async () => {
    try {
      accepted = await ctx.api.acceptRoomDrafts(decisions.map(d => ({
        id: d.draft.id, expectedVersion: d.draft.version, nameEn: d.nameEn, kind: d.kind,
      })));
    } catch (err) {
      // A 409 with nothing of anyone's to show is a teammate's accept taking a
      // new room's id first. Nothing was written and no one changed these
      // drafts, so the banner's "changed while you were editing" would be
      // wrong: it is said in the server's words, which say to accept again.
      if (err instanceof ConflictError && err.current === null) throw new ApiError(422, err.body);
      throw err;
    }
  });
  await loadDrafts(ctx.api, ctx.levelId);
  if (!landed) return false;
  const one = decisions.length === 1;
  const label = one ? decisions[0]!.nameEn : `${decisions.length} rooms`;
  // The server takes the rooms back all or none, so a refused Undo took none
  // of them. A conflict names the room that stopped it, "Shop 12, one of the
  // 2 rooms", never "2 rooms was changed".
  let failed: unknown = null;
  offerUndo({
    message: `Added ${label}`,
    undone: one ? `${label} is a draft again` : `The ${label} are drafts again`,
    what: () => {
      if (one) return label;
      if (!(failed instanceof ConflictError)) return `the ${label}`;
      const name = failed.current?.nameEn;
      return typeof name === "string" && name !== "" ? `${name}, one of the ${label},` : `one of the ${label}`;
    },
    run: async () => {
      failed = null;
      try {
        await ctx.api.unacceptRoomDrafts(accepted.map(a => ({ id: a.draftId, expectedVersion: a.draftVersion, roomVersion: a.roomVersion })));
      } catch (err) {
        failed = err;
        throw err;
      }
    },
    // Both, even when the map's reload fails: the drafts back on the list are what the Undo was for.
    refresh: async () => {
      await Promise.all([ctx.saver.refresh(), loadDrafts(ctx.api, ctx.levelId)]);
    },
  });
  return true;
}

/**
 * A draft set aside: a soft delete, with Undo. The map is not reloaded: a
 * draft is not on it. `words` lets an open space say "Took Plaza off the
 * list" rather than "Rejected".
 */
export async function rejectDraft(
  ctx: ReviewContext, draft: RoomDraft,
  words = { done: `Rejected ${draft.nameEn}`, undone: `${draft.nameEn} is back` },
): Promise<boolean> {
  try {
    await ctx.api.rejectRoomDraft(draft.id, draft.version);
  } catch (err) {
    reportFailure(err, { doing: `reject ${draft.nameEn}`, retry: () => rejectDraft(ctx, draft, words).then(() => {}) });
    await loadDrafts(ctx.api, ctx.levelId);
    return false;
  }
  await loadDrafts(ctx.api, ctx.levelId);
  offerUndo({
    message: words.done,
    undone: words.undone,
    what: draft.nameEn,
    // A delete moves the draft one version on, so that is the version its restore expects.
    run: () => ctx.api.restoreRoomDraft(draft.id, draft.version + 1),
    refresh: () => loadDrafts(ctx.api, ctx.levelId).then(() => {}),
  });
  return true;
}

/** The draft after this one, going round: what Accept, Reject and Skip take up next. Null when it was the only one. */
export function nextDraft(list: readonly RoomDraft[], id: string | null): RoomDraft | null {
  if (list.length === 0) return null;
  const i = list.findIndex(d => d.id === id);
  if (i === -1) return list[0]!;
  return list.length === 1 ? null : list[(i + 1) % list.length]!;
}
