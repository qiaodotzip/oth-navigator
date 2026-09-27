import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { createApi } from "./api/client";
import { AuthGate } from "./auth/AuthGate";
import { Workspace } from "./shell/Workspace";
import { Toaster } from "./ui/Toaster";
import "@fontsource-variable/inter";
import "./styles.css";

/** One application, one sign-in, one server. The toaster sits outside the gate so sign-in errors can use it too. */
function Root() {
  const api = useMemo(() => createApi(), []);
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
