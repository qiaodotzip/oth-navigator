import { useMemo, useSyncExternalStore, type MouseEvent } from "react";

/**
 * A handful of routes do not need a router.
 *
 * The server serves index.html for any non-API path and Vite does the same in
 * development, so real paths work. This is the few dozen lines that would
 * otherwise be a dependency — and a pure parse and build, so what a URL means
 * is tested rather than discovered.
 */
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  window.addEventListener("popstate", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("popstate", fn);
  };
}

function notify(): void {
  // pushState and replaceState do not fire popstate, so subscribers are told directly.
  for (const fn of [...listeners]) fn();
}

export function useRoute(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    // Server-rendered snapshot; the editor never renders on a server, but
    // useSyncExternalStore insists and a wrong guess here would hydrate wrong.
    () => "/",
  );
}

export type FloorTab = "survey" | "review" | "build";
export const FLOOR_TABS: readonly FloorTab[] = ["survey", "review", "build"];

export type Route =
  | { name: "home" }
  | { name: "floors" }
  | { name: "floor"; code: string; tab: FloorTab | null; params: Record<string, string> }
  | { name: "team" }
  | { name: "legacy-survey" }
  | { name: "not-found"; path: string };

export type FloorRoute = Extract<Route, { name: "floor" }>;

/**
 * What a URL means. Floor codes are upper-cased, since "l1" typed by hand means
 * L1; a missing or unknown tab is null, for the workspace to choose.
 */
export function parseRoute(pathname: string, search = ""): Route {
  const parts = pathname.split("/").filter(Boolean).map(p => decodeURIComponent(p));
  if (parts.length === 0) return { name: "home" };
  if (parts.length === 1 && parts[0] === "survey") return { name: "legacy-survey" };
  if (parts.length === 1 && parts[0] === "team") return { name: "team" };
  if (parts[0] === "floors") {
    if (parts.length === 1) return { name: "floors" };
    if (parts.length <= 3) {
      const tab = (FLOOR_TABS as readonly string[]).includes(parts[2] ?? "")
        ? (parts[2] as FloorTab)
        : null;
      const params = Object.fromEntries(new URLSearchParams(search).entries());
      return { name: "floor", code: parts[1]!.toUpperCase(), tab, params };
    }
  }
  return { name: "not-found", path: pathname };
}

function query(params: Record<string, string>): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length === 0 ? "" : `?${new URLSearchParams(entries).toString()}`;
}

/** The URL for a route. Parameters are sorted, so the same place is always the same link. */
export function href(route: Route): string {
  switch (route.name) {
    case "home":
      return "/";
    case "floors":
      return "/floors";
    case "team":
      return "/team";
    case "legacy-survey":
      return "/survey";
    case "not-found":
      return route.path;
    case "floor":
      return `/floors/${encodeURIComponent(route.code)}${route.tab ? `/${route.tab}` : ""}${query(route.params)}`;
  }
}

function currentLocation(): string {
  return window.location.pathname + window.location.search;
}

/** The current route, re-rendering when the path or the query changes. */
export function useCurrentRoute(): Route {
  const loc = useSyncExternalStore(subscribe, currentLocation, () => "/");
  return useMemo(() => {
    const i = loc.indexOf("?");
    return i < 0 ? parseRoute(loc) : parseRoute(loc.slice(0, i), loc.slice(i));
  }, [loc]);
}

/**
 * Goes somewhere in the app. `replace` is for redirects, so Back does not land
 * on a page that immediately sends you forward again.
 */
export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (options.replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
  notify();
}

/**
 * Changes query parameters on the current page without adding history — moving
 * to the next frame is not somewhere Back should step through one by one.
 */
export function setParams(patch: Record<string, string | null>): void {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const search = entries.length === 0 ? "" : `?${new URLSearchParams(entries).toString()}`;
  window.history.replaceState({}, "", window.location.pathname + search);
  notify();
}

/**
 * An onClick for an in-app link. A plain click navigates in place; Ctrl, Cmd,
 * Shift or a middle click are left to the browser, so "open in a new tab" works.
 */
export function followLink(path: string): (event: MouseEvent) => void {
  return event => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(path);
  };
}
