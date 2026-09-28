import { useEffect, useMemo } from "react";
import type { Api } from "../api/client";
import { FloorWorkspace } from "../floor/FloorWorkspace";
import { yourFloor } from "../flow/floors";
import { FloorsHome } from "../home/FloorsHome";
import { href, navigate, useCurrentRoute } from "../route";
import { SetupWizard } from "../setup/SetupWizard";
import { asSetupApi } from "../setup/setupApi";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { TeamPage } from "../team/TeamPage";
import { recall } from "../ui/remember";
import { AppShell } from "./AppShell";

/** Every signed-in screen: one shell, one saver, and the route picks what fills it. */
export function Workspace({ api }: { api: Api }) {
  const route = useCurrentRoute();
  const saver = useMemo(() => createSaver(api), [api]);
  const model = useEditorStore(s => s.model);
  const user = useEditorStore(s => s.user);

  useEffect(() => {
    void saver.load();
  }, [saver]);

  // Redirects: the root and anything unknown go home; an old survey link goes
  // to your floor's survey. Replaced, so Back never lands on a redirect.
  useEffect(() => {
    if (route.name === "home" || route.name === "not-found") navigate("/floors", { replace: true });
    if (route.name === "legacy-survey" && model) {
      const floor = yourFloor(model, user?.id ?? null, recall("lastFloor"));
      navigate(floor ? href({ name: "floor", code: floor.code, tab: "survey", params: {} }) : "/floors", { replace: true });
    }
  }, [route, model, user]);

  return (
    <AppShell api={api} saver={saver} route={route}>
      {route.name === "floors" && <FloorsHome api={api} saver={saver} />}
      {route.name === "team" && <TeamPage api={api} />}
      {route.name === "floor" && <FloorWorkspace api={api} saver={saver} route={route} />}
      {route.name === "setup" && <SetupWizard api={asSetupApi(api)} route={route} />}
    </AppShell>
  );
}
