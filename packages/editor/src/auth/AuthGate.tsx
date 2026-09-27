import { useEffect, useState, type ReactNode } from "react";
import type { Api } from "../api/client";
import { useEditorStore } from "../state/store";
import { LoginScreen } from "./LoginScreen";

/**
 * One sign-in in front of both tools.
 *
 * The map editor checked for a session and the survey did not, so a teammate
 * opening a survey link while signed out was told the server was probably not
 * running. Checking once, here, means the two tools cannot disagree about it.
 */
export function AuthGate({ api, children }: { api: Api; children: ReactNode }) {
  const user = useEditorStore(s => s.user);
  const setUser = useEditorStore(s => s.setUser);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api.me()
      .then(setUser)
      // Any failure reads as signed out; the sign-in form then says whether the
      // server can be reached at all.
      .catch(() => setUser(null))
      .finally(() => setChecked(true));
  }, [api, setUser]);

  if (!checked) return <div className="p-6 text-sm text-stone-500">Loading…</div>;
  if (!user) return <LoginScreen api={api} onSignedIn={setUser} />;
  return <>{children}</>;
}
