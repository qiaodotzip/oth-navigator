import { parseModel } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { BindPlacePanel } from "./BindPlacePanel";

const base = {
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [{
    id: "L1-a", levelId: "oth-L1", kind: "room",
    footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3.5, walkable: false,
  }],
};

const surveyed = parseModel({
  ...base,
  captures: [{ id: "cap_1", kind: "video", filename: "a.mp4" }],
  keyframes: [{ id: "kf_1", captureId: "cap_1", timeMs: 0, imageId: "kf_1", widthPx: 640, heightPx: 480 }],
  places: [
    { id: "pl_1", nameEn: "NTUC FairPrice", category: "retail" },
    { id: "pl_2", nameEn: "Taken Already", category: "retail", roomId: "L1-other" },
  ],
  sightings: [{ id: "sg_1", placeId: "pl_1", keyframeId: "kf_1" }],
});

function setup(model = surveyed, select = true) {
  const onBind = vi.fn();
  useEditorStore.getState().setModel(model);
  if (select) useEditorStore.getState().select({ type: "room", id: "L1-a" });
  render(<BindPlacePanel onBind={onBind} />);
  return { onBind };
}

beforeEach(() => {
  useEditorStore.getState().reset();
});

describe("BindPlacePanel", () => {
  it("asks for a room before anything else", () => {
    setup(surveyed, false);
    expect(screen.getByText(/select a room/i)).toBeTruthy();
  });

  it("offers only places nothing else has claimed", () => {
    setup();
    const options = [...screen.getByLabelText("Bind to a surveyed place").querySelectorAll("option")]
      .map(o => o.textContent);
    expect(options).toContain("NTUC FairPrice");
    expect(options).not.toContain("Taken Already");
  });

  it("binds the selected room to the chosen place", () => {
    const { onBind } = setup();
    fireEvent.change(screen.getByLabelText("Bind to a surveyed place"), { target: { value: "pl_1" } });
    expect(onBind).toHaveBeenCalledWith(expect.objectContaining({ roomId: "L1-a", roomVersion: 0 }));
  });

  it("hands over the frames that show it, as evidence", () => {
    const { onBind } = setup();
    fireEvent.change(screen.getByLabelText("Bind to a surveyed place"), { target: { value: "pl_1" } });
    expect(onBind.mock.calls[0]![0].evidence).toEqual(["kf_1"]);
  });

  it("says so when nothing has been surveyed yet, rather than showing an empty select", () => {
    setup(parseModel(base));
    expect(screen.getByText(/nothing surveyed yet/i)).toBeTruthy();
  });

  it("shows what a bound room was confirmed as, instead of offering to rebind it", () => {
    const alreadyBound = parseModel({
      ...base,
      places: [{ id: "pl_1", nameEn: "NTUC FairPrice", category: "retail", roomId: "L1-a" }],
    });
    setup(alreadyBound);
    expect(screen.getByText(/NTUC FairPrice/)).toBeTruthy();
    expect(screen.queryByLabelText("Bind to a surveyed place")).toBeNull();
  });

  it("says when everything surveyed is already spoken for", () => {
    const allBound = parseModel({
      ...base,
      places: [{ id: "pl_2", nameEn: "Elsewhere", category: "retail", roomId: "L1-other" }],
    });
    setup(allBound);
    expect(screen.getByText(/already bound/i)).toBeTruthy();
  });
});
