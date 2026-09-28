import { parseModel } from "@oth/model";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    { id: "L1-cafe", levelId: "oth-L1", kind: "room", footprint: sq(80), heightM: 4 },
  ],
  captures: [
    { id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" },
    { id: "cap_loose", kind: "photos", filename: "phone" },
  ],
  keyframes: [frame("kf_1"), frame("kf_2"), frame("kf_3"), frame("kf_loose", "cap_loose")],
  places: [
    { id: "pl_star", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-shop" },
    // Three to a room, as L1's west concourses hold their gates.
    { id: "pl_tea", nameEn: "iTea", category: "retail", levelId: "oth-L1", roomId: "L1-dup", status: "proposed" },
    { id: "pl_kiosk", nameEn: "Kiosk", category: "retail", levelId: "oth-L1", roomId: "L1-dup" },
    { id: "pl_juice", nameEn: "Juice bar", category: "retail", levelId: "oth-L1", roomId: "L1-dup" },
    { id: "pl_claim", nameEn: "Mystery", category: "retail", levelId: "oth-L1", roomId: "L1-claim", status: "proposed" },
    { id: "pl_cafe", nameEn: "Cafe", category: "retail", levelId: "oth-L1", roomId: "L1-cafe" },
  ],
  sightings: [
    { id: "s_big", placeId: "pl_star", keyframeId: "kf_2", box: { x: 0.4, y: 0.4, w: 0.2, h: 0.1 }, updatedBy: "u_wei", updatedAt: on27 },
    { id: "s_small", placeId: "pl_star", keyframeId: "kf_1", box: { x: 0.1, y: 0.1, w: 0.05, h: 0.05 } },
    { id: "s_whole", placeId: "pl_star", keyframeId: "kf_3" },
    { id: "s_kiosk", placeId: "pl_kiosk", keyframeId: "kf_loose" },
    { id: "s_juice", placeId: "pl_juice", keyframeId: "kf_1" },
    // A confirmed place whose only photo is still a claim.
    { id: "s_cafe", placeId: "pl_cafe", keyframeId: "kf_2", box: { x: 0.4, y: 0.4, w: 0.2, h: 0.1 }, status: "proposed" },
  ],
});

function show(roomId: string, { onBindOne, pickerBelow }: { onBindOne?: () => void; pickerBelow?: boolean } = {}) {
  const room = model.rooms.find(r => r.id === roomId)!;
  render(<PlaceCard api={fakeApi()} room={room} onBindOne={onBindOne} pickerBelow={pickerBelow} />);
  return within(screen.getByRole("region", { name: "Surveyed place" }));
}

const photo = (scope: ReturnType<typeof within>, name: string) => scope.getByRole("img", { name: `${name}, as filmed` });

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

  it("ticks the status only when a person has checked both the place and the photo shown", () => {
    expect(show("L1-shop").getByText("✓")).toBeTruthy();
    cleanup();
    const cafe = show("L1-cafe");
    expect(cafe.getByText("Confirmed, but this photo's tag is still proposed")).toBeTruthy();
    expect(cafe.queryByText("✓")).toBeNull();
    cleanup();
    expect(show("L1-claim").queryByText("✓")).toBeNull();
  });

  it("shows the best photo large enough to read the sign, with its box drawn", () => {
    const card = show("L1-shop");
    expect(photo(card, "Starbucks").getAttribute("src")).toBe("/api/keyframes/kf_2/file?w=1600");
    // Zoomed to a 40% window around the box, so the box fills the middle.
    const box = card.getByTestId("frame-box");
    expect(box.style.left).toBe("25%");
    expect(box.style.top).toBe("37.5%");
    expect(box.style.width).toBe("50%");
    expect(box.classList.contains("border-dashed")).toBe(false);
  });

  it("dashes the box of a tag that is still proposed, so colour is not all that says so", () => {
    const box = show("L1-cafe").getByTestId("frame-box");
    expect(box.classList.contains("border-dashed")).toBe(true);
    expect(box.classList.contains("border-proposed")).toBe(true);
  });

  it("asks for a sharper photo on a screen with more pixels to the point", () => {
    const was = window.devicePixelRatio;
    try {
      // The whole frame, 296 px wide: the 320 px copy is enough at 1x, and not at 2x.
      window.devicePixelRatio = 1;
      const card = show("L1-shop");
      fireEvent.click(card.getByRole("button", { name: "Next frame of Starbucks" }));
      fireEvent.click(card.getByRole("button", { name: "Next frame of Starbucks" }));
      expect(photo(card, "Starbucks").getAttribute("src")).toBe("/api/keyframes/kf_3/file?w=320");
      window.devicePixelRatio = 2;
      fireEvent.click(card.getByRole("button", { name: "Previous frame of Starbucks" }));
      fireEvent.click(card.getByRole("button", { name: "Next frame of Starbucks" }));
      expect(photo(card, "Starbucks").getAttribute("src")).toBe("/api/keyframes/kf_3/file?w=1600");
    } finally {
      window.devicePixelRatio = was;
    }
  });

  it("steps through the place's other frames", () => {
    const card = show("L1-shop");
    expect(card.getByText("Seen in 3 frames")).toBeTruthy();
    expect(card.getByText("1 of 3")).toBeTruthy();
    fireEvent.click(card.getByRole("button", { name: "Next frame of Starbucks" }));
    expect(card.getByText("2 of 3")).toBeTruthy();
    expect(photo(card, "Starbucks").getAttribute("src")).toBe("/api/keyframes/kf_1/file?w=1600");
  });

  it("stops at either end without taking the focus from the button just pressed", () => {
    const card = show("L1-shop");
    const previous = card.getByRole("button", { name: "Previous frame of Starbucks" });
    const next = card.getByRole("button", { name: "Next frame of Starbucks" });
    expect(previous.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(previous);
    expect(card.getByText("1 of 3")).toBeTruthy();

    next.focus();
    fireEvent.click(next);
    fireEvent.click(next);
    expect(card.getByText("3 of 3")).toBeTruthy();
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect((next as HTMLButtonElement).disabled).toBe(false);
    expect(document.activeElement).toBe(next);
    fireEvent.click(next);
    expect(card.getByText("3 of 3")).toBeTruthy();
  });

  it("stays on a frame that is there when the one shown is binned", () => {
    const card = show("L1-shop");
    fireEvent.click(card.getByRole("button", { name: "Next frame of Starbucks" }));
    fireEvent.click(card.getByRole("button", { name: "Next frame of Starbucks" }));
    expect(card.getByText("3 of 3")).toBeTruthy();
    act(() => {
      useEditorStore.getState().setModel({
        ...model,
        sightings: model.sightings.map(s => (s.id === "s_whole" ? { ...s, deletedAt: on27 } : s)),
      });
    });
    expect(card.getByText("2 of 2")).toBeTruthy();
    expect(photo(card, "Starbucks").getAttribute("src")).toBe("/api/keyframes/kf_1/file?w=1600");
  });

  it("opens the frame shown in Survey, saying for which place", () => {
    const card = show("L1-shop");
    const link = card.getByRole("link", { name: "Open in Survey", description: "Starbucks" });
    expect(link.getAttribute("href")).toBe("/floors/L1/survey?capture=cap_1&frame=kf_2");
  });

  it("says the photo could not load, and draws no box round it", () => {
    const card = show("L1-shop");
    fireEvent.error(photo(card, "Starbucks"));
    expect(card.getByText("The photo could not load.")).toBeTruthy();
    expect(card.queryByTestId("frame-box")).toBeNull();
    // Another frame is another photo, and is tried.
    fireEvent.click(card.getByRole("button", { name: "Next frame of Starbucks" }));
    expect(photo(card, "Starbucks").getAttribute("src")).toBe("/api/keyframes/kf_1/file?w=1600");
    expect(card.queryByText("The photo could not load.")).toBeNull();
    expect(card.getByTestId("frame-box")).toBeTruthy();
  });

  // Ruling 5: on L1 the west concourses hold three gates each, on purpose, so
  // no one of a room's places is the room's. Ruling 14: as short rows, so the
  // room's own fields stay in reach.
  it("lists every place bound to a room alike, by name, as rows that say in words whether each is confirmed", () => {
    const card = show("L1-dup");
    expect(card.getByText("3 places are bound to this room.")).toBeTruthy();
    expect(card.getAllByRole("heading").map(h => h.textContent)).toEqual(["iTea", "Juice bar", "Kiosk"]);
    // Rows only: no place's full photo until its row is opened.
    expect(card.queryByRole("img")).toBeNull();
    expect(card.getAllByRole("button", { expanded: false })).toHaveLength(3);

    const tea = within(card.getByRole("listitem", { name: "iTea" }));
    expect(tea.getByText("Proposed")).toBeTruthy();
    expect(tea.getByText("No photo")).toBeTruthy();

    const juice = within(card.getByRole("listitem", { name: "Juice bar" }));
    expect(juice.getByText("Confirmed")).toBeTruthy();
    expect(juice.getByText("✓")).toBeTruthy();
    expect(juice.getByRole("link", { name: "Open in Survey", description: "Juice bar" }).getAttribute("href"))
      .toBe("/floors/L1/survey?capture=cap_1&frame=kf_1");

    const kiosk = within(card.getByRole("listitem", { name: "Kiosk" }));
    expect(kiosk.getByText("Confirmed")).toBeTruthy();
    // Kiosk was filmed on footage filed under no floor, which Survey cannot show.
    expect(kiosk.queryByRole("link", { name: "Open in Survey" })).toBeNull();
  });

  it("opens one row at a time to its place's full photo", () => {
    const card = show("L1-dup");
    fireEvent.click(card.getByRole("button", { name: "Kiosk" }));
    expect(card.getByRole("button", { name: "Kiosk" }).getAttribute("aria-expanded")).toBe("true");
    const kiosk = within(card.getByRole("listitem", { name: "Kiosk" }));
    expect(photo(kiosk, "Kiosk").getAttribute("src")).toBe("/api/keyframes/kf_loose/file?w=320");
    expect(kiosk.getByText("Seen in 1 frame")).toBeTruthy();
    expect(kiosk.getByText("Confirmed")).toBeTruthy();

    fireEvent.click(card.getByRole("button", { name: "iTea" }));
    expect(card.getAllByRole("button", { expanded: true }).map(b => b.textContent)).toEqual(["iTea"]);
    expect(card.queryByRole("img", { name: "Kiosk, as filmed" })).toBeNull();
    const tea = within(card.getByRole("listitem", { name: "iTea" }));
    expect(tea.getByText("Proposed, waiting in Review")).toBeTruthy();
    expect(tea.getByText("There is no photo of this place yet.")).toBeTruthy();

    // The same button closes it again, and keeps the focus: it is never remounted.
    const button = card.getByRole("button", { name: "iTea" });
    button.focus();
    fireEvent.click(button);
    expect(card.queryAllByRole("button", { expanded: true })).toHaveLength(0);
    expect(document.activeElement).toBe(button);
  });

  it("says when the place is still a claim, and when there is no photo", () => {
    const card = show("L1-claim");
    expect(card.getByText("Proposed, waiting in Review")).toBeTruthy();
    expect(card.getByText("There is no photo of this place yet.")).toBeTruthy();
  });

  it("offers Bind one for a room with no place", () => {
    const onBindOne = vi.fn();
    const card = show("L1-empty", { onBindOne });
    expect(card.getByText(/No surveyed place is bound to this room/)).toBeTruthy();
    fireEvent.click(card.getByRole("button", { name: "Bind one" }));
    expect(onBindOne).toHaveBeenCalled();
  });

  it("points below instead where the binding list is already on screen", () => {
    const card = show("L1-empty", { pickerBelow: true });
    expect(card.queryByRole("button", { name: "Bind one" })).toBeNull();
    expect(card.getByText("No surveyed place is bound to this room. Pick it below.")).toBeTruthy();
  });

  it("does not point below when there is no list there", () => {
    const card = show("L1-empty");
    expect(card.getByText("No surveyed place is bound to this room.")).toBeTruthy();
  });
});
