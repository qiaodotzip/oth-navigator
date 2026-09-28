import { parseModel, RoomDraftSchema, type Level, type RoomDraft } from "@oth/model";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "../api/client";
import { useDrafts } from "../build/drafts";
import { worldToScreen } from "../plan/viewport";
import { useEditorStore } from "../state/store";
import { useToasts } from "../ui/toast";
import { CheckStep } from "./CheckStep";
import { EPOCH } from "./progress";
import { change, fakeSetupApi } from "./testing";
import type { ClaudeChange } from "./types";

type Measure = (entries: { contentRect: { width: number; height: number } }[]) => void;
let measure: Measure | null = null;

class FakeResizeObserver {
  // The map's box is the only thing observed.
  constructor(cb: Measure) {
    measure ??= cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

const sq = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]];
const frame = (id: string) => ({ id, captureId: "cap_1", imageId: id, widthPx: 640, heightPx: 480 });
const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [{ id: "L1-star", levelId: "oth-L1", kind: "room", footprint: sq(0), heightM: 4, nameEn: "Starbucks" }],
  pathways: [{ id: "pw_1", levelId: "oth-L1", polyline: [[0, 20], [60, 20]], widthM: 3 }],
  captures: [{ id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" }],
  keyframes: [frame("kf_1"), frame("kf_2")],
  places: [{ id: "pl_bin", nameEn: "wastebin", category: "facility", levelId: "oth-L1" }],
  sightings: [
    { id: "s1", placeId: "pl_bin", keyframeId: "kf_1" },
    { id: "s2", placeId: "pl_bin", keyframeId: "kf_2" },
  ],
  objectKinds: [{ id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } }],
  placements: [
    { id: "pm_1", levelId: "oth-L1", objectKindId: "ok_bin", position: [12, 18, 0], sightingIds: ["s1", "s2"] },
    { id: "pm_2", levelId: "oth-L1", objectKindId: "ok_bin", position: [30, 18, 0], sightingIds: ["s2"] },
  ],
});
const L1 = model.levels[0] as Level;
const columnDraft: RoomDraft = RoomDraftSchema.parse({
  id: "rd_col", levelId: "oth-L1", nameEn: "Column 12", kind: "detail", footprint: sq(30), labelPoint: [35, 5],
  areaM2: 1, source: { checksum: "c".repeat(64), page: 1 },
});

const made = change({ auditId: "a_room", group: "rooms", summary: "Made Starbucks from a draft", entityType: "room", entityId: "L1-star" });
const rejected = change({ auditId: "a_draft", group: "drafts", summary: "Rejected the draft Column 12", entityType: "roomDraft", entityId: "rd_col", action: "delete" });
const sure = change({ auditId: "a_bin2", group: "objects", summary: "Placed wastebin by Gate 4, from 1 frame", entityType: "placement", entityId: "pm_2", confidence: "high" });
const guess = change({ auditId: "a_bin1", group: "objects", summary: "Placed wastebin near Starbucks, from 2 frames", entityType: "placement", entityId: "pm_1", confidence: "low" });
const path = change({ auditId: "a_path", group: "pathways", summary: "Drew the concourse", entityType: "pathway", entityId: "pw_1" });
const tag = change({ auditId: "a_tag", group: "labels", summary: "Tagged a frame as Starbucks", entityType: "sighting", entityId: "s1" });
const all: ClaudeChange[] = [made, rejected, sure, guess, path, tag];

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  measure = null;
  useToasts.getState().clear();
  useDrafts.getState().reset();
  const s = useEditorStore.getState();
  s.reset();
  s.setModel(model);
  s.setActiveLevel("oth-L1");
});

function open(
  api = fakeSetupApi({ listClaudeChanges: vi.fn().mockResolvedValue(all) }),
  since = "2026-09-28T09:00:00.000Z",
) {
  const saver = { refresh: vi.fn().mockResolvedValue(undefined) };
  const onLooksRight = vi.fn();
  render(<CheckStep api={api} saver={saver} level={L1} since={since} onLooksRight={onLooksRight} />);
  act(() => measure?.([{ contentRect: { width: 800, height: 600 } }]));
  return { api, saver, onLooksRight };
}
const withUndo = (undoChange: unknown) => fakeSetupApi({ listClaudeChanges: vi.fn().mockResolvedValue(all), undoChange });
const row = (auditId: string) => within(screen.getByTestId(`change-${auditId}`));
const lastToast = () => useToasts.getState().toasts.at(-1);

describe("CheckStep", () => {
  it("lists Claude's changes since this setup began, in the spec's groups, and leaves the labels to Review", async () => {
    const { api } = open();
    expect(await screen.findByRole("region", { name: "Rooms made from drafts" })).toBeTruthy();
    expect(api.listClaudeChanges).toHaveBeenCalledWith("oth-L1", "2026-09-28T09:00:00.000Z");
    expect(screen.getAllByRole("heading", { level: 2 }).map(h => h.textContent)).toEqual([
      "Rooms made from drafts 1", "Drafts rejected or set aside 1", "Objects placed 2", "Pathways 1",
    ]);
    expect(screen.queryByTestId("change-a_tag")).toBeNull();
    expect(screen.getByText(/survey label isn't listed here/).textContent)
      .toBe("Claude's 1 survey label isn't listed here: they're checked at step 3, Review Claude's labels.");
    expect(screen.getByRole("link", { name: "step 3, Review Claude's labels" }).getAttribute("href")).toBe("/floors/L1/setup/3");
  });

  it("asks for every change there is, and says so, on a floor never set up", async () => {
    const { api } = open(fakeSetupApi({ listClaudeChanges: vi.fn().mockResolvedValue(all) }), EPOCH);
    expect(await screen.findByRole("region", { name: "Rooms made from drafts" })).toBeTruthy();
    expect(api.listClaudeChanges).toHaveBeenCalledWith("oth-L1", EPOCH);
    expect(screen.getByText("Everything Claude has changed on L1.", { exact: false })).toBeTruthy();
  });

  it("puts low-confidence objects first, each with the frames it was placed from", async () => {
    open();
    const objects = within(await screen.findByRole("region", { name: "Objects placed" }));
    expect(objects.getAllByRole("listitem").map(li => li.getAttribute("data-testid"))).toEqual(["change-a_bin1", "change-a_bin2"]);
    expect(row("a_bin1").getByText("Low confidence")).toBeTruthy();
    const thumbs = [...screen.getByTestId("change-a_bin1").querySelectorAll("img")].map(img => img.getAttribute("src"));
    expect(thumbs).toEqual(["/api/keyframes/kf_1/file?w=160", "/api/keyframes/kf_2/file?w=160"]);
  });

  it("Show selects the thing on the map and frames it", async () => {
    open();
    const show = await screen.findByRole("button", { name: "Show: Drew the concourse" });
    const before = useEditorStore.getState().viewport;
    fireEvent.click(show);
    expect(useEditorStore.getState().selection).toEqual({ type: "pathway", id: "pw_1" });
    expect(useEditorStore.getState().viewport).not.toEqual(before);
  });

  it("has no Show for what isn't on the map", async () => {
    open();
    expect(await screen.findByRole("button", { name: "Show: Rejected the draft Column 12" })).toBeDisabled();
  });

  it("Show frames a draft row's outline, from the floor's own drafts, without selecting anything", async () => {
    act(() => useDrafts.getState().setDrafts("oth-L1", [columnDraft]));
    open();
    const show = await screen.findByRole("button", { name: "Show: Rejected the draft Column 12" });
    expect(show).toBeEnabled();
    const before = useEditorStore.getState().viewport;
    fireEvent.click(show);
    expect(useEditorStore.getState().selection).toBeNull();
    expect(useEditorStore.getState().viewport).not.toEqual(before);
  });

  it("has no Show for a draft row whose draft has no outline (an open draft)", async () => {
    act(() => useDrafts.getState().setDrafts("oth-L1", [{ ...columnDraft, footprint: undefined }]));
    open();
    expect(await screen.findByRole("button", { name: "Show: Rejected the draft Column 12" })).toBeDisabled();
  });

  it("Show frames a rejected draft's own box, with no draft in the floor's drafts (contract v3, amendment 3)", async () => {
    const boxed = { ...rejected, box: { minX: 26, minY: -4, maxX: 44, maxY: 14 } };
    open(fakeSetupApi({ listClaudeChanges: vi.fn().mockResolvedValue([made, boxed, sure, guess, path, tag]) }));
    const show = await screen.findByRole("button", { name: "Show: Rejected the draft Column 12" });
    expect(show).toBeEnabled();
    const before = useEditorStore.getState().viewport;
    fireEvent.click(show);
    expect(useEditorStore.getState().selection).toBeNull();
    expect(useEditorStore.getState().viewport).not.toEqual(before);
    // A box with no outline frames only: nothing is drawn.
    expect(screen.queryByTestId("draft-outline")).toBeNull();
  });

  it("Show draws a draft row's outline on the map (contract v4), until the next Show", async () => {
    const outlined = { ...rejected, box: { minX: 30, minY: 0, maxX: 40, maxY: 10 }, outline: sq(30) };
    open(fakeSetupApi({ listClaudeChanges: vi.fn().mockResolvedValue([made, outlined]) }));
    expect(screen.queryByTestId("draft-outline")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Show: Rejected the draft Column 12" }));
    const viewport = useEditorStore.getState().viewport;
    const drawn = within(screen.getByTestId("setup-map")).getByTestId("draft-outline");
    expect(drawn.getAttribute("d")).toBe(`M${sq(30).map(p => worldToScreen(viewport, p).join(",")).join("L")}Z`);
    fireEvent.click(screen.getByRole("button", { name: "Show: Made Starbucks from a draft" }));
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-star" });
    expect(screen.queryByTestId("draft-outline")).toBeNull();
  });

  it("folds a section of more than 20 rows to its first 20, and Show all unfolds it", async () => {
    const many = Array.from({ length: 25 }, (_, i) => change({
      auditId: `a_d${i}`, group: "drafts", summary: `Rejected the draft Shop ${i}`, entityType: "roomDraft", entityId: `rd_${i}`, action: "delete",
    }));
    open(fakeSetupApi({ listClaudeChanges: vi.fn().mockResolvedValue([made, ...many]) }));
    const drafts = within(await screen.findByRole("region", { name: "Drafts rejected or set aside" }));
    expect(drafts.getByRole("heading").textContent).toBe("Drafts rejected or set aside 25");
    expect(drafts.getAllByRole("listitem")).toHaveLength(20);
    expect(drafts.queryByTestId("change-a_d20")).toBeNull();
    // A section of 20 or fewer shows every row, with nothing to unfold.
    expect(within(screen.getByRole("region", { name: "Rooms made from drafts" })).queryByRole("button", { name: /^Show all/ })).toBeNull();
    fireEvent.click(drafts.getByRole("button", { name: "Show all 25" }));
    expect(drafts.getAllByRole("listitem")).toHaveLength(25);
    expect(drafts.queryByRole("button", { name: /^Show all/ })).toBeNull();
  });

  it.each([
    ["shows a section of exactly 20 rows whole", 20, false],
    ["folds a section of 21 rows to its first 20", 21, true],
  ])("%s", async (_what, n, folds) => {
    const rows = Array.from({ length: n }, (_, i) => change({
      auditId: `a_d${i}`, group: "drafts", summary: `Rejected the draft Shop ${i}`, entityType: "roomDraft", entityId: `rd_${i}`, action: "delete",
    }));
    open(fakeSetupApi({ listClaudeChanges: vi.fn().mockResolvedValue(rows) }));
    const drafts = within(await screen.findByRole("region", { name: "Drafts rejected or set aside" }));
    expect(drafts.getAllByRole("listitem")).toHaveLength(20);
    expect(drafts.queryByRole("button", { name: `Show all ${n}` }) !== null).toBe(folds);
  });

  it("lists the drafts set aside for you first, so a folded section still shows them", async () => {
    const rejects = Array.from({ length: 22 }, (_, i) => change({
      auditId: `a_r${i}`, group: "drafts", summary: `Rejected the draft Shop ${i}`, entityType: "roomDraft", entityId: `rd_${i}`, action: "delete",
    }));
    const aside = change({
      auditId: "a_aside", group: "drafts", summary: "Set aside Storage for you: two rooms there", entityType: "roomDraft", entityId: "rd_store", action: "set-aside",
    });
    open(fakeSetupApi({ listClaudeChanges: vi.fn().mockResolvedValue([...rejects, aside]) }));
    const drafts = within(await screen.findByRole("region", { name: "Drafts rejected or set aside" }));
    expect(drafts.getAllByRole("listitem")[0]!.getAttribute("data-testid")).toBe("change-a_aside");
    expect(drafts.getByRole("button", { name: "Show all 23" })).toBeTruthy();
  });

  it("Undo takes a change back, says so, and reloads the map", async () => {
    const { api, saver } = open();
    fireEvent.click(await screen.findByRole("button", { name: "Undo: Made Starbucks from a draft" }));
    expect(await row("a_room").findByText("Undone")).toBeTruthy();
    expect(api.undoChange).toHaveBeenCalledWith("a_room");
    expect(saver.refresh).toHaveBeenCalled();
    expect(lastToast()?.message).toBe("Undone: Made Starbucks from a draft.");
    expect(row("a_room").getByRole("button", { name: /^Undo/ })).toBeDisabled();
  });

  it("says why an undo is refused, on its row", async () => {
    open(withUndo(vi.fn().mockRejectedValue(new ConflictError(null, { reason: "Wei has bound Starbucks to it since." }))));
    fireEvent.click(await screen.findByRole("button", { name: "Undo: Made Starbucks from a draft" }));
    expect((await row("a_room").findByRole("alert")).textContent).toBe("Can't undo: Wei has bound Starbucks to it since.");
    expect(useToasts.getState().toasts).toEqual([]);
  });

  it("sends one undo for two quick presses", async () => {
    let answer: () => void = () => {};
    const undoChange = vi.fn(() => new Promise<void>(resolve => {
      answer = resolve;
    }));
    open(withUndo(undoChange));
    const undo = await screen.findByRole("button", { name: "Undo: Drew the concourse" });
    fireEvent.click(undo);
    fireEvent.click(undo);
    expect(undoChange).toHaveBeenCalledTimes(1);
    await act(async () => answer());
  });

  it("offers Retry when an undo doesn't reach the server", async () => {
    open(withUndo(vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))));
    fireEvent.click(await screen.findByRole("button", { name: "Undo: Drew the concourse" }));
    await waitFor(() => expect(lastToast()?.message).toBe("Couldn't undo Claude's change. Check your connection, then retry."));
    expect(lastToast()?.action?.label).toBe("Retry");
  });

  it("Looks right finishes the step, whatever is left in the list", async () => {
    const { onLooksRight } = open();
    fireEvent.click(await screen.findByRole("button", { name: "Looks right" }));
    expect(onLooksRight).toHaveBeenCalled();
  });

  it("says when Claude changed nothing here", async () => {
    open(fakeSetupApi({ listClaudeChanges: vi.fn().mockResolvedValue([]) }));
    expect(await screen.findByText("Nothing from Claude on L1 to check.")).toBeTruthy();
  });

  it("says so when the list can't be loaded, and tries again", async () => {
    const listClaudeChanges = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue([made]);
    open(fakeSetupApi({ listClaudeChanges }));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("change-a_room")).toBeTruthy();
  });
});
