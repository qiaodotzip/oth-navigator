import { parseModel } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildStepId } from "../flow/floorProgress";
import type { Saver } from "../state/save";
import { useEditorStore, type Selection } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { SelectionInspector } from "./SelectionInspector";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [
    { id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3.5, nameEn: "Studio" },
    { id: "L1-d", levelId: "oth-L1", kind: "detail", footprint: [[2, 2], [4, 2], [4, 4], [2, 4]], heightM: 1.2 },
  ],
  pathways: [{ id: "L1-p", levelId: "oth-L1", polyline: [[0, 0], [20, 0]] }],
  portals: [{ id: "lift-a", kind: "lift" }],
  portalEndpoints: [{ id: "ep-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-a", point: [5, 5] }],
  places: [{ id: "pl_1", nameEn: "Festive Mall", category: "retail", levelId: "oth-L1" }],
});

function setup(selection: Selection, step: BuildStepId = "rooms") {
  useEditorStore.getState().select(selection);
  const update = vi.fn(async () => true);
  render(
    <SelectionInspector
      api={fakeApi()}
      saver={{ update } as unknown as Saver}
      step={step}
      pendingPlaceId={null}
      onBound={vi.fn()}
    />,
  );
  return { update };
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
});

describe("SelectionInspector", () => {
  it("asks for a selection when there is none", () => {
    setup(null);
    expect(screen.getByText(/select something on the plan/i)).toBeTruthy();
  });

  it("shows a room's name and height", () => {
    setup({ type: "room", id: "L1-a" });
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Studio");
    expect(screen.getByLabelText("Height (m)")).toBeTruthy();
  });

  it("saves nothing for a name that did not change", () => {
    const { update } = setup({ type: "room", id: "L1-a" });
    fireEvent.blur(screen.getByLabelText("Name"));
    expect(update).not.toHaveBeenCalled();
  });

  it("offers binding on the Bind places step, and only there", () => {
    setup({ type: "room", id: "L1-a" }, "bind");
    expect(screen.getByRole("button", { name: "Bind to Festive Mall" })).toBeTruthy();
  });

  it("does not offer binding on another step", () => {
    setup({ type: "room", id: "L1-a" }, "rooms");
    expect(screen.queryByRole("button", { name: /^Bind to / })).toBeNull();
  });

  it("offers a detail's export on the Dressing step", () => {
    setup({ type: "room", id: "L1-d" }, "dressing");
    expect(screen.getByRole("button", { name: /Export L1-d for Blender/ })).toBeTruthy();
  });

  it("shows a pathway's walkway type", () => {
    setup({ type: "pathway", id: "L1-p" }, "pathways");
    expect(screen.getByLabelText("Walkway type")).toBeTruthy();
  });

  it("shows a lift stop's lift", () => {
    setup({ type: "portalEndpoint", id: "ep-1" }, "entrances");
    expect(screen.getByLabelText("Kind of connection")).toBeTruthy();
  });

  it("names the keys that act on a selection", () => {
    setup({ type: "room", id: "L1-a" });
    expect(screen.getByText(/deletes it, with Undo/)).toBeTruthy();
  });

  it("shows nothing stale for a selection that has gone", () => {
    setup({ type: "room", id: "L1-gone" });
    expect(screen.getByText(/select something on the plan/i)).toBeTruthy();
  });
});
