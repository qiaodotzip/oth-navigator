import { findRooms, type FindInput, type FindResult } from "./findRooms";

type Answer = { ok: true; result: FindResult } | { ok: false; message: string };

/** Why a cancelled search stopped: the signal's own reason, or an AbortError where it gives none. */
const stopped = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException("The room finder was stopped.", "AbortError");

/**
 * Finds rooms in a Web Worker, handing it the raster rather than copying it.
 * The caller's `ink` is empty afterwards. Where there is no Worker (the tests,
 * under jsdom) it runs in place. Either way a failure rejects, and never throws
 * at the caller. Cancelling through `signal` stops the worker where it is.
 */
export function runFindRooms(input: FindInput, signal?: AbortSignal): Promise<FindResult> {
  if (typeof Worker === "undefined") {
    return new Promise(resolve => {
      if (signal?.aborted) throw stopped(signal);
      resolve(findRooms(input));
    });
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) throw stopped(signal);
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const cancel = () => fail(stopped(signal!));
    const finish = () => {
      worker.terminate();
      signal?.removeEventListener("abort", cancel);
    };
    const fail = (err: unknown) => {
      finish();
      reject(err);
    };
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = (event: MessageEvent<Answer>) => {
      finish();
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.message));
    };
    worker.onerror = event => fail(new Error(event.message || "the room finder stopped"));
    worker.onmessageerror = () => fail(new Error("the room finder's answer couldn't be read"));
    try {
      worker.postMessage(input, [input.ink.buffer as ArrayBuffer]);
    } catch (err) {
      // A raster already handed over, or too big to hand over: the worker would wait for ever.
      fail(err);
    }
  });
}
