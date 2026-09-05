import { MapScene } from "@oth/renderer";
import { useEffect, useMemo, useState } from "react";
import { createApi } from "./api/client";
import { LoginScreen } from "./auth/LoginScreen";
import { AssetLibrary } from "./panels/AssetLibrary";
import { ContextExportButton } from "./panels/ContextExportButton";
import { DxfImportButton } from "./panels/DxfImportButton";
import { FloorplanPanel } from "./panels/FloorplanPanel";
import { ConflictBanner } from "./panels/ConflictBanner";
import { Inspector } from "./panels/Inspector";
import { LevelSwitcher } from "./panels/LevelSwitcher";
import { PublishButton } from "./panels/PublishButton";
import { Toolbar } from "./panels/Toolbar";
import { ValidationPanel } from "./panels/ValidationPanel";
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

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-white px-4 py-2">
        <h1 className="text-sm font-semibold">OTH Map Editor</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-stone-500">{user.displayName}</span>
          <PublishButton api={api} />
        </div>
      </header>

      <ConflictBanner onReload={() => void saver.refresh()} />
      <Toolbar />

      <div className="flex min-h-0 flex-1">
        <aside className="w-16 border-r bg-stone-100">
          <LevelSwitcher />
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden">
          <PlanCanvas
            width={900}
            height={700}
            imageUrl={api.levelImageFileUrl}
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

        <aside className="flex w-80 flex-col border-l bg-white">
          <div className="flex h-1/2 flex-col border-b">
            <h2 className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide">
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
          <div className="min-h-0 flex-1 overflow-auto">
            <FloorplanPanel api={api} saver={saver} />
            <Inspector
              onRename={(id, version, nameEn) => void saver.update("room", id, version, { nameEn })}
            />
            <ValidationPanel />

            <div className="space-y-2 border-t p-3">
              <ContextExportButton />
              <DxfImportButton saver={saver} />
            </div>

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
        </aside>
      </div>

      {status && <footer className="border-t bg-stone-100 px-4 py-1 text-xs">{status}</footer>}
    </div>
  );
}
