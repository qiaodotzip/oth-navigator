import { live, parseModel } from "@oth/model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { FlightControls } from "./FlightControls";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 5 },
  ],
  portals: [{ id: "esc-1", kind: "escalator" }, { id: "lift-a", kind: "lift" }],
  portalEndpoints: [
    { id: "esc-1-1", portalId: "esc-1", levelId: "oth-L1", roomId: "L1-a", point: [5, 5], footprint: [[4, 0], [6, 0], [6, 10], [4, 10]] },
    { id: "esc-1-2", portalId: "esc-1", levelId: "oth-L2", roomId: "L2-a", point: [5, 9] },
    { id: "lift-a-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-a", point: [30, 10] },
  ],
});
const stop = (id: string) => live(model.portalEndpoints).find(e => e.id === id)!;
const portal = (id: string) => live(model.portals).find(p => p.id === id)!;

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
});

describe("FlightControls", () => {
  it("flips the flight that climbs from this stop", () => {
    const update = vi.fn(async () => true);
    render(<FlightControls saver={{ update } as unknown as Saver} endpoint={stop("esc-1-1")} portal={portal("esc-1")} />);
    expect(screen.getByText("Built in 3D as a flight up to L2.")).toBeTruthy();
    const flip = screen.getByRole("button", { name: "Flip direction" });
    expect(flip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(flip);
    expect(update).toHaveBeenCalledWith("portalEndpoint", "esc-1-1", 0, { flipped: true });
  });

  it("sends you to the stop below for the flight arriving here", () => {
    render(<FlightControls saver={{} as Saver} endpoint={stop("esc-1-2")} portal={portal("esc-1")} />);
    expect(screen.getByText("Its flight up to here is set on the L1 stop.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Flip direction" })).toBeNull();
  });

  it("says how a lift without an outline is built, and how to give it one", () => {
    render(<FlightControls saver={{} as Saver} endpoint={stop("lift-a-1")} portal={portal("lift-a")} />);
    expect(screen.getByText(/2\.4 m shaft/)).toBeTruthy();
  });
});

// 3D turns a flight round for a flag on its lower stop, or on its upper stop
// when that is the top one (portalParts). The API and Claude can set either.
describe("FlightControls with a flag on the stop above", () => {
  const outline = [[4, 0], [6, 0], [6, 10], [4, 10]];
  const flagged = parseModel({
    building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
    levels: [
      { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
      { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 5 },
      { id: "oth-L3", buildingId: "oth", code: "L3", ordinal: 3, nameEn: "L3", nameZh: "三楼", elevationM: 11, heightM: 5 },
    ],
    portals: [{ id: "esc-2", kind: "escalator" }, { id: "esc-3", kind: "escalator" }],
    portalEndpoints: [
      // Two stops, and the top one flagged.
      { id: "esc-2-1", portalId: "esc-2", levelId: "oth-L1", roomId: "L1-a", point: [5, 5], footprint: outline },
      { id: "esc-2-2", portalId: "esc-2", levelId: "oth-L2", roomId: "L2-a", point: [5, 9], flipped: true, version: 3 },
      // Three stops, and the middle one flagged: that is its own flight's, to L3.
      { id: "esc-3-1", portalId: "esc-3", levelId: "oth-L1", roomId: "L1-a", point: [15, 5], footprint: outline },
      { id: "esc-3-2", portalId: "esc-3", levelId: "oth-L2", roomId: "L2-a", point: [15, 9], flipped: true },
      { id: "esc-3-3", portalId: "esc-3", levelId: "oth-L3", roomId: "L3-a", point: [15, 9] },
    ],
  });
  const at = (id: string) => live(flagged.portalEndpoints).find(e => e.id === id)!;
  const esc = (id: string) => live(flagged.portals).find(p => p.id === id)!;

  beforeEach(() => {
    useEditorStore.getState().setModel(flagged);
  });

  it("shows a flight flipped by its top stop as flipped, and Flip clears that flag", () => {
    const update = vi.fn(async () => true);
    render(<FlightControls saver={{ update } as unknown as Saver} endpoint={at("esc-2-1")} portal={esc("esc-2")} />);
    const flip = screen.getByRole("button", { name: "Flip direction" });
    expect(flip.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(flip);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("portalEndpoint", "esc-2-2", 3, { flipped: false });
  });

  it("clears both flags when both stops have one", async () => {
    const both = { ...flagged, portalEndpoints: flagged.portalEndpoints.map(e => (e.id === "esc-2-1" ? { ...e, flipped: true } : e)) };
    useEditorStore.getState().setModel(both);
    const update = vi.fn(async () => true);
    render(
      <FlightControls
        saver={{ update } as unknown as Saver}
        endpoint={both.portalEndpoints.find(e => e.id === "esc-2-1")!}
        portal={esc("esc-2")}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Flip direction" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenNthCalledWith(1, "portalEndpoint", "esc-2-1", 0, { flipped: false });
    expect(update).toHaveBeenNthCalledWith(2, "portalEndpoint", "esc-2-2", 3, { flipped: false });
  });

  it("leaves the top stop's flag when clearing this stop's is refused", async () => {
    const both = { ...flagged, portalEndpoints: flagged.portalEndpoints.map(e => (e.id === "esc-2-1" ? { ...e, flipped: true } : e)) };
    useEditorStore.getState().setModel(both);
    const update = vi.fn(async () => false);
    render(
      <FlightControls
        saver={{ update } as unknown as Saver}
        endpoint={both.portalEndpoints.find(e => e.id === "esc-2-1")!}
        portal={esc("esc-2")}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Flip direction" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("leaves a flight alone for a flag on a middle stop, which is the next flight's", () => {
    const update = vi.fn(async () => true);
    render(<FlightControls saver={{ update } as unknown as Saver} endpoint={at("esc-3-1")} portal={esc("esc-3")} />);
    const flip = screen.getByRole("button", { name: "Flip direction" });
    expect(flip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(flip);
    expect(update).toHaveBeenCalledWith("portalEndpoint", "esc-3-1", 0, { flipped: true });
  });
});
