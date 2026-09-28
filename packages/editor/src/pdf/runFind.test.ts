import { afterEach, describe, expect, it, vi } from "vitest";
import type { FindInput, FindResult } from "./findRooms";
import type { ModelLine } from "./labels";
import { runFindRooms } from "./runFind";

const input = (): FindInput => ({
  ink: new Uint8Array(20 * 10), width: 20, height: 10, metresPerPixel: 0.1, originX: 0, originY: 1, lines: [],
});

/** A Worker that records what it is handed, and answers only when a test makes it. */
class FakeWorker {
  static made: FakeWorker[] = [];
  static refusePost = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminated = false;
  posted: { message: unknown; transfer: Transferable[] } | null = null;

  constructor() {
    FakeWorker.made.push(this);
  }

  postMessage(message: unknown, transfer: Transferable[]) {
    if (FakeWorker.refusePost) throw new DOMException("An ArrayBuffer is detached and could not be cloned.", "DataCloneError");
    this.posted = { message, transfer };
  }

  terminate() {
    this.terminated = true;
  }
}

const withWorker = () => {
  FakeWorker.made = [];
  FakeWorker.refusePost = false;
  vi.stubGlobal("Worker", FakeWorker);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runFindRooms, in place", () => {
  it("rejects rather than throwing when the finder fails, so the caller's catch sees it", async () => {
    const broken = { ...input(), lines: undefined as unknown as ModelLine[] };
    const running = (() => {
      try {
        return runFindRooms(broken);
      } catch (err) {
        return err;
      }
    })();
    expect(running).toBeInstanceOf(Promise);
    await expect(running).rejects.toThrow();
  });

  it("does not search once it has been cancelled", async () => {
    const stop = new AbortController();
    stop.abort();
    await expect(runFindRooms(input(), stop.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("runFindRooms, in a worker", () => {
  const found: FindResult = { drafts: [], skippedLabels: [] };

  it("hands the worker the raster rather than a copy, and stops it once it answers", async () => {
    withWorker();
    const given = input();
    const buffer = given.ink.buffer;
    const running = runFindRooms(given);
    const worker = FakeWorker.made[0]!;
    expect(worker.posted!.transfer).toEqual([buffer]);
    worker.onmessage!(new MessageEvent("message", { data: { ok: true, result: found } }));
    await expect(running).resolves.toEqual(found);
    expect(worker.terminated).toBe(true);
  });

  it("stops the worker and rejects when the raster can't be handed over", async () => {
    withWorker();
    FakeWorker.refusePost = true;
    await expect(runFindRooms(input())).rejects.toMatchObject({ name: "DataCloneError" });
    expect(FakeWorker.made[0]!.terminated).toBe(true);
  });

  it("stops the worker and rejects when its answer can't be read", async () => {
    withWorker();
    const running = runFindRooms(input());
    FakeWorker.made[0]!.onmessageerror!(new MessageEvent("messageerror"));
    await expect(running).rejects.toThrow("couldn't be read");
    expect(FakeWorker.made[0]!.terminated).toBe(true);
  });

  it("stops the worker when the search is cancelled", async () => {
    withWorker();
    const stop = new AbortController();
    const running = runFindRooms(input(), stop.signal);
    stop.abort();
    await expect(running).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWorker.made[0]!.terminated).toBe(true);
  });

  it("starts no worker for a search already cancelled", async () => {
    withWorker();
    const stop = new AbortController();
    stop.abort();
    await expect(runFindRooms(input(), stop.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWorker.made).toEqual([]);
  });
});
