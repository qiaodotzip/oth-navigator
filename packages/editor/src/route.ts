import { useSyncExternalStore } from "react";

/**
 * Two routes do not need a router.
 *
 * The server serves index.html for any non-API path and Vite does the same in
 * development, so real paths work. This is the thirty lines that would
 * otherwise be a dependency.
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

export function useRoute(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    // Server-rendered snapshot; the editor never renders on a server, but
    // useSyncExternalStore insists and a wrong guess here would hydrate wrong.
    () => "/",
  );
}

export function navigate(path: string): void {
  window.history.pushState({}, "", path);
  // pushState does not fire popstate, so subscribers are told directly.
  for (const fn of [...listeners]) fn();
}
