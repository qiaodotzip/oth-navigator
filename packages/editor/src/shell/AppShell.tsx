import { useEffect, type ReactNode } from "react";
import type { Api } from "../api/client";
import { useCollaboration } from "../collab/useCollaboration";
import { ConflictBanner } from "../panels/ConflictBanner";
import type { Route } from "../route";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Header } from "./Header";
import { StatusToasts } from "./StatusToasts";

/**
 * Every signed-in screen sits in this: the header, the banners that concern
 * the whole app, then the screen. Presence and locks run here, once, whatever
 * the screen.
 */
export function AppShell({ api, saver, route, children }: { api: Api; saver: Saver; route: Route; children: ReactNode }) {
  const setTeam = useEditorStore(s => s.setTeam);

  useEffect(() => {
    // The team is needed for owners and avatars; failing to load it only costs names.
    api.listUsers().then(setTeam).catch(() => {});
  }, [api, setTeam]);

  useCollaboration(api, true);

  return (
    <div className="flex h-full flex-col">
      <Header api={api} saver={saver} route={route} />
      <ConflictBanner onReload={() => void saver.refresh()} />
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      <StatusToasts />
    </div>
  );
}
