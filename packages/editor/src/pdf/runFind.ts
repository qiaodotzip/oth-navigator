import { findRooms, type FindInput, type FindResult } from "./findRooms";

type Answer = { ok: true; result: FindResult } | { ok: false; message: string };

/**
 * Finds rooms in a Web Worker, handing it the raster rather than copying it.
 * The caller's `ink` is empty afterwards. Where there is no Worker (the tests,
 * under jsdom) it runs in place.
 */
export function runFindRooms(input: FindInput): Promise<FindResult> {
  if (typeof Worker === "undefined") return Promise.resolve(findRooms(input));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<Answer>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.message));
    };
    worker.onerror = event => {
      worker.terminate();
      reject(new Error(event.message || "the room finder stopped"));
    };
    worker.postMessage(input, [input.ink.buffer as ArrayBuffer]);
  });
}
