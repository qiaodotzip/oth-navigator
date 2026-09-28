import { parseModel } from "@oth/model";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { PlaceCard } from "./PlaceCard";

const sq = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]];
const frame = (id: string, captureId = "cap_1") => ({ id, captureId, imageId: id, widthPx: 3840, heightPx: 2160 });
// Built from local parts, so it is 27 Sep wherever the test runs.
const on27 = new Date(2026, 8, 27, 12).toISOString();

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0), heightM: 4, nameEn: "Shop" },
    { id: "L1-dup", levelId: "oth-L1", kind: "room", footprint: sq(20), heightM: 4 },
    { id: "L1-claim", levelId: "oth-L1", kind: "room", footprint: sq(40), heightM: 4 },
    { id: "L1-empty", levelId: "oth-L1", kind: "room", footprint: sq(60), heightM: 4 },
  ],
  captures: [
    { id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" },
    { id: "cap_loose", kind: "photos", filename: "phone" },
  ],
  keyframes: [frame("kf_1"), frame("kf_2"), frame("kf_3"), frame("kf_loose", "cap_loose")],
  places: [
    { id: "pl_star", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-shop" },
    { id: "pl_tea", nameEn: "iTea", category: "retail", levelId: "oth-L1", roomId: "L1-dup", status: "proposed" },
    { id: "pl_kiosk", nameEn: "Kiosk", category: "retail", levelId: "oth-L1", roomId: "L1-dup" },
    { id: "pl_claim", nameEn: "Mystery", category: "retail", levelId: "oth-L1", roomId: "L1-claim", status: "proposed" },
    // Confirmed and waiting for a room on L1, so Bind places has a list to show.
    { id: "pl_wait", nameEn: "Gate 1", category: "facility", levelId: "oth-L1" },
  ],
  sightings: [
    { id: "s_big", placeId: "pl_star", keyframeId: "kf_2", box: { x: 0.4, y: 0.4, w: 0.2, h: 0.1 }, updatedBy: "u_wei", updatedAt: on27 },
    { id: "s_small", placeId: "pl_star", keyframeId: "kf_1", box: { x: 0.1, y: 0.1, w: 0.05, h: 0.05 } },
    { id: "s_whole", placeId: "pl_star", keyframeId: "kf_3" },
    { id: "s_kiosk", placeId: "pl_kiosk", keyframeId: "kf_loose" },
  ],
});

function show(roomId: string, onBindOne?: () => void) {
  const room = model.rooms.find(r => r.id === roomId)!;
  render(<PlaceCard api={fakeApi()} room={room} onBindOne={onBindOne} />);
  return within(screen.getByRole("region", { name: "Surveyed place" }));
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
  useEditorStore.getState().setTeam([{ id: "u_wei", displayName: "Wei Kang" }]);
});

describe("PlaceCard", () => {
  it("names the room's place and who confirmed its best photo", () => {
    const card = show("L1-shop");
    expect(card.getByRole("heading", { name: "Starbucks" })).toBeTruthy();
    expect(card.getByText("retail")).toBeTruthy();
    expect(card.getByText(/Confirmed by Wei Kang, 27 Sep/)).toBeTruthy();
  });

  it("shows the best photo large enough to read the sign, with its box drawn", () => {
    const card = show("L1-shop");
    expect(card.getByRole("img", { name: "Starbucks, as filmed" }).getAttribute("src")).toBe("/api/keyframes/kf_2/file?w=1600");
    // Zoomed to a 40% window around the box, so the box fills the middle.
    const box = card.getByTestId("frame-box");
    expect(box.style.left).toBe("25%");
    expect(box.style.top).toBe("37.5%");
    expect(box.style.width).toBe("50%");
  });

  it("asks for a sharper photo on a screen with more pixels to the point", () => {
    const was = window.devicePixelRatio;
    try {
      // The whole frame, 296 px wide: the 320 px copy is enough at 1x, and not at 2x.
      window.devicePixelRatio = 1;
      const card = show("L1-shop");
      fireEvent.click(card.getByRole("button", { name: "Next frame" }));
      fireEvent.click(card.getByRole("button", { name: "Next frame" }));
      expect(card.getByRole("img", { name: "Starbucks, as filmed" }).getAttribute("src")).toBe("/api/keyframes/kf_3/file?w=320");
      window.devicePixelRatio = 2;
      fireEvent.click(card.getByRole("button", { name: "Previous frame" }));
      fireEvent.click(card.getByRole("button", { name: "Next frame" }));
      expect(card.getByRole("img", { name: "Starbucks, as filmed" }).getAttribute("src")).toBe("/api/keyframes/kf_3/file?w=1600");
    } finally {
      window.devicePixelRatio = was;
    }
  });

  it("steps through the place's other frames", () => {
    const card = show("L1-shop");
    expect(card.getByText("Seen in 3 frames")).toBeTruthy();
    expect(card.getByText("1 of 3")).toBeTruthy();
    expect((card.getByRole("button", { name: "Previous frame" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(card.getByRole("button", { name: "Next frame" }));
    expect(card.getByText("2 of 3")).toBeTruthy();
    expect(card.getByRole("img", { name: "Starbucks, as filmed" }).getAttribute("src")).toBe("/api/keyframes/kf_1/file?w=1600");
  });

  it("opens the frame shown in Survey", () => {
    const card = show("L1-shop");
    expect(card.getByRole("link", { name: "Open in Survey" }).getAttribute("href")).toBe("/floors/L1/survey?capture=cap_1&frame=kf_2");
  });

  // Ruling 5: on L1 the west concourses hold three gates each, on purpose, so
  // no one of a room's places is the room's.
  it("lists every place bound to a room alike, by name, each saying in words whether it is confirmed", () => {
    const card = show("L1-dup");
    expect(card.getByText("2 places are bound to this room.")).toBeTruthy();
    expect(card.getAllByRole("heading").map(h => h.textContent)).toEqual(["iTea", "Kiosk"]);

    const tea = within(card.getByRole("listitem", { name: "iTea" }));
    expect(tea.getByText("Proposed, waiting in Review")).toBeTruthy();
    expect(tea.getByText("There is no photo of this place yet.")).toBeTruthy();

    const kiosk = within(card.getByRole("listitem", { name: "Kiosk" }));
    expect(kiosk.getByText("Confirmed")).toBeTruthy();
    expect(kiosk.getByRole("img", { name: "Kiosk, as filmed" }).getAttribute("src")).toBe("/api/keyframes/kf_loose/file?w=320");
    // Kiosk was filmed on footage filed under no floor, which Survey cannot show.
    expect(card.queryByRole("link", { name: "Open in Survey" })).toBeNull();
  });

  it("says when the place is still a claim, and when there is no photo", () => {
    const card = show("L1-claim");
    expect(card.getByText("Proposed, waiting in Review")).toBeTruthy();
    expect(card.getByText("There is no photo of this place yet.")).toBeTruthy();
  });

  it("offers Bind one for a room with no place", () => {
    const onBindOne = vi.fn();
    const card = show("L1-empty", onBindOne);
    expect(card.getByText(/No surveyed place is bound to this room/)).toBeTruthy();
    fireEvent.click(card.getByRole("button", { name: "Bind one" }));
    expect(onBindOne).toHaveBeenCalled();
  });

  it("points below instead where the binding list is already on screen", () => {
    const card = show("L1-empty");
    expect(card.queryByRole("button", { name: "Bind one" })).toBeNull();
    expect(card.getByText(/Choose it below/)).toBeTruthy();
  });

  it("does not point below when no place is waiting, as there is no list there", () => {
    useEditorStore.getState().setModel({ ...model, places: model.places.filter(p => p.id !== "pl_wait") });
    const card = show("L1-empty");
    expect(card.getByText("No surveyed place is bound to this room.")).toBeTruthy();
    expect(card.queryByText(/Choose it below/)).toBeNull();
  });
});
