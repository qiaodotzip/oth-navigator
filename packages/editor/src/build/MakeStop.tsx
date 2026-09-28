import {
  OPENED, floorAbove, isOpen, live, namedLikeAStop, portalFromRoom,
  type MapModel, type Room, type StopKind, type StopPlan,
} from "@oth/model";
import { useState } from "react";
import type { Api } from "../api/client";
import type { BuildStepId } from "../flow/floorProgress";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { offerUndo } from "../ui/offerUndo";
import { toast } from "../ui/toast";

const WORDS: Record<StopKind, string> = { lift: "Lift", escalator: "Escalator", stair: "Stairs" };

/**
 * What landed, and what to do next. A new lift or stair needs its next stop,
 * which has to stand in a traced space: when the floor above has none there,
 * that comes first.
 */
function said(model: MapModel, kind: StopKind, plan: Extract<StopPlan, { ok: true }>): string {
  if (plan.placedByHand) return `${WORDS[kind]} built from this outline, at the stop already here.`;
  if (!plan.portal) return "Joined the lift or stair already at this spot on another floor.";
  const above = floorAbove(model, plan.endpoint.levelId, plan.endpoint.point);
  if (above && !above.landing) {
    return `${WORDS[kind]} added. ${above.code} has no space traced over this spot yet: trace its landing there first, then switch floor and click the dashed outline to add the next stop.`;
  }
  return `${WORDS[kind]} added. Switch floor and click its dashed outline to add its next stop.`;
}

/**
 * Turns a traced space into a lift, escalator or stairs stop that keeps its
 * outline, so 3D builds a shaft or a flight from it (spec §7). Offered on
 * Entrances & lifts, and on any step for a space the drawing named as one.
 * That is how L1's "Escalator – nn" rooms are converted in the app.
 *
 * A space whose stop is saved but which is still closed, because opening it
 * failed or someone closed it since, is offered the rest: Finish opening it.
 */
export function MakeStop({ api, saver, room, step }: { api: Api; saver: Saver; room: Room; step: BuildStepId }) {
  const model = useEditorStore(s => s.model);
  const [busy, setBusy] = useState(false);

  if (!model || room.kind === "detail" || room.kind === "void") return null;
  const label = room.nameEn.trim() || "This space";
  const named = room.nameEn.trim() || "this space";
  // Written as the room was when clicked: each write moves it one version on,
  // so Undo expects exactly that, and a teammate's change since is refused.
  const reopen = () => api.updateEntity("room", room.id, room.version + 1, { kind: room.kind, walkable: room.walkable });

  if (live(model.portalEndpoints).some(e => e.roomId === room.id && e.footprint)) {
    if (isOpen(room)) return null;
    const finish = async () => {
      setBusy(true);
      try {
        if (!(await saver.update("room", room.id, room.version, OPENED))) return;
        offerUndo({ message: `Opened ${named}`, undone: `${label} is closed again`, what: `opening ${named}`, run: reopen, refresh: saver.refresh });
      } finally {
        setBusy(false);
      }
    };
    return (
      <div className="shrink-0 space-y-2 border-b border-stone-200 p-3 text-xs text-stone-600">
        <p>Its lift or stair is saved, but the space still has walls and isn't walkable, so routes can't reach the stop.</p>
        <Button size="sm" disabled={busy} onClick={() => void finish()}>Finish opening it</Button>
      </div>
    );
  }

  if (step !== "entrances" && !namedLikeAStop(room.nameEn)) return null;

  async function make(kind: StopKind) {
    const current = useEditorStore.getState().model;
    if (!current) return;
    const plan = portalFromRoom(current, room, kind);
    if (!plan.ok) {
      toast({ tone: "error", message: plan.reason });
      return;
    }
    const message = said(current, kind, plan);
    // What each write landed, to take back in the reverse order. Kept across
    // attempts, so an Undo's Retry carries on from the step that stopped it.
    const undo: Array<() => Promise<unknown>> = [];
    setBusy(true);
    try {
      // The same order, and the same way back, as placing a stop by hand (commitPoint).
      if (plan.portal) {
        if (!(await saver.create("portal", plan.portal, { retry: false }))) return;
        const { id } = plan.portal;
        undo.unshift(() => api.deleteEntity("portal", id, 0));
      }
      if (plan.kindPatch) {
        const { portalId, version, to, from } = plan.kindPatch;
        if (!(await saver.update("portal", portalId, version, to))) return;
        undo.unshift(() => api.updateEntity("portal", portalId, version + 1, from));
      }
      const { endpoint } = plan;
      if (plan.placedByHand) {
        const { version } = plan.placedByHand;
        if (!(await saver.update("portalEndpoint", endpoint.id, version, { footprint: endpoint.footprint }))) {
          if (plan.kindPatch) await saver.update("portal", plan.kindPatch.portalId, plan.kindPatch.version + 1, plan.kindPatch.from);
          return;
        }
        undo.unshift(() => api.updateEntity("portalEndpoint", endpoint.id, version + 1, { footprint: null }));
      } else {
        if (!(await saver.create("portalEndpoint", endpoint, plan.portal ? { retry: false } : undefined))) {
          if (plan.portal) await saver.remove("portal", plan.portal.id, 0);
          return;
        }
        undo.unshift(() => api.deleteEntity("portalEndpoint", endpoint.id, 0));
      }
      // Not opened, not done: the saver has said why, with Retry, and the
      // inspector now offers Finish opening it rather than a success.
      if (plan.roomPatch) {
        if (!(await saver.update("room", room.id, room.version, plan.roomPatch))) return;
        undo.unshift(reopen);
      }
      offerUndo({
        message,
        undone: `${label} is back as it was`,
        what: `the ${WORDS[kind].toLowerCase()} in ${named}`,
        run: async () => {
          while (undo.length > 0) {
            await undo[0]!();
            undo.shift();
          }
        },
        refresh: saver.refresh,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 space-y-2 border-b border-stone-200 p-3 text-xs text-stone-600">
      <p>
        Is this a lift, escalator or stairs? Choose which, and 3D builds it from this outline. The space loses its
        walls and becomes walkable, so routes can reach the stop.
      </p>
      <div className="flex gap-2">
        {(["lift", "escalator", "stair"] as const).map(kind => (
          <Button key={kind} size="sm" disabled={busy} onClick={() => void make(kind)}>
            {WORDS[kind]}
          </Button>
        ))}
      </div>
    </div>
  );
}
