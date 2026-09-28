import { parseModel, type ValidationReport } from "@oth/model";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentRoute } from "../route";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { PlacesWorkspace } from "./PlacesWorkspace";

const sq = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]];
const frame = (id: string) => ({ id, captureId: "cap_1", imageId: id, widthPx: 640, heightPx: 480 });

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0), heightM: 4, nameEn: "Shop" },
    { id: "L1-cafe", levelId: "oth-L1", kind: "room", footprint: sq(20), heightM: 4, nameEn: "Cafe" },
    { id: "L1-empty", levelId: "oth-L1", kind: "room", footprint: sq(40), heightM: 4, nameEn: "Unit 7" },
  ],
  captures: [{ id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" }],
  keyframes: [frame("kf_1"), frame("kf_2")],
  places: [
    { id: "pl_star", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-shop" },
    { id: "pl_books", nameEn: "Anchor Books", category: "retail", levelId: "oth-L1" },
    { id: "pl_cafe", nameEn: "Toast Box", category: "retail", levelId: "oth-L1", roomId: "L1-cafe" },
    { id: "pl_tea", nameEn: "iTea", category: "retail", levelId: "oth-L1", status: "proposed" },
  ],
  sightings: [
    { id: "s1", placeId: "pl_star", keyframeId: "kf_1", box: { x: 0.45, y: 0.45, w: 0.1, h: 0.1 } },
    { id: "s2", placeId: "pl_books", keyframeId: "kf_2" },
    { id: "s3", placeId: "pl_cafe", keyframeId: "kf_1" },
    { id: "s4", placeId: "pl_tea", keyframeId: "kf_2", status: "proposed" },
  ],
});

const report: ValidationReport = {
  issues: [{
    severity: "warning", code: "place.adjacencyBroken", entityType: "place", entityId: "pl_cafe", levelId: "oth-L1",
    message: '"Toast Box" and "Starbucks" appear in the same photo, but the rooms they are bound to are 52 m apart.',
  }],
  errorCount: 0,
  warningCount: 1,
  ok: true,
};

function at(path: string, validate = vi.fn().mockResolvedValue(report)) {
  window.history.replaceState({}, "", path);
  const api = fakeApi({ validate });
  function Harness() {
    const route = useCurrentRoute();
    const level = useEditorStore(s => s.model)?.levels.find(l => route.name === "floor" && l.code === route.code);
    return route.name === "floor" && level ? <PlacesWorkspace api={api} level={level} params={route.params} /> : null;
  }
  render(<Harness />);
  return { api };
}

const rowIds = () => screen.queryAllByTestId(/^place-row-/).map(el => el.getAttribute("data-testid"));
const chip = (name: RegExp) => within(screen.getByRole("group", { name: "Show places" })).getByRole("button", { name });

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
});

describe("PlacesWorkspace", () => {
  it("says how many confirmed places are on the map, what waits in Review, and how many rooms have no place bound", () => {
    at("/floors/L1/places");
    expect(screen.getByRole("heading", { name: "2 of 3 confirmed places are on the map" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "1 waiting in Review →" }).getAttribute("href")).toBe("/floors/L1/review");
    // Unit 7. Not "nobody filmed": a room with none bound may well have been filmed.
    expect(screen.getByRole("link", { name: "Rooms with no place bound: 1 →" }).getAttribute("href")).toBe("/floors/L1/build?step=bind");
    expect(screen.queryByText(/walkway/)).toBeNull();
  });

  it("says why the confirmed walkways Review counts are not listed", () => {
    const walkway = { id: "pl_link", nameEn: "Covered link", category: "facility", levelId: "oth-L1", pathwayKindId: "pk-1" };
    useEditorStore.getState().setModel(parseModel({ ...model, places: [...model.places, walkway] }));
    at("/floors/L1/places?filter=all");
    expect(screen.getByRole("heading", { name: "2 of 3 confirmed places are on the map" })).toBeTruthy();
    expect(screen.getByText("1 walkway is drawn as a pathway, so it isn't listed")).toBeTruthy();
    expect(rowIds()).not.toContain("place-row-pl_link");
  });

  it("checks the map again as it opens, so photos that disagree are current", async () => {
    const { api } = at("/floors/L1/places");
    expect(await screen.findByText("Photos disagree")).toBeTruthy();
    expect(api.validate).toHaveBeenCalledTimes(1);
  });

  it("lists the gaps first, each with what to do about it", async () => {
    at("/floors/L1/places");
    await screen.findByText("Photos disagree");
    expect(rowIds()).toEqual(["place-row-pl_books", "place-row-pl_cafe"]);
    const books = within(screen.getByTestId("place-row-pl_books"));
    expect(books.getByText("Not on the map")).toBeTruthy();
    // The heading names it; the line under says only where it is.
    expect(books.getByText("→ no room yet")).toBeTruthy();
    expect(books.getByRole("link", { name: "Bind it: Anchor Books" }).getAttribute("href"))
      .toBe("/floors/L1/build?place=pl_books&step=bind");
  });

  it("counts each filter, and shows everything under All", async () => {
    at("/floors/L1/places");
    await screen.findByText("Photos disagree");
    expect(chip(/^Gaps/).textContent).toContain("2");
    expect(chip(/^On the map/).textContent).toContain("2");
    expect(chip(/^All/).textContent).toContain("3");
    fireEvent.click(chip(/^All/));
    expect(new URLSearchParams(window.location.search).get("filter")).toBe("all");
    const star = within(screen.getByTestId("place-row-pl_star"));
    expect(star.getByText("→ Shop (L1-shop)")).toBeTruthy();
    expect(star.getByRole("link", { name: "Show on map: Starbucks" }).getAttribute("href"))
      .toBe("/floors/L1/build?select=room%3AL1-shop&step=bind");
  });

  it("shows each place by its frame, zoomed to its box, sharp on the screen it is on", () => {
    // As the card asks: 112 px of a 40% window is 280 frame pixels on a
    // 1x screen, and 560 on a 2x one.
    const was = window.devicePixelRatio;
    try {
      window.devicePixelRatio = 1;
      at("/floors/L1/places?filter=all");
      const star = () => screen.getByTestId("place-row-pl_star");
      expect(star().querySelector("img")?.getAttribute("src")).toBe("/api/keyframes/kf_1/file?w=320");
      expect(within(star()).getByTestId("frame-box")).toBeTruthy();
      window.devicePixelRatio = 2;
      act(() => useEditorStore.getState().setModel({ ...model }));
      expect(star().querySelector("img")?.getAttribute("src")).toBe("/api/keyframes/kf_1/file?w=1600");
    } finally {
      window.devicePixelRatio = was;
    }
  });

  it("says so when nothing is missing, once the check replaces an older report", async () => {
    // Anchor Books bound. The store still holds the report from before, in
    // which Toast Box's photos disagree; the check as the tab opens finds none.
    useEditorStore.getState().setModel({
      ...model, places: model.places.map(p => (p.id === "pl_books" ? { ...p, roomId: "L1-empty" } : p)),
    });
    useEditorStore.getState().setReport(report);
    at("/floors/L1/places", vi.fn().mockResolvedValue({ issues: [], errorCount: 0, warningCount: 0, ok: true }));
    expect(rowIds()).toEqual(["place-row-pl_cafe"]);
    await waitFor(() => expect(screen.getByText(/^No gaps/)).toBeTruthy());
    expect(rowIds()).toEqual([]);
  });

  it("says a floor has no confirmed places yet, with no filters of nothing under it", () => {
    at("/floors/L2/places");
    expect(screen.getByRole("heading", { name: "No confirmed places on L2 yet" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Show places" })).toBeNull();
  });

  // Filmed on footage filed under no floor, with no floor of its own: Bind
  // places offers it on every floor, but no floor's to-do list names it.
  const withFloorless = () => parseModel({
    ...model,
    captures: [...model.captures, { id: "cap_2", kind: "video", filename: "loose.mp4" }],
    keyframes: [...model.keyframes, { id: "kf_3", captureId: "cap_2", imageId: "kf_3", widthPx: 640, heightPx: 480 }],
    places: [...model.places, { id: "pl_loo", nameEn: "Toilets", category: "facility" }],
    sightings: [...model.sightings, { id: "s5", placeId: "pl_loo", keyframeId: "kf_3" }],
  });

  it("points from every floor with rooms to the confirmed places no floor claims, which no floor's list counts", () => {
    useEditorStore.getState().setModel(withFloorless());
    at("/floors/L1/places?filter=all");
    expect(screen.getByRole("heading", { name: "2 of 3 confirmed places are on the map" })).toBeTruthy();
    expect(rowIds()).not.toContain("place-row-pl_loo");
    expect(screen.getByRole("link", { name: "Places with no floor: 1 →" }).getAttribute("href"))
      .toBe("/floors/L1/build?place=pl_loo&step=bind");
  });

  it("does not point there from a floor with no rooms, where Bind places has nothing to click", () => {
    useEditorStore.getState().setModel(withFloorless());
    at("/floors/L2/places");
    expect(screen.queryByRole("link", { name: /Places with no floor/ })).toBeNull();
  });
});
