import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Api } from "../api/client";
import { useEditorStore } from "../state/store";
import { useCollaboration } from "./useCollaboration";

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    listPresence: vi.fn().mockResolvedValue([
      { userId: "user_wei", displayName: "Wei", levelId: "oth-L1" },
    ]),
    listLocks: vi.fn().mockResolvedValue([
      { entityType: "room", entityId: "L1-a", lockedBy: "user_wei", lockedByName: "Wei" },
    ]),
    acquireLock: vi.fn().mockResolvedValue({}),
    releaseLock: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function Probe({ api, enabled = true }: { api: Api; enabled?: boolean }) {
  useCollaboration(api, enabled);
  return null;
}

const as = (api: ReturnType<typeof fakeApi>) => api as unknown as Api;

beforeEach(() => {
  useEditorStore.getState().reset();
});

describe("useCollaboration", () => {
  it("reports where I am, so others see which floor I am on", async () => {
    const api = fakeApi();
    useEditorStore.setState({ activeLevelId: "oth-L3" });
    render(<Probe api={as(api)} />);
    await waitFor(() => expect(api.heartbeat).toHaveBeenCalledWith("oth-L3"));
  });

  it("puts presence and locks in the store", async () => {
    render(<Probe api={as(fakeApi())} />);
    await waitFor(() => expect(useEditorStore.getState().presence).toHaveLength(1));
    expect(useEditorStore.getState().locks).toHaveLength(1);
  });

  it("claims the entity I select, so others are warned early", async () => {
    const api = fakeApi();
    render(<Probe api={as(api)} />);
    useEditorStore.getState().select({ type: "room", id: "L1-x" });
    await waitFor(() => expect(api.acquireLock).toHaveBeenCalledWith("room", "L1-x"));
  });

  it("releases it when I select something else", async () => {
    const api = fakeApi();
    render(<Probe api={as(api)} />);
    useEditorStore.getState().select({ type: "room", id: "L1-x" });
    await waitFor(() => expect(api.acquireLock).toHaveBeenCalled());
    useEditorStore.getState().select({ type: "room", id: "L1-y" });
    await waitFor(() => expect(api.releaseLock).toHaveBeenCalledWith("room", "L1-x"));
  });

  it("carries on when the claim is refused, since a lock only warns", async () => {
    const api = fakeApi({ acquireLock: vi.fn().mockRejectedValue(new Error("423")) });
    render(<Probe api={as(api)} />);
    useEditorStore.getState().select({ type: "room", id: "L1-x" });
    await waitFor(() => expect(useEditorStore.getState().locks).toHaveLength(1));
  });

  it("keeps quiet when awareness fails, since it is a nicety", async () => {
    // A blip must never surface as an error to someone who is mid-edit.
    const api = fakeApi({ listPresence: vi.fn().mockRejectedValue(new Error("offline")) });
    render(<Probe api={as(api)} />);
    await waitFor(() => expect(api.listPresence).toHaveBeenCalled());
    expect(useEditorStore.getState().status).toBeNull();
  });

  it("does not claim anything when nothing is selected", async () => {
    const api = fakeApi();
    render(<Probe api={as(api)} />);
    await waitFor(() => expect(api.listLocks).toHaveBeenCalled());
    expect(api.acquireLock).not.toHaveBeenCalled();
  });

  it("does nothing at all while signed out", async () => {
    // The login screen renders before anyone is signed in, and polling through
    // it would be a stream of 401s nobody can act on.
    const api = fakeApi();
    render(<Probe api={as(api)} enabled={false} />);
    useEditorStore.getState().select({ type: "room", id: "L1-x" });
    await new Promise(r => setTimeout(r, 30));
    expect(api.heartbeat).not.toHaveBeenCalled();
    expect(api.acquireLock).not.toHaveBeenCalled();
  });

  it("stops polling once the editor goes away", async () => {
    const api = fakeApi();
    const { unmount } = render(<Probe api={as(api)} />);
    await waitFor(() => expect(api.heartbeat).toHaveBeenCalled());
    unmount();
    const after = api.heartbeat.mock.calls.length;
    await new Promise(r => setTimeout(r, 50));
    expect(api.heartbeat.mock.calls.length).toBe(after);
  });
});
