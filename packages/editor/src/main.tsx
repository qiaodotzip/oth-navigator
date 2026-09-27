import "@fontsource-variable/inter";
import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { createApi } from "./api/client";
import { App } from "./App";
import { AuthGate } from "./auth/AuthGate";
import { useRoute } from "./route";
import { SurveyApp } from "./survey/SurveyApp";
import "./styles.css";

/** Two tools, one login, one server. The survey is a route, not an application. */
function Root() {
  const route = useRoute();
  const api = useMemo(() => createApi(), []);
  return (
    <AuthGate api={api}>
      {route.startsWith("/survey") ? <SurveyApp api={api} /> : <App api={api} />}
    </AuthGate>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
