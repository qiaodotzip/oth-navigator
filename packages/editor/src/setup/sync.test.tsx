import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { useEditorStore } from "../state/store";
import { POLL_MS, loadSetup, putSetup, useSetupPoll, useSetupStore } from "./sync";
import { setupState } from "./testing";
import type { SetupApi, SetupState } from "./types";

const me = { id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" };
/** A floor's setup with `n` frames still to label. */
const left = (n: number) => setupState({}, { label: { tagged: 10 - n, binned: 0, left: n } });
const stored = () => useSetupStore.getState();

beforeEach(() => {
  useSetupStore.getState().reset();
  useEditorStore.getState().reset();
  useEditorStore.getState().setUser(me);
});

describe("loadSetup", () => {
  it("keeps the floor's setup in the store", async () => {
    await loadSetup({ getSetup: vi.fn().mockResolvedValue(left(3)) }, "oth-L1");
    expect(stored().byLevel["oth-L1"]?.counts.label.left).toBe(3);
    expect(stored().failed["oth-L1"]).toBe(false);
  });

  it("keeps the last setup and marks the floor when a load fails", async () => {
    await loadSetup({ getSetup: vi.fn().mockResolvedValue(left(3)) }, "oth-L1");
    expect(await loadSetup({ getSetup: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) }, "oth-L1")).toBeNull();
    expect(stored().byLevel["oth-L1"]?.counts.label.left).toBe(3);
    expect(stored().failed["oth-L1"]).toBe(true);
  });

  it("leaves a 401 to the sign-in dialog", async () => {
    await loadSetup({ getSetup: vi.fn().mockRejectedValue(new ApiError(401, null)) }, "oth-L1");
    expect(stored().failed["oth-L1"]).toBeUndefined();
  });

  it("keeps the newer answer when an older one arrives after it", async () => {
    let answerFirst: (state: SetupState) => void = () => {};
    const getSetup = vi.fn()
      .mockImplementationOnce(() => new Promise<SetupState>(resolve => {
        answerFirst = resolve;
      }))
      .mockResolvedValueOnce(left(3));
    const first = loadSetup({ getSetup }, "oth-L1");
    await loadSetup({ getSetup }, "oth-L1");
    answerFirst(left(9));
    expect(await first).toBeNull();
    expect(stored().byLevel["oth-L1"]?.counts.label.left).toBe(3);
  });

  it("asks for the cheap setup when told light", async () => {
    const getSetup = vi.fn().mockResolvedValue(left(3));
    await loadSetup({ getSetup }, "oth-L1", { light: true });
    expect(getSetup).toHaveBeenCalledWith("oth-L1", { light: true });
  });
});

describe("putSetup", () => {
  it("keeps a setup a PUT answered with, over a load asked before it that answers after", async () => {
    let answerLoad: (state: SetupState) => void = () => {};
    const getSetup = vi.fn(() => new Promise<SetupState>(resolve => {
      answerLoad = resolve;
    }));
    const load = loadSetup({ getSetup }, "oth-L1");
    putSetup("oth-L1", left(1));
    expect(stored().byLevel["oth-L1"]?.counts.label.left).toBe(1);
    answerLoad(left(9));
    expect(await load).toBeNull();
    expect(stored().byLevel["oth-L1"]?.counts.label.left).toBe(1);
  });
});

describe("useSetupPoll", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function Poller({ api, on = true, onChange }: { api: Pick<SetupApi, "getSetup">; on?: boolean; onChange: () => void }) {
    useSetupPoll(api, "oth-L1", on, onChange);
    return null;
  }
  const wait = (ms: number) => act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

  it("asks every 5 s, and calls back only when the counts change", async () => {
    stored().put("oth-L1", left(5));
    const api = { getSetup: vi.fn().mockResolvedValueOnce(left(5)).mockResolvedValue(left(4)) };
    const onChange = vi.fn();
    render(<Poller api={api} onChange={onChange} />);
    expect(api.getSetup).not.toHaveBeenCalled();
    await wait(POLL_MS);
    expect(api.getSetup).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    await wait(POLL_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
    await wait(POLL_MS);
    expect(api.getSetup).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("never sends a second request while one is out", async () => {
    const api = {
      getSetup: vi.fn(() => new Promise<SetupState>(resolve => {
        setTimeout(() => resolve(left(5)), 12_000);
      })),
    };
    render(<Poller api={api} onChange={vi.fn()} />);
    await wait(5_000); // asked at 5 s
    expect(api.getSetup).toHaveBeenCalledTimes(1);
    await wait(10_000); // 15 s: the answer comes at 17 s
    expect(api.getSetup).toHaveBeenCalledTimes(1);
    await wait(7_000); // 22 s: asked again 5 s after the answer
    expect(api.getSetup).toHaveBeenCalledTimes(2);
  });

  it("carries on after a failure, marking the floor rather than saying so each time", async () => {
    const api = { getSetup: vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(left(5)) };
    render(<Poller api={api} onChange={vi.fn()} />);
    await wait(POLL_MS);
    expect(stored().failed["oth-L1"]).toBe(true);
    await wait(POLL_MS);
    expect(api.getSetup).toHaveBeenCalledTimes(2);
    expect(stored().failed["oth-L1"]).toBe(false);
  });

  it("stops when the step leaves the screen, and while nobody is signed in", async () => {
    const api = { getSetup: vi.fn().mockResolvedValue(left(5)) };
    const { rerender, unmount } = render(<Poller api={api} onChange={vi.fn()} />);
    await wait(POLL_MS);
    expect(api.getSetup).toHaveBeenCalledTimes(1);
    rerender(<Poller api={api} on={false} onChange={vi.fn()} />);
    await wait(3 * POLL_MS);
    expect(api.getSetup).toHaveBeenCalledTimes(1);
    rerender(<Poller api={api} onChange={vi.fn()} />);
    act(() => useEditorStore.getState().endSession("expired"));
    await wait(3 * POLL_MS);
    expect(api.getSetup).toHaveBeenCalledTimes(1);
    unmount();
  });
});
