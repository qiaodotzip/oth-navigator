import { AsyncLocalStorage } from "node:async_hooks";

const via = new AsyncLocalStorage<string>();

/**
 * Runs `fn` so that every audit row it writes says it came through `tokenId`
 * (spec §6.4: "Wei via Claude Code"). Carried by the async context rather
 * than a parameter, so every write a tool reaches is marked, the lifted
 * review and bin transactions included, without threading a new argument
 * through each repository function.
 */
export function withVia<T>(tokenId: string, fn: () => Promise<T>): Promise<T> {
  return via.run(tokenId, fn);
}

/** The token the current call came through, or null for a change made in the app. */
export function currentVia(): string | null {
  return via.getStore() ?? null;
}
