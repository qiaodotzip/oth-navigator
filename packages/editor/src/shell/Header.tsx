import type { Api } from "../api/client";
import { findLevel } from "../flow/floors";
import { followLink, type Route } from "../route";
import { SetupStepBar } from "../setup/SetupStepBar";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { AccountMenu } from "./AccountMenu";
import { ClaudeCodeButton } from "./ClaudeCodeButton";
import { FloorSwitcher } from "./FloorSwitcher";
import { FloorTabs } from "./FloorTabs";
import { PresenceAvatars } from "./PresenceAvatars";
import { PublishButton } from "./PublishButton";

/** One row, identical on every screen. */
export function Header({ api, route }: { api: Api; saver: Saver; route: Route }) {
  const model = useEditorStore(s => s.model);
  const level = route.name === "floor" || route.name === "setup" ? findLevel(model, route.code) : null;
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
      {/* Setting a floor up, its nine steps stand where its tabs do (spec §4.2). */}
      {route.name === "setup" && level && (
        <>
          <span className="shrink-0 text-sm text-stone-600">
            Setting up <span className="text-base font-bold text-stone-900">{level.code}</span>
          </span>
          <SetupStepBar level={level} current={route.step} />
        </>
      )}
      {route.name === "team" && <span className="text-stone-500">Team</span>}
      <div className="ml-auto flex items-center gap-3">
        <PresenceAvatars />
        <ClaudeCodeButton api={api} />
        <PublishButton api={api} />
        <AccountMenu api={api} />
      </div>
    </header>
  );
}
