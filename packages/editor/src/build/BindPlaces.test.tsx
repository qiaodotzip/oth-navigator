import { parseModel, type MapModel } from "@oth/model";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { BindPlaces, BindTools, offersPlaces } from "./BindPlaces";

const square = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]];

const base = {
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-a", levelId: "oth-L1", kind: "room", footprint: square(0), heightM: 3.5 },
    { id: "L1-other", levelId: "oth-L1", kind: "room", footprint: square(20), heightM: 3.5 },
  ],
  captures: [{ id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" }],
  keyframes: [
    { id: "kf_1", captureId: "cap_1", imageId: "kf_1", widthPx: 640, heightPx: 480 },
    { id: "kf_2", captureId: "cap_1", imageId: "kf_2", widthPx: 640, heightPx: 480 },
  ],
};

const model = parseModel({
  ...base,
  places: [
    { id: "pl_books", nameEn: "Anchor Books", category: "retail", levelId: "oth-L1" },
    // No floor of its own; filmed on L1's footage.
    { id: "pl_mall", nameEn: "Festive Mall", category: "retail" },
    { id: "pl_gym", nameEn: "Gym", category: "sports", levelId: "oth-L2" },
    { id: "pl_tea", nameEn: "iTea", category: "retail", levelId: "oth-L1", status: "proposed" },
    { id: "pl_link", nameEn: "Covered link", category: "facility", levelId: "oth-L1", pathwayKindId: "pk-1" },
    { id: "pl_taken", nameEn: "Taken", category: "retail", levelId: "oth-L1", roomId: "L1-other" },
    // No floor, and never filmed on footage that has one.
    { id: "pl_lost", nameEn: "Somewhere", category: "retail" },
  ],
  sightings: [
    { id: "s1", placeId: "pl_mall", keyframeId: "kf_1" },
    { id: "s2", placeId: "pl_mall", keyframeId: "kf_2" },
  ],
});

// Bound, then its room deleted to be drawn again. The place still names it.
const orphaned = parseModel({
  ...base,
  rooms: [
    ...base.rooms,
    { id: "L1-gone", levelId: "oth-L1", kind: "room", footprint: square(40), heightM: 3.5, deletedAt: "2026-09-28T08:00:00.000Z" },
  ],
  places: [{ id: "pl_gate", nameEn: "Gate 2", category: "facility", levelId: "oth-L1", roomId: "L1-gone" }],
});

// Two confirmed tags: the first in model order has no box, the second boxes the sign.
const boxed = parseModel({
  ...base,
  places: [{ id: "pl_kopi", nameEn: "Kopitiam", category: "retail", levelId: "oth-L1" }],
  sightings: [
    { id: "s1", placeId: "pl_kopi", keyframeId: "kf_1" },
    { id: "s2", placeId: "pl_kopi", keyframeId: "kf_2", box: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 } },
  ],
});

// Typed with its arguments: `vi.fn(async () => true)` records calls as `[]`,
// and reading an argument off one would not type-check.
function setup({
  m = model,
  pendingPlaceId = null as string | null,
  update = vi.fn(async (..._args: unknown[]) => true),
} = {}) {
  useEditorStore.getState().setModel(m);
  const api = fakeApi();
  const refresh = vi.fn(async () => {});
  const onBound = vi.fn();
  const room = m.rooms.find(r => r.id === "L1-a")!;
  render(
    <BindPlaces api={api} saver={{ update, refresh } as unknown as Saver} room={room} pendingPlaceId={pendingPlaceId} onBound={onBound} />,
  );
  return { api, update, refresh, onBound, room };
}

// `hidden: true`, because the floorless list sits in a closed <details>.
const names = (list: HTMLElement) =>
  within(list).getAllByRole("button", { hidden: true }).map(b => b.getAttribute("aria-label"));

const toasts = () => useToasts.getState().toasts;
const undoIt = async () => { await toasts().find(t => t.action?.label === "Undo")!.action!.run(); };

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
});

describe("BindPlaces", () => {
  it("offers this floor's confirmed places that no room has claimed, each by its frame", () => {
    setup();
    expect(names(screen.getByRole("list", { name: "On L1" }))).toEqual(["Bind to Anchor Books", "Bind to Festive Mall"]);
    // alt="" (the button already names the place), so it has no img role to query by.
    const img = screen.getByRole("button", { name: "Bind to Festive Mall" }).querySelector("img");
    expect(img?.getAttribute("src")).toBe("/api/keyframes/kf_1/file?w=240");
    // Never tagged in a frame, so it says so rather than showing an empty box.
    expect(within(screen.getByRole("button", { name: "Bind to Anchor Books" })).getByText("No frame")).toBeTruthy();
  });

  it("leaves out proposals, walkways, other floors and places already bound", () => {
    setup();
    for (const name of ["iTea", "Covered link", "Gym", "Taken"]) {
      expect(screen.queryByRole("button", { name: `Bind to ${name}` })).toBeNull();
    }
  });

  it("keeps places no floor claims apart, but still bindable", () => {
    setup();
    expect(screen.getByText("Places with no floor (1)")).toBeTruthy();
    expect(names(screen.getByRole("list", { name: "With no floor", hidden: true }))).toEqual(["Bind to Somewhere"]);
  });

  it("puts the place chosen from the to-do list first", () => {
    setup({ pendingPlaceId: "pl_mall" });
    expect(names(screen.getByRole("list", { name: "On L1" }))[0]).toBe("Bind to Festive Mall");
  });

  it("finds a place by name", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Find a place"), { target: { value: "fest" } });
    expect(names(screen.getByRole("list", { name: "On L1" }))).toEqual(["Bind to Festive Mall"]);
  });

  it("binds the room, files the place on the room's floor, and verifies the room with its frames", async () => {
    const { update, onBound } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Bind to Festive Mall" }));
    await waitFor(() => expect(onBound).toHaveBeenCalled());
    expect(update.mock.calls[0]).toEqual(["place", "pl_mall", 0, { roomId: "L1-a", levelId: "oth-L1" }]);
    expect(update.mock.calls[1]!.slice(0, 3)).toEqual(["room", "L1-a", 0]);
    expect(update.mock.calls[1]![3]).toMatchObject({ verification: { status: "photo", evidence: ["kf_1", "kf_2"] } });
    // A room with no name of its own is "this room", never its raw id.
    expect(toasts().at(-1)).toMatchObject({ message: "Bound this room to Festive Mall", action: { label: "Undo" } });
  });

  it("undoes a bind: the place loses its room and floor, the room its verification, then it reloads", async () => {
    const { api, refresh, onBound, room } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Bind to Festive Mall" }));
    await waitFor(() => expect(onBound).toHaveBeenCalled());
    await undoIt();
    // Each write moved its entity on one version; the room goes back first.
    expect(vi.mocked(api.updateEntity).mock.calls).toEqual([
      ["room", "L1-a", 1, { verification: room.verification }],
      ["place", "pl_mall", 1, { roomId: null, levelId: null }],
    ]);
    expect(room.verification.status).toBe("unverified");
    expect(refresh).toHaveBeenCalled();
    expect(toasts().at(-1)).toMatchObject({ tone: "success", message: "Festive Mall is waiting for a room again" });
  });

  it("binds a place with no confirmed frame, but calls no room seen in a photo, and Undo puts back only the place", async () => {
    const { api, update, onBound } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Bind to Anchor Books" }));
    await waitFor(() => expect(onBound).toHaveBeenCalled());
    expect(update.mock.calls).toEqual([["place", "pl_books", 0, { roomId: "L1-a", levelId: "oth-L1" }]]);
    expect(toasts().at(-1)?.message).toBe("Bound this room to Anchor Books");
    await undoIt();
    // Its own floor comes back, not a cleared one.
    expect(vi.mocked(api.updateEntity).mock.calls).toEqual([["place", "pl_books", 1, { roomId: null, levelId: "oth-L1" }]]);
  });

  it("vouches for a room with confirmed tags only, and shows a confirmed frame first", async () => {
    const tagged = parseModel({
      ...base,
      places: [{ id: "pl_kopi", nameEn: "Kopitiam", category: "retail", levelId: "oth-L1" }],
      sightings: [
        { id: "s1", placeId: "pl_kopi", keyframeId: "kf_1", status: "proposed" },
        { id: "s2", placeId: "pl_kopi", keyframeId: "kf_2" },
      ],
    });
    const { update, onBound } = setup({ m: tagged });
    const button = screen.getByRole("button", { name: "Bind to Kopitiam" });
    expect(button.querySelector("img")?.getAttribute("src")).toBe("/api/keyframes/kf_2/file?w=240");
    fireEvent.click(button);
    await waitFor(() => expect(onBound).toHaveBeenCalled());
    expect(update.mock.calls[1]![3]).toMatchObject({ verification: { status: "photo", evidence: ["kf_2"] } });
  });

  it("shows each place by the frame its card leads with: a confirmed tag's box before one with none", () => {
    setup({ m: boxed });
    const button = screen.getByRole("button", { name: "Bind to Kopitiam" });
    expect(button.querySelector("img")?.getAttribute("src")).toBe("/api/keyframes/kf_2/file?w=240");
  });

  it("leaves the room alone when the place could not be bound", async () => {
    const update = vi.fn(async (..._args: unknown[]) => false);
    const { onBound } = setup({ update });
    fireEvent.click(screen.getByRole("button", { name: "Bind to Festive Mall" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(onBound).not.toHaveBeenCalled();
    expect(toasts()).toEqual([]);
  });

  it("says nothing went through when the room could not be verified, though the place is bound", async () => {
    // The saver has already shown the room's failure, with Retry.
    const update = vi.fn(async (...args: unknown[]) => args[0] === "place");
    const { onBound } = setup({ update });
    fireEvent.click(screen.getByRole("button", { name: "Bind to Festive Mall" }));
    await waitFor(() => expect(onBound).toHaveBeenCalled());
    expect(update).toHaveBeenCalledTimes(2);
    expect(toasts()).toEqual([]);
  });

  it("says what a bound room is, instead of offering to bind it again", () => {
    const bound: MapModel = parseModel({ ...base, places: [{ id: "pl_1", nameEn: "Library", category: "community", roomId: "L1-a" }] });
    setup({ m: bound });
    expect(screen.getByText("Library")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Bind to / })).toBeNull();
  });

  it("unbinds a room bound to the wrong place", async () => {
    const bound: MapModel = parseModel({ ...base, places: [{ id: "pl_1", nameEn: "Library", category: "community", roomId: "L1-a" }] });
    const { update } = setup({ m: bound });
    fireEvent.click(screen.getByRole("button", { name: "Unbind" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Unbind" }).hasAttribute("disabled")).toBe(false));
    expect(update.mock.calls).toEqual([["place", "pl_1", 0, { roomId: null }]]);
  });

  it("names every place a room holds, by name as its card does, each with its own Unbind", async () => {
    // L1's west concourses hold three gates each, on purpose. Model order is not name order.
    const concourse: MapModel = parseModel({
      ...base,
      places: [
        { id: "pl_g3", nameEn: "Gate 3", category: "facility", levelId: "oth-L1", roomId: "L1-a" },
        { id: "pl_g2", nameEn: "Gate 2", category: "facility", levelId: "oth-L1", roomId: "L1-a" },
      ],
    });
    const { update } = setup({ m: concourse });
    expect(screen.getByText(/Bound to 2 places from the survey/)).toBeTruthy();
    const held = within(screen.getByRole("list", { name: "Bound places" })).getAllByRole("listitem");
    expect(held.map(li => li.querySelector(".font-medium")?.textContent)).toEqual(["Gate 2", "Gate 3"]);
    fireEvent.click(screen.getByRole("button", { name: "Unbind Gate 3" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Unbind Gate 3" }).hasAttribute("disabled")).toBe(false));
    expect(update.mock.calls).toEqual([["place", "pl_g3", 0, { roomId: null }]]);
  });

  it("offers again a place whose room has since been deleted, so a room drawn again can have it", async () => {
    const { update, onBound } = setup({ m: orphaned });
    expect(names(screen.getByRole("list", { name: "On L1" }))).toEqual(["Bind to Gate 2"]);
    fireEvent.click(screen.getByRole("button", { name: "Bind to Gate 2" }));
    await waitFor(() => expect(onBound).toHaveBeenCalled());
    expect(update.mock.calls[0]).toEqual(["place", "pl_gate", 0, { roomId: "L1-a", levelId: "oth-L1" }]);
  });

  it("offers the room the picker even when every place waiting is one whose room was deleted", () => {
    expect(offersPlaces(orphaned, orphaned.rooms.find(r => r.id === "L1-a")!)).toBe(true);
  });

  it("says what to do when no place is waiting for a room", () => {
    setup({ m: parseModel(base) });
    expect(screen.getByText(/tag and review this floor's footage first/i)).toBeTruthy();
  });

  it("says where this floor's places come from when none are waiting here", () => {
    setup({ m: parseModel({ ...base, places: [{ id: "pl_lost", nameEn: "Somewhere", category: "retail" }] }) });
    expect(screen.getByText("No places filmed on L1 are waiting for a room. Places are confirmed in Review.")).toBeTruthy();
  });
});

describe("BindTools", () => {
  beforeEach(() => useEditorStore.getState().setModel(model));

  it("asks for the room of the place chosen from the to-do list, with the frame it was filmed in", () => {
    render(<BindTools api={fakeApi()} pendingPlaceId="pl_mall" onCancel={vi.fn()} />);
    expect(screen.getByText(/click the room where you see/i).textContent).toContain("Festive Mall");
    expect(screen.getByRole("img", { name: "Where Festive Mall was filmed" }).getAttribute("src")).toBe("/api/keyframes/kf_1/file?w=240");
  });

  it("lets the choice go", () => {
    const onCancel = vi.fn();
    render(<BindTools api={fakeApi()} pendingPlaceId="pl_mall" onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("explains the step when no place is chosen", () => {
    render(<BindTools api={fakeApi()} pendingPlaceId={null} onCancel={vi.fn()} />);
    expect(screen.getByText(/pick a place from the to-do list/i)).toBeTruthy();
  });

  it("stops asking for a room once the place in hand has one", () => {
    render(<BindTools api={fakeApi()} pendingPlaceId="pl_taken" onCancel={vi.fn()} />);
    expect(screen.queryByText(/click the room where you see/i)).toBeNull();
    expect(screen.getByText(/pick a place from the to-do list/i)).toBeTruthy();
  });

  it("asks for a room for a place whose room has since been deleted", () => {
    useEditorStore.getState().setModel(orphaned);
    render(<BindTools api={fakeApi()} pendingPlaceId="pl_gate" onCancel={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toMatch(/Click the room where you see Gate 2/);
  });

  it("shows the place in hand by the same frame as its card", () => {
    useEditorStore.getState().setModel(boxed);
    render(<BindTools api={fakeApi()} pendingPlaceId="pl_kopi" onCancel={vi.fn()} />);
    expect(screen.getByRole("img", { name: "Where Kopitiam was filmed" }).getAttribute("src")).toBe("/api/keyframes/kf_2/file?w=240");
  });
});
