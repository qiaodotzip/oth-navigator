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
import { newPlacement } from "./placeModel";

/** Areas & rooms: a CAD export can stand in for tracing. */
export function RoomsTools({ saver }: { saver: Saver }) {
  return <DxfImportButton saver={saver} />;
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
              const s = useEditorStore.getState();
              if (!s.model || !s.activeLevelId) return;
              const placed = newPlacement(s.model, s.activeLevelId, s.selection, assetId);
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
