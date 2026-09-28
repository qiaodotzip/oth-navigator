import { parseModel, type MapModel } from "@oth/model";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { BindPlaces, BindTools } from "./BindPlaces";

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

// Typed with its arguments: `vi.fn(async () => true)` records calls as `[]`,
// and reading an argument off one would not type-check.
function setup({
  m = model,
  pendingPlaceId = null as string | null,
  update = vi.fn(async (..._args: unknown[]) => true),
} = {}) {
  useEditorStore.getState().setModel(m);
  const onBound = vi.fn();
  const room = m.rooms.find(r => r.id === "L1-a")!;
  render(
    <BindPlaces api={fakeApi()} saver={{ update } as unknown as Saver} room={room} pendingPlaceId={pendingPlaceId} onBound={onBound} />,
  );
  return { update, onBound };
}

// `hidden: true`, because the floorless list sits in a closed <details>.
const names = (list: HTMLElement) =>
  within(list).getAllByRole("button", { hidden: true }).map(b => b.getAttribute("aria-label"));

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
  });

  it("leaves the room alone when the place could not be bound", async () => {
    const update = vi.fn(async (..._args: unknown[]) => false);
    const { onBound } = setup({ update });
    fireEvent.click(screen.getByRole("button", { name: "Bind to Anchor Books" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(onBound).not.toHaveBeenCalled();
  });

  it("says what a bound room is, instead of offering to bind it again", () => {
    const bound: MapModel = parseModel({ ...base, places: [{ id: "pl_1", nameEn: "Library", category: "community", roomId: "L1-a" }] });
    setup({ m: bound });
    expect(screen.getByText("Library")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Bind to / })).toBeNull();
  });

  it("says what to do when no place is waiting for a room", () => {
    setup({ m: parseModel(base) });
    expect(screen.getByText(/tag and review this floor's footage first/i)).toBeTruthy();
  });
});

describe("BindTools", () => {
  beforeEach(() => useEditorStore.getState().setModel(model));

  it("asks for the room of the place chosen from the to-do list, with the frame it was filmed in", () => {
    render(<BindTools api={fakeApi()} pendingPlaceId="pl_mall" onCancel={vi.fn()} />);
    expect(screen.getByText(/click the room where you see/i).textContent).toContain("Festive Mall");
    expect(screen.getByRole("img", { name: "Where Festive Mall was filmed" }).getAttribute("src")).toContain("kf_1");
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
});
