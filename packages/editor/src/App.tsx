import { ringCentroid } from "@oth/model";
import { MapScene } from "@oth/renderer";
import { useEffect, useMemo, useState } from "react";
import { createApi } from "./api/client";
import { LoginScreen } from "./auth/LoginScreen";
import { useCollaboration } from "./collab/useCollaboration";
import { navigate } from "./route";
import { layerEntityType, type LayerItem } from "./flow/layers";
import { newPathway, newSpace } from "./flow/newSpace";
import { AssetLibrary } from "./panels/AssetLibrary";
import { BindPlacePanel } from "./panels/BindPlacePanel";
import { ConflictBanner } from "./panels/ConflictBanner";
import { LockBanner } from "./panels/LockBanner";
import { PresenceBar } from "./panels/PresenceBar";
import { ContextExportButton } from "./panels/ContextExportButton";
import { DxfImportButton } from "./panels/DxfImportButton";
import { FloorplanPanel } from "./panels/FloorplanPanel";
import { Inspector } from "./panels/Inspector";
import { PathwayInspector } from "./panels/PathwayInspector";
import { PathwayKindsPanel } from "./panels/PathwayKindsPanel";
import { LayersPanel } from "./panels/LayersPanel";
import { LevelTabs } from "./panels/LevelTabs";
import { PlacementInspector } from "./panels/PlacementInspector";
import { PublishButton } from "./panels/PublishButton";
import { StepsPanel } from "./panels/StepsPanel";
import { Toolbar } from "./panels/Toolbar";
import { DetailExportButton } from "./panels/DetailExportButton";
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

  // Before the early returns below, since hooks cannot be conditional — the
  // flag is what keeps it quiet on the login screen.
  useCollaboration(api, Boolean(user));

  if (!checked) return <div className="p-6 text-sm text-stone-500">Loading…</div>;
  if (!user) return <LoginScreen api={api} onSignedIn={setUser} />;

  const renameLayer = (item: LayerItem, nameEn: string) =>
    void saver.update(layerEntityType(item.type), item.id, item.version, { nameEn });

  const deleteLayer = (item: LayerItem) =>
    // Soft delete: recoverable and recorded in the audit log, so no confirmation
    // dialog on every click.
    void saver.remove(layerEntityType(item.type), item.id, item.version);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b bg-white px-4 py-2">
        <h1 className="text-sm font-semibold">OTH Map Editor</h1>
        <LevelTabs />
        <button
          className="text-sm text-stone-500 hover:underline"
          onClick={() => navigate("/survey")}
        >
          Survey &rarr;
        </button>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <PresenceBar />
          <span className="text-stone-500">{user.displayName}</span>
          <PublishButton api={api} />
        </div>
      </header>

      {/* The advisory warning sits above the one that means a save failed. */}
      <LockBanner />
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
            onCommitSpace={(kind, ring) => {
              if (activeLevelId) void saver.create("room", newSpace(kind, activeLevelId, ring));
            }}
            onCommitPathway={polyline => {
              if (activeLevelId) void saver.create("pathway", newPathway(activeLevelId, polyline));
            }}
          />
        </main>

        <aside className="w-80 overflow-auto border-l bg-white">
          <StepsPanel
            sections={{
              floorplan: <FloorplanPanel api={api} saver={saver} />,
              connect: (
                <div className="space-y-3">
                  <PathwayInspector saver={saver} />
                  <details
                    className="border-t pt-2"
                    // Open until there are types to show. Folded away on an
                    // empty list, the one control that creates them is behind
                    // two collapses and may as well not exist.
                    open={(model?.pathwayKinds.length ?? 0) === 0}
                  >
                    <summary className="cursor-pointer px-3 text-xs font-medium text-stone-600">
                      Walkway types ({model?.pathwayKinds.length ?? 0})
                    </summary>
                    <PathwayKindsPanel saver={saver} />
                  </details>
                </div>
              ),
              rooms: (
                <div className="space-y-3">
                <Inspector
                  onRename={(id, version, nameEn) =>
                    void saver.update("room", id, version, { nameEn })
                  }
                  onResize={(id, version, heightM) =>
                    void saver.update("room", id, version, { heightM })
                  }
                />
                <div className="px-3">
                  <BindPlacePanel
                    onBind={({ place, roomId, roomVersion, evidence }) => {
                      void saver.update("place", place.id, place.version, { roomId });
                      // The first thing in this project to move an entity off
                      // "unverified": the room is now a place someone has seen.
                      void saver.update("room", roomId, roomVersion, {
                        verification: {
                          status: "photo",
                          evidence,
                          verifiedAt: new Date().toISOString(),
                        },
                      });
                    }}
                  />
                </div>
                </div>
              ),
              dressing: (
                <div className="space-y-2">
                  <ContextExportButton />
                  <DetailExportButton />
                  <DxfImportButton saver={saver} />
                  <PlacementInspector
                    onChange={(placement, patch) =>
                      void saver.update("placement", placement.id, placement.version, patch)
                    }
                  />
                  <AssetLibrary
                    api={api}
                    onPlace={assetId => {
                      const state = useEditorStore.getState();
                      const selection = state.selection;
                      if (!activeLevelId || !selection || selection.type !== "room") {
                        state.setStatus("Select a room or detail first.");
                        return;
                      }
                      const anchor = state.model?.rooms.find(r => r.id === selection.id);
                      // The position is the offset the export used: zero for a
                      // level context mesh, which is authored in building
                      // coordinates, and the centroid for a detail mesh, which
                      // is authored about its own middle.
                      const position: [number, number, number] =
                        anchor?.kind === "detail"
                          ? [...ringCentroid(anchor.footprint), 0]
                          : [0, 0, 0];
                      void saver.create("placement", {
                        id: `${activeLevelId}-place-${Date.now()}`,
                        levelId: activeLevelId,
                        assetId,
                        roomId: selection.id,
                        position,
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
