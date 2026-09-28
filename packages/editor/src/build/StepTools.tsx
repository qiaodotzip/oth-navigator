import { live } from "@oth/model";
import { useMemo } from "react";
import type { Api } from "../api/client";
import { AssetLibrary } from "../panels/AssetLibrary";
import { DxfImportButton } from "../panels/DxfImportButton";
import { PathwayKindsPanel } from "../panels/PathwayKindsPanel";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { sizeText } from "../survey/tagging";
import { Button } from "../ui/Button";
import { Popover } from "../ui/Popover";
import { toast } from "../ui/toast";
import { DraftsFind } from "./DraftsFind";
import { DraftsPanel } from "./DraftsPanel";
import { newObjectPlacement, newPlacement } from "./placeModel";

/** Areas & rooms: find the rooms in the floor's PDF and review them, or bring in a CAD export instead of tracing. */
export function RoomsTools({ api, saver }: { api: Api; saver: Saver }) {
  return (
    <>
      <div className="flex flex-wrap items-start gap-2">
        <DraftsFind api={api} />
        <DxfImportButton saver={saver} />
      </div>
      <DraftsPanel api={api} saver={saver} />
    </>
  );
}

/** Pathways: the team's walkway types, where the pathways are drawn rather than a panel away. */
export function PathwaysTools({ saver }: { saver: Saver }) {
  const count = useEditorStore(s => s.model?.pathwayKinds.length ?? 0);
  return (
    <Popover trigger={<Button size="sm">Walkway types ({count})</Button>}>
      <div className="max-h-96 w-80 overflow-auto">
        <PathwayKindsPanel saver={saver} />
      </div>
    </Popover>
  );
}

/** The kinds of object a live one can be placed from, in Objects…, with a Place button each. */
function ObjectsToPlace({ saver }: { saver: Saver }) {
  const model = useEditorStore(s => s.model);
  const kinds = useMemo(() => (model ? live(model.objectKinds) : []), [model]);

  if (kinds.length === 0) {
    return <p className="p-2 text-sm text-stone-600">No objects yet. Tag one in Survey as an Object.</p>;
  }

  return (
    <ul className="divide-y divide-stone-200">
      {kinds.map(kind => (
        <li key={kind.id} className="flex items-center justify-between gap-2 p-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-900">{kind.nameEn}</p>
            <p className="text-xs text-stone-600">{sizeText(kind.size)}</p>
          </div>
          <Button
            size="sm"
            aria-label={`Place ${kind.nameEn}`}
            onClick={() => {
              const { model: current, selection } = useEditorStore.getState();
              // Before a floor has loaded this refuses too, so the click says
              // what it needs rather than doing nothing.
              const placed = newObjectPlacement(current, selection, kind.id);
              if (!placed.ok) {
                toast({ message: placed.reason });
                return;
              }
              void saver.create("placement", placed.data).then(saved => {
                if (!saved) return;
                useEditorStore.getState().select({ type: "placement", id: placed.data.id });
                const room = current?.rooms.find(r => r.id === placed.data.roomId);
                toast({ message: `Placed ${kind.nameEn} in ${room?.nameEn || placed.data.roomId}. Drag it into place.` });
              });
            }}
          >
            Place
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Dressing: the models back in from Blender. The whole floor goes out with Download 3D model, beside 3D. */
export function DressingTools({ api, saver }: { api: Api; saver: Saver }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <Popover trigger={<Button size="sm">Models…</Button>}>
        <div className="max-h-96 w-80 overflow-auto">
          <AssetLibrary
            api={api}
            onPlace={assetId => {
              const { model, selection } = useEditorStore.getState();
              // Before a floor has loaded this refuses too, so the click says
              // what it needs rather than doing nothing.
              const placed = newPlacement(model, selection, assetId);
              if (!placed.ok) {
                toast({ message: placed.reason });
                return;
              }
              void saver.create("placement", placed.data);
            }}
          />
        </div>
      </Popover>
      <Popover trigger={<Button size="sm">Objects…</Button>}>
        <div className="max-h-96 w-80 overflow-auto">
          <ObjectsToPlace saver={saver} />
        </div>
      </Popover>
    </div>
  );
}
