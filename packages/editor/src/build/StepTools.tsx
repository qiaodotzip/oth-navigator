import type { Api } from "../api/client";
import { AssetLibrary } from "../panels/AssetLibrary";
import { ContextExportButton } from "../panels/ContextExportButton";
import { DxfImportButton } from "../panels/DxfImportButton";
import { PathwayKindsPanel } from "../panels/PathwayKindsPanel";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { Popover } from "../ui/Popover";
import { toast } from "../ui/toast";
import { DraftsFind } from "./DraftsFind";
import { DraftsPanel } from "./DraftsPanel";
import { newPlacement } from "./placeModel";

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

/** Dressing: the level out to Blender, and the models back in. */
export function DressingTools({ api, saver }: { api: Api; saver: Saver }) {
  return (
    <div className="space-y-2">
      <ContextExportButton />
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
    </div>
  );
}
