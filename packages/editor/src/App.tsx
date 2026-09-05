import { MapScene } from "@oth/renderer";
import { useEffect, useMemo, useState } from "react";
import { createApi, type EntityType } from "./api/client";
import { LoginScreen } from "./auth/LoginScreen";
import type { LayerItem } from "./flow/layers";
import { AssetLibrary } from "./panels/AssetLibrary";
import { ConflictBanner } from "./panels/ConflictBanner";
import { ContextExportButton } from "./panels/ContextExportButton";
import { DxfImportButton } from "./panels/DxfImportButton";
import { FloorplanPanel } from "./panels/FloorplanPanel";
import { Inspector } from "./panels/Inspector";
import { LayersPanel } from "./panels/LayersPanel";
import { LevelTabs } from "./panels/LevelTabs";
import { PlacementInspector } from "./panels/PlacementInspector";
import { PublishButton } from "./panels/PublishButton";
import { StepsPanel } from "./panels/StepsPanel";
import { Toolbar } from "./panels/Toolbar";
import { PlanCanvas } from "./plan/PlanCanvas";
import { createSaver } from "./state/save";
import { useEditorStore } from "./state/store";

export function App() {
  const api = useMemo(() => createApi(), []);
  const saver = useMemo(() => createSaver(api), [api]);
  const user = useEditorStore(s => s.user);
  const setUser = useEditorStore(s => s.setUser);
  const model = useEditorStore(s => s.model);
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const status = useEditorStore(s => s.status);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null)).finally(() => setChecked(true));
  }, [api, setUser]);

  useEffect(() => {
    if (user) void saver.refresh();
  }, [user, saver]);

  if (!checked) return <div className="p-6 text-sm text-stone-500">Loading…</div>;
  if (!user) return <LoginScreen api={api} onSignedIn={setUser} />;

  const renameLayer = (item: LayerItem, nameEn: string) =>
    void saver.update(item.type as EntityType, item.id, item.version, { nameEn });

  const deleteLayer = (item: LayerItem) =>
    // Soft delete: recoverable and recorded in the audit log, so no confirmation
    // dialog on every click.
    void saver.remove(item.type as EntityType, item.id, item.version);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b bg-white px-4 py-2">
        <h1 className="text-sm font-semibold">OTH Map Editor</h1>
        <LevelTabs />
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-stone-500">{user.displayName}</span>
          <PublishButton api={api} />
        </div>
      </header>

      <ConflictBanner onReload={() => void saver.refresh()} />
      <Toolbar />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 flex-col border-r bg-white">
          <div className="flex h-64 flex-col border-b">
            <h2 className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Preview
            </h2>
            <div className="min-h-0 flex-1">
              {model && activeLevelId && (
                <MapScene
                  model={model}
                  activeLevelId={activeLevelId}
                  assetUrl={api.assetFileUrl}
                />
              )}
            </div>
          </div>
          <LayersPanel onRename={renameLayer} onDelete={deleteLayer} />
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden">
          <PlanCanvas
            width={900}
            height={700}
            imageUrl={api.levelImageFileUrl}
            onReshapeRoom={(room, footprint) =>
              void saver.update("room", room.id, room.version, { footprint })
            }
            onMovePlacement={(placement, position) =>
              void saver.update("placement", placement.id, placement.version, { position })
            }
            onCommitRoom={ring => {
              if (!activeLevelId) return;
              void saver.create("room", {
                id: `${activeLevelId}-room-${Date.now()}`,
                levelId: activeLevelId,
                kind: "room",
                footprint: ring,
                heightM: 3.5,
                walkable: true,
              });
            }}
          />
        </main>

        <aside className="w-80 overflow-auto border-l bg-white">
          <StepsPanel
            sections={{
              floorplan: <FloorplanPanel api={api} saver={saver} />,
              rooms: (
                <Inspector
                  onRename={(id, version, nameEn) =>
                    void saver.update("room", id, version, { nameEn })
                  }
                />
              ),
              dressing: (
                <div className="space-y-2">
                  <ContextExportButton />
                  <DxfImportButton saver={saver} />
                  <PlacementInspector
                    onChange={(placement, patch) =>
                      void saver.update("placement", placement.id, placement.version, patch)
                    }
                  />
                  <AssetLibrary
                    api={api}
                    onPlace={assetId => {
                      const selection = useEditorStore.getState().selection;
                      if (!activeLevelId || !selection || selection.type !== "room") {
                        useEditorStore.getState().setStatus("Select a room first.");
                        return;
                      }
                      void saver.create("placement", {
                        id: `${activeLevelId}-place-${Date.now()}`,
                        levelId: activeLevelId,
                        assetId,
                        roomId: selection.id,
                        position: [0, 0, 0],
                      });
                    }}
                  />
                </div>
              ),
            }}
          />
        </aside>
      </div>

      {status && <footer className="border-t bg-stone-100 px-4 py-1 text-xs">{status}</footer>}
    </div>
  );
}
