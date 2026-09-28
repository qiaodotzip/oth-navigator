import { findRooms, type FindInput } from "./findRooms";

/**
 * The flood and the trace, off the page's thread: L1's raster is 35 Mpx, and
 * two hundred floods over it would freeze the tab for most of a minute.
 */
type Scope = { onmessage: ((event: MessageEvent<FindInput>) => void) | null; postMessage: (message: unknown) => void };
const scope = self as unknown as Scope;

scope.onmessage = event => {
  try {
    scope.postMessage({ ok: true, result: findRooms(event.data) });
  } catch (err) {
    scope.postMessage({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
};
