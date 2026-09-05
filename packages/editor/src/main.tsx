import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { createApi } from "./api/client";
import { App } from "./App";
import { useRoute } from "./route";
import { SurveyApp } from "./survey/SurveyApp";
import "./styles.css";

/** Two tools, one login, one server. The survey is a route, not an application. */
function Root() {
  const route = useRoute();
  const api = useMemo(() => createApi(), []);
  return route.startsWith("/survey") ? <SurveyApp api={api} /> : <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
