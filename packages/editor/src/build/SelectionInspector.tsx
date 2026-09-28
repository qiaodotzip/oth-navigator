import { live, type MapModel } from "@oth/model";
import type { ReactNode } from "react";
import type { Api } from "../api/client";
import type { BuildStepId } from "../flow/floorProgress";
import { DetailExportButton } from "../panels/DetailExportButton";
import { Inspector } from "../panels/Inspector";
import { PathwayInspector } from "../panels/PathwayInspector";
import { PlacementInspector } from "../panels/PlacementInspector";
import { EntranceInspector, PortalInspector } from "../panels/PointInspectors";
import { PlaceCard } from "../places/PlaceCard";
import { setParams } from "../route";
import type { Saver } from "../state/save";
import { useEditorStore, type Selection } from "../state/store";
import { Kbd } from "../ui/Kbd";
import { BindPlaces, offersPlaces } from "./BindPlaces";

/** Rooms and areas are bound to a surveyed place; a detail is dressing, and has none. */
const bindable = (kind: string) => kind === "room" || kind === "area";

/**
 * The right column's top half: whatever is selected, on every step (spec §11),
 * with what the step adds to it — binding on Bind places, the Blender export
 * on Dressing. A room or area opens on the place card, what the survey says
 * is there, on every step.
 *
 * While a room's place picker is open, the picker has the column (the rail
 * gives this section most of its height for it): the room's own fields take at
 * most 30% of it and scroll, so they cannot push the places out of view.
 */
export function SelectionInspector({
  api,
  saver,
  step,
  pendingPlaceId,
  onBound,
}: {
  api: Api;
  saver: Saver;
  step: BuildStepId;
  pendingPlaceId: string | null;
  onBound: () => void;
}) {
  const model = useEditorStore(s => s.model);
  const selection = useEditorStore(s => s.selection);

  if (!model) return <p className="p-3 text-xs text-stone-500">Loading the floor…</p>;

  const chosen = selection?.type === "room" ? live(model.rooms).find(r => r.id === selection.id) : undefined;
  const picking = step === "bind" && chosen !== undefined && bindable(chosen.kind) && offersPlaces(model, chosen);
  // Two lines at this width: while the picker is open they go in with the
  // room's fields, below the fold of that box, rather than under the places.
  const keys = (
    <p className="shrink-0 px-3 pb-3 text-xs text-stone-500">
      <Kbd>Del</Kbd> or <Kbd>Backspace</Kbd> deletes it, with Undo · <Kbd>Esc</Kbd> lets it go
    </p>
  );
  const body = selection ? inspectorFor(model, selection) : null;
  // On Dressing the detail export stays in view before a detail is chosen,
  // disabled and saying what it waits for, as it was in the old editor: it
  // is how a modeller finds out the export exists.
  const detailExport = step === "dressing" && (
    <div className="border-t border-stone-200 p-3">
      <DetailExportButton />
    </div>
  );

  if (!body) {
    return (
      <div>
        <p className="p-3 text-xs text-stone-500">
          Select something on the plan, or a to-do below, to see it here.
        </p>
        {detailExport}
      </div>
    );
  }

  return (
    <div className={picking ? "flex min-h-0 flex-1 flex-col" : undefined}>
      {body}
      {detailExport}
      {!picking && keys}
    </div>
  );

  function inspectorFor(m: MapModel, s: NonNullable<Selection>): ReactNode {
    switch (s.type) {
      case "room": {
        const room = live(m.rooms).find(r => r.id === s.id);
        if (!room) return null;
        return (
          <>
            {bindable(room.kind) && (
              <PlaceCard
                key={room.id}
                api={api}
                room={room}
                // On Bind places the picker is just below; elsewhere this is the way there.
                onBindOne={step === "bind" ? undefined : () => setParams({ step: "bind" })}
              />
            )}
            <div className={picking ? "max-h-[30%] min-h-0 overflow-y-auto" : undefined}>
              <Inspector
                onRename={(id, version, nameEn) => {
                  // A blur is not an edit: only a changed name is worth a write.
                  if (nameEn !== room.nameEn) void saver.update("room", id, version, { nameEn });
                }}
                onResize={(id, version, heightM) => void saver.update("room", id, version, { heightM })}
              />
              {picking && keys}
            </div>
            {step === "bind" && bindable(room.kind) && (
              <div className={`border-t border-stone-200 p-3 ${picking ? "flex min-h-0 flex-1 flex-col" : ""}`}>
                <BindPlaces api={api} saver={saver} room={room} pendingPlaceId={pendingPlaceId} onBound={onBound} />
              </div>
            )}
          </>
        );
      }
      case "pathway":
        return live(m.pathways).some(p => p.id === s.id) ? <PathwayInspector saver={saver} /> : null;
      case "entrance":
        return live(m.entrances).some(e => e.id === s.id) ? <EntranceInspector saver={saver} /> : null;
      case "portalEndpoint":
        return live(m.portalEndpoints).some(e => e.id === s.id) ? <PortalInspector saver={saver} /> : null;
      case "placement":
        return live(m.placements).some(p => p.id === s.id) ? (
          <PlacementInspector
            onChange={(placement, patch) => void saver.update("placement", placement.id, placement.version, patch)}
          />
        ) : null;
      case "doorway":
        // The keys to delete it are named just below, with every selection.
        return live(m.doorways).some(d => d.id === s.id) ? (
          <p className="p-3 text-xs text-stone-600">
            A doorway from before pathways. If a pathway now does its job, delete it.
          </p>
        ) : null;
    }
  }
}
