import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { createApi } from "./api/client";
import { AuthGate } from "./auth/AuthGate";
import { Workspace } from "./shell/Workspace";
import { useEditorStore } from "./state/store";
import { Toaster } from "./ui/Toaster";
import "@fontsource-variable/inter";
import "./styles.css";

/** One application, one sign-in, one server. The toaster sits outside the gate so sign-in errors can use it too. */
function Root() {
  const api = useMemo(
    () =>
      createApi({
        onUnauthorized: () => {
          // A signed-out visitor's requests 401 too (locks, presence); only a
          // session that was actually signed in has "expired".
          if (useEditorStore.getState().user) useEditorStore.getState().endSession("expired");
        },
      }),
    [],
  );
  return (
    <>
      <AuthGate api={api}>
        <Workspace api={api} />
      </AuthGate>
      <Toaster />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
