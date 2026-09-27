import type { Api } from "../api/client";
import { findLevel } from "../flow/floors";
import { followLink, type Route } from "../route";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { FloorSwitcher } from "./FloorSwitcher";
import { FloorTabs } from "./FloorTabs";
import { PresenceAvatars } from "./PresenceAvatars";

/** One row, identical on every screen. */
export function Header({ route }: { api: Api; saver: Saver; route: Route }) {
  const model = useEditorStore(s => s.model);
  const level = route.name === "floor" ? findLevel(model, route.code) : null;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-4">
      <a href="/floors" onClick={followLink("/floors")} className="font-semibold tracking-tight">
        OTH Map
      </a>
      {route.name === "floor" && level && (
        <>
          <FloorSwitcher current={level} tab={route.tab ?? "build"} />
          <FloorTabs level={level} tab={route.tab} />
        </>
      )}
      {route.name === "team" && <span className="text-stone-500">Team</span>}
      <div className="ml-auto flex items-center gap-3">
        <PresenceAvatars />
      </div>
    </header>
  );
}
