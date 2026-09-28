import { live, type Room } from "@oth/model";
import { useState } from "react";
import type { BuildStepId } from "../flow/floorProgress";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { toast } from "../ui/toast";
import { portalFromRoom, type StopKind } from "./portalFromRoom";

/** Names the drawing gives a lift or a flight of steps. */
const NAMED_LIKE_ONE = /^(escalators?|staircase|stairs?|lifts?|elevators?)\b/i;
const WORDS: Record<StopKind, string> = { lift: "Lift", escalator: "Escalator", stair: "Stairs" };

/**
 * Turns a traced space into a lift, escalator or stairs stop that keeps its
 * outline, so 3D builds a shaft or a flight from it (spec §7). Offered on
 * Entrances & lifts, and on any step for a space the drawing named like one.
 * That is how L1's "Escalator – nn" rooms are converted in the app.
 */
export function MakeStop({ saver, room, step }: { saver: Saver; room: Room; step: BuildStepId }) {
  const model = useEditorStore(s => s.model);
  const [busy, setBusy] = useState(false);

  if (!model || room.kind === "detail" || room.kind === "void") return null;
  if (step !== "entrances" && !NAMED_LIKE_ONE.test(room.nameEn.trim())) return null;
  if (live(model.portalEndpoints).some(e => e.roomId === room.id && e.footprint)) return null;

  async function make(kind: StopKind) {
    const current = useEditorStore.getState().model;
    if (!current) return;
    const plan = portalFromRoom(current, room, kind);
    if (!plan.ok) {
      toast({ message: plan.reason });
      return;
    }
    setBusy(true);
    try {
      // The same order, and the same way back, as placing a stop by hand (commitPoint).
      if (plan.portal && !(await saver.create("portal", plan.portal, { retry: false }))) return;
      if (!(await saver.create("portalEndpoint", plan.endpoint, plan.portal ? { retry: false } : undefined))) {
        if (plan.portal) await saver.remove("portal", plan.portal.id, 0);
        return;
      }
      if (plan.roomPatch) await saver.update("room", room.id, room.version, plan.roomPatch);
      toast({
        message: plan.portal
          ? `${WORDS[kind]} added. Switch level and click its dashed outline to add its next stop.`
          : "Joined the lift or stair already at this spot on another level.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-stone-200 p-3 text-xs text-stone-600">
      <p>Is this a lift, escalator or stairs? Choose which, and 3D builds it from this outline.</p>
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
