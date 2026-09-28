import { parseModel } from "@oth/model";
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
const rooms = (waiting: number, accepted: number) => ({ waiting, setAside: 0, accepted, rejected: 0, stops: 0 });

// The map's box, as CheckStep's own tests measure it: jsdom's ResizeObserver
// never fires on its own.
type Measure = (entries: { contentRect: { width: number; height: number } }[]) => void;
let measure: Measure | null = null;
class FakeResizeObserver {
  constructor(cb: Measure) {
    measure ??= cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  measure = null;
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
  act(() => measure?.([{ contentRect: { width: 800, height: 600 } }]));
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

  it("shows the step's live counts: what Claude set aside for you apart from what it rejected", () => {
    open({ state: setupState({}, { rooms: { waiting: 12, setAside: 184, accepted: 150, rejected: 1, stops: 8 } }) });
    expect(count("Drafts waiting")).toBe("12");
    expect(count("Made rooms")).toBe("150");
    expect(count("Set aside for you")).toBe("184");
    expect(count("Rejected")).toBe("1");
    expect(count("Stops made")).toBe("8");
  });

  it("counts the rooms with a door no route reaches, and shows a dash while that isn't known", () => {
    open({ stepId: "paths", state: setupState({}, { paths: { pathways: 38, entrances: 0, unreachable: 167 } }) });
    expect(count("Rooms with a door no route reaches")).toBe("167");
    cleanup();
    open({ stepId: "paths", state: setupState({}, { paths: { pathways: 38, entrances: 0, unreachable: null } }) });
    expect(count("Rooms with a door no route reaches")).toBe("–");
  });

  it("lists Claude's last five changes for this step, from when this setup began", async () => {
    const listClaudeChanges = vi.fn().mockResolvedValue([
      change({ auditId: "p", group: "pathways", summary: "Drew a pathway, 1 m" }),
      change({ auditId: "t", group: "labels", summary: "Tagged Festive Walk seating" }),
      ...Array.from({ length: 6 }, (_, i) => change({ auditId: `a${i}`, summary: `Made room ${i} from a draft` })),
      change({ auditId: "s", group: "stops", summary: "Made Escalator - 03 an escalator stop" }),
    ]);
    open({
      api: fakeSetupApi({ listClaudeChanges }),
      state: setupState({ footage: { status: "done", finishedAt: "2026-09-28T09:00:00.000Z" } }),
    });
    const list = within(screen.getByRole("region", { name: "Claude's last changes" }));
    await waitFor(() => expect(list.getAllByRole("listitem")).toHaveLength(5));
    expect(list.getAllByRole("listitem").map(li => li.textContent)).toEqual(
      [0, 1, 2, 3, 4].map(i => expect.stringContaining(`Made room ${i} from a draft`)),
    );
    // Enough of Claude's last changes on the floor to find five of this step's among them.
    expect(listClaudeChanges).toHaveBeenCalledWith("oth-L1", "2026-09-28T09:00:00.000Z", 100);
  });

  it("says so while Claude has done nothing for this step here", async () => {
    open({ api: fakeSetupApi({ listClaudeChanges: vi.fn().mockResolvedValue([change({ auditId: "p", group: "pathways" })]) }) });
    expect(await screen.findByText("Nothing from Claude for this step on L1 yet.")).toBeTruthy();
  });

  it("says so in one line when Claude's changes can't be loaded", async () => {
    open({ api: fakeSetupApi({ listClaudeChanges: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) }) });
    expect(await screen.findByText("Couldn't load Claude's last changes. They load again when the counts move.")).toBeTruthy();
  });

  it("says what to watch for at each step, and to run the command again if Claude stops", () => {
    open({ stepId: "label" });
    expect(screen.getByText(/watch the counts below as it labels the survey's frames/)).toBeTruthy();
    expect(screen.queryByText(/watch the map fill in/)).toBeNull();
    expect(screen.getByText("If Claude stops, run the same command again: it carries on.")).toBeTruthy();
    cleanup();
    open({ stepId: "rooms" });
    expect(screen.getByText(/watch the rooms fill in on the map/)).toBeTruthy();
  });

  it("lets go of anything picked on the map at once, so no lock of yours stops Claude's writes", () => {
    useEditorStore.getState().setModel(parseModel({
      ...sampleModel,
      rooms: [{ id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 4 }],
    }));
    useEditorStore.getState().select({ type: "room", id: "L1-a" });
    open();
    expect(useEditorStore.getState().selection).toBeNull();
    act(() => useEditorStore.getState().select({ type: "room", id: "L1-a" }));
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it("never selects on a click at all: select-then-release still races acquireLock and releaseLock over the network", () => {
    useEditorStore.getState().setModel(parseModel({
      ...sampleModel,
      rooms: [{ id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 4 }],
    }));
    open();
    // Zustand's subscribers fire synchronously on every set, so this catches
    // even a selection let go again before React's own effects run.
    const seen: unknown[] = [];
    const unsubscribe = useEditorStore.subscribe(s => seen.push(s.selection));
    fireEvent.click(screen.getByTestId("room-L1-a"));
    unsubscribe();
    expect(seen).not.toContainEqual({ type: "room", id: "L1-a" });
    expect(useEditorStore.getState().selection).toBeNull();
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

  it("says, as a warning, that Claude stopped with work left when the counts still show some", () => {
    open({
      stepId: "things",
      state: setupState(
        { things: { status: "done", finishedBy: "u_sc", finishedVia: "tok_1", finishedAt: new Date().toISOString(), note: "" } },
        { things: { bound: 6, unbound: 13, objects: [] } },
      ),
    });
    expect(screen.getByRole("status").textContent).toBe("! Claude stopped with 13 places not bound, just now");
    expect(screen.queryByText(/Done by Claude/)).toBeNull();
  });

  it("shows neither Done nor a warning on the paths step while unreachable isn't known yet", () => {
    // Fix: the light setup (Floors home, Review) leaves paths.unreachable
    // null, and a false green tick showed until the full GET landed.
    open({
      stepId: "paths",
      state: setupState(
        { paths: { status: "done", finishedBy: "u_sc", finishedVia: "tok_1", finishedAt: new Date().toISOString(), note: "" } },
        { paths: { pathways: 38, entrances: 0, unreachable: null } },
      ),
    });
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByText(/Done by Claude/)).toBeNull();
    expect(screen.queryByText(/Claude stopped/)).toBeNull();
  });

  it("shows Done on the paths step once unreachable is known, even at zero", () => {
    open({
      stepId: "paths",
      state: setupState(
        { paths: { status: "done", finishedBy: "u_sc", finishedVia: "tok_1", finishedAt: new Date().toISOString(), note: "" } },
        { paths: { pathways: 38, entrances: 4, unreachable: 0 } },
      ),
    });
    expect(screen.getByRole("status").textContent).toBe("✓ Done by Claude, just now");
  });

  it("keeps its status line in place, so a screen reader hears the line when it changes", () => {
    open();
    const line = screen.getByRole("status");
    expect(line.textContent).toBe("");
    act(() => useSetupStore.getState().put("oth-L1", setupState({
      rooms: { status: "done", finishedBy: "u_sc", finishedVia: "tok_1", finishedAt: new Date().toISOString(), note: "" },
    })));
    expect(screen.getByRole("status")).toBe(line);
    expect(line.textContent).toBe("✓ Done by Claude, just now");
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
