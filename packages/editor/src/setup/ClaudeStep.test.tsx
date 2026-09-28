import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiToken } from "../api/client";
import { useClaudeCodePanel } from "../shell/claudePanel";
import { useEditorStore } from "../state/store";
import { sampleModel, sampleTeam } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { ClaudeStep } from "./ClaudeStep";
import type { ClaudeStepId } from "./steps";
import { POLL_MS, useSetupStore } from "./sync";
import { change, fakeSetupApi, setupState } from "./testing";
import type { SetupState } from "./types";

const me = { id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" };
const L1 = sampleModel.levels[0]!;
const liveToken: ApiToken = {
  id: "tok_1", name: "Laptop", ownerId: "u_sc", ownerName: "Stef Chan", mayPublish: false,
  createdAt: "2026-09-01T12:00:00Z", lastUsedAt: null, expiresAt: "2099-01-01T12:00:00Z",
};
const tokens = (list: ApiToken[]) => vi.fn().mockResolvedValue({ tokens: list, mayPublishByDefault: false });
const rooms = (waiting: number, accepted: number) => ({ waiting, accepted, rejectedOrSetAside: 0, stops: 0 });

beforeEach(() => {
  useSetupStore.getState().reset();
  useToasts.getState().clear();
  useClaudeCodePanel.getState().setOpen(false);
  const s = useEditorStore.getState();
  s.reset();
  s.setUser(me);
  s.setModel(sampleModel);
  s.setTeam(sampleTeam);
  s.setActiveLevel("oth-L1");
});

function open({ api = fakeSetupApi(), stepId = "rooms", state = setupState() }: {
  api?: ReturnType<typeof fakeSetupApi>; stepId?: ClaudeStepId; state?: SetupState;
} = {}) {
  useSetupStore.getState().put("oth-L1", state);
  const saver = { refresh: vi.fn().mockResolvedValue(undefined) };
  render(<ClaudeStep api={api} saver={saver} level={L1} stepId={stepId} />);
  return { api, saver };
}

const progress = () => within(screen.getByRole("region", { name: "Progress" }));
const count = (label: string) => progress().getByText(label).nextElementSibling?.textContent;

describe("ClaudeStep", () => {
  it("gives the command for this floor, and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // jsdom has no clipboard.
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    open();
    expect(screen.getByRole("heading", { name: "Rooms from the PDF" })).toBeTruthy();
    expect(screen.getByLabelText("Command for Claude Code").textContent).toBe("/mcp__oth__map_rooms L1");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("/mcp__oth__map_rooms L1"));
    expect(useToasts.getState().toasts.at(-1)?.message).toBe("Copied. Paste it into Claude Code.");
  });

  it("shows the step's live counts", () => {
    open({ state: setupState({}, { rooms: { waiting: 12, accepted: 150, rejectedOrSetAside: 53, stops: 8 } }) });
    expect(count("Drafts waiting")).toBe("12");
    expect(count("Made rooms")).toBe("150");
    expect(count("Rejected or set aside")).toBe("53");
    expect(count("Stops made")).toBe("8");
  });

  it("lists Claude's last five changes on the floor, from when this setup began", async () => {
    const listClaudeChanges = vi.fn().mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => change({ auditId: `a${i}`, summary: `Made room ${i} from a draft` })));
    open({
      api: fakeSetupApi({ listClaudeChanges }),
      state: setupState({ footage: { status: "done", finishedAt: "2026-09-28T09:00:00.000Z" } }),
    });
    const list = within(screen.getByRole("region", { name: "Claude's last changes" }));
    await waitFor(() => expect(list.getAllByRole("listitem")).toHaveLength(5));
    expect(list.getAllByRole("listitem")[0]!.textContent).toContain("Made room 0 from a draft");
    expect(listClaudeChanges).toHaveBeenCalledWith("oth-L1", "2026-09-28T09:00:00.000Z", 5);
  });

  it("says so while Claude has done nothing here", async () => {
    open();
    expect(await screen.findByText("Nothing from Claude on L1 yet.")).toBeTruthy();
  });

  it("leads to the Claude Code panel when you have no live token: an expired one is none", async () => {
    open({ api: fakeSetupApi({ listTokens: tokens([{ ...liveToken, expiresAt: "2020-01-01T00:00:00Z" }]) }) });
    fireEvent.click(await screen.findByRole("button", { name: "Connect Claude Code" }));
    expect(useClaudeCodePanel.getState().open).toBe(true);
  });

  it("says nothing about connecting when you have a live token, or when your tokens can't be loaded", async () => {
    const live = tokens([liveToken]);
    open({ api: fakeSetupApi({ listTokens: live }) });
    await waitFor(() => expect(live).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Connect Claude Code" })).toBeNull();
    cleanup();

    const failing = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    open({ api: fakeSetupApi({ listTokens: failing }) });
    await waitFor(() => expect(failing).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Connect Claude Code" })).toBeNull();
  });

  it("shows Claude's note once it has called finish_step", () => {
    open({
      state: setupState({
        rooms: {
          status: "done", finishedBy: "u_sc", finishedVia: "tok_1", finishedAt: new Date().toISOString(),
          note: "Made 150 rooms; 12 drafts set aside for a person",
        },
      }),
    });
    expect(screen.getByRole("status").textContent)
      .toBe("✓ Done by Claude, just now: Made 150 rooms; 12 drafts set aside for a person");
  });

  it("links to the step's own tool, to do it yourself", () => {
    open({ stepId: "paths" });
    expect(screen.getByRole("link", { name: "Do it myself on Build" }).getAttribute("href")).toBe("/floors/L1/build?step=pathways");
  });

  describe("while Claude works", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });
    const flush = () => act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const nextPoll = () => act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });

    it("asks every 5 s, and reloads the map and Claude's changes when the counts move", async () => {
      const before = setupState({}, { rooms: rooms(12, 0) });
      const after = setupState({}, { rooms: rooms(2, 10) });
      const getSetup = vi.fn().mockResolvedValueOnce(before).mockResolvedValue(after);
      const listClaudeChanges = vi.fn().mockResolvedValue([]);
      const { saver } = open({ api: fakeSetupApi({ getSetup, listClaudeChanges }), state: before });
      await flush();
      expect(listClaudeChanges).toHaveBeenCalledTimes(1);
      await nextPoll(); // the same counts
      expect(saver.refresh).not.toHaveBeenCalled();
      await nextPoll(); // Claude has made ten rooms
      expect(saver.refresh).toHaveBeenCalledTimes(1);
      expect(listClaudeChanges).toHaveBeenCalledTimes(2);
      expect(count("Made rooms")).toBe("10");
    });

    it("says so, quietly, while the server can't be reached, and carries on", async () => {
      const getSetup = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(setupState());
      open({ api: fakeSetupApi({ getSetup }) });
      await flush();
      await nextPoll();
      expect(screen.getByText("Can't reach the server. Trying again every 5 seconds.")).toBeTruthy();
      expect(useToasts.getState().toasts).toEqual([]);
      await nextPoll();
      expect(screen.queryByText(/Can't reach the server/)).toBeNull();
    });
  });
});
