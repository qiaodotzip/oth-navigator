import type { Api } from "../api/client";
import { findLevel } from "../flow/floors";
import { followLink, type Route } from "../route";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { AccountMenu } from "./AccountMenu";
import { FloorSwitcher } from "./FloorSwitcher";
import { FloorTabs } from "./FloorTabs";
import { PresenceAvatars } from "./PresenceAvatars";
import { PublishButton } from "./PublishButton";

/** One row, identical on every screen. */
export function Header({ api, route }: { api: Api; saver: Saver; route: Route }) {
  const model = useEditorStore(s => s.model);
  const level = route.name === "floor" ? findLevel(model, route.code) : null;
  // On Build, the floor links keep the step you are on. "New lift placed.
  // Switch floor…" means its next stop is on the next floor at this same step,
  // not wherever that floor's first unfinished step is.
  const buildStep = route.name === "floor" && route.tab === "build" ? route.params.step : undefined;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-stone-200 bg-white px-4">
      <a href="/floors" onClick={followLink("/floors")} className="font-semibold tracking-tight">
        OTH Map
      </a>
      {route.name === "floor" && level && (
        <>
          <FloorSwitcher current={level} tab={route.tab ?? "build"} buildStep={buildStep} />
          <FloorTabs level={level} tab={route.tab} buildStep={buildStep} />
        </>
      )}
      {route.name === "team" && <span className="text-stone-500">Team</span>}
      <div className="ml-auto flex items-center gap-3">
        <PresenceAvatars />
        <PublishButton api={api} />
        <AccountMenu api={api} />
      </div>
    </header>
  );
}
