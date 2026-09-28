import { parseModel } from "@oth/model";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
  doorways: [{ id: "dw-1", levelId: "oth-L1", roomA: "L1-a", roomB: "L1-d", segment: [[2, 0], [3, 0]], widthM: 1 }],
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

  // The rail's layout rests on this; jsdom does no layout, so it is the class
  // that is pinned. BuildWorkspace's test has the picker's side of it.
  it("caps the room's fields only while the place picker is open, and keeps the keys in with them", () => {
    setup({ type: "room", id: "L1-a" }, "bind");
    const fields = screen.getByLabelText("Name").closest(".max-h-\\[30\\%\\]");
    expect(fields).toBeTruthy();
    // Two lines under the places would be two lines fewer of them.
    expect(fields!.contains(screen.getByText(/deletes it, with Undo/))).toBe(true);
  });

  it("leaves the room's fields their full height on another step", () => {
    setup({ type: "room", id: "L1-a" }, "rooms");
    expect(screen.getByLabelText("Name").closest(".max-h-\\[30\\%\\]")).toBeNull();
  });

  it("leaves the room's fields their full height once the room is bound, as there is no picker", () => {
    useEditorStore.getState().setModel({ ...model, places: model.places.map(p => ({ ...p, roomId: "L1-a" })) });
    setup({ type: "room", id: "L1-a" }, "bind");
    expect(screen.getByRole("button", { name: "Unbind" })).toBeTruthy();
    expect(screen.getByLabelText("Name").closest(".max-h-\\[30\\%\\]")).toBeNull();
  });

  it("does not offer binding on another step", () => {
    setup({ type: "room", id: "L1-a" }, "rooms");
    expect(screen.queryByRole("button", { name: /^Bind to / })).toBeNull();
  });

  it("offers a detail's export on the Dressing step", () => {
    setup({ type: "room", id: "L1-d" }, "dressing");
    expect(screen.getByRole("button", { name: /Export L1-d for Blender/ })).toBeTruthy();
  });

  it("shows the detail export on Dressing before a detail is chosen, waiting for one", () => {
    setup(null, "dressing");
    expect((screen.getByRole("button", { name: "Select a detail to export" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not offer the detail export on another step", () => {
    setup({ type: "room", id: "L1-d" }, "rooms");
    expect(screen.queryByRole("button", { name: /Export L1-d for Blender/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Select a detail to export" })).toBeNull();
  });

  it("shows a rename made elsewhere, and a blur after it writes nothing back", () => {
    const { update } = setup({ type: "room", id: "L1-a" });
    act(() => {
      const m = useEditorStore.getState().model!;
      useEditorStore.getState().setModel({
        ...m,
        rooms: m.rooms.map(r => (r.id === "L1-a" ? { ...r, nameEn: "Main studio", heightM: 4, version: 1 } : r)),
      });
    });
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Main studio");
    expect((screen.getByLabelText("Height (m)") as HTMLInputElement).value).toBe("4");
    fireEvent.blur(screen.getByLabelText("Name"));
    fireEvent.blur(screen.getByLabelText("Height (m)"));
    expect(update).not.toHaveBeenCalled();
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
    // A Mac laptop has no Delete key.
    expect(screen.getByText("Backspace")).toBeTruthy();
  });

  it("shows nothing stale for a selection that has gone", () => {
    setup({ type: "room", id: "L1-gone" });
    expect(screen.getByText(/select something on the plan/i)).toBeTruthy();
  });

  it("explains an old doorway that is still there", () => {
    setup({ type: "doorway", id: "dw-1" });
    expect(screen.getByText(/A doorway from before pathways/)).toBeTruthy();
  });

  it("shows nothing stale for a doorway that has gone", () => {
    setup({ type: "doorway", id: "dw-gone" });
    expect(screen.getByText(/select something on the plan/i)).toBeTruthy();
  });

  it("puts the surveyed place card above a room's own details", () => {
    setup({ type: "room", id: "L1-a" });
    const card = screen.getByRole("region", { name: "Surveyed place" });
    expect(card.textContent).toContain("No surveyed place is bound to this room.");
    expect(card.compareDocumentPosition(screen.getByLabelText("Name")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sends Bind one to the Bind places step", () => {
    window.history.replaceState({}, "", "/floors/L1/build?step=rooms");
    setup({ type: "room", id: "L1-a" }, "rooms");
    fireEvent.click(screen.getByRole("button", { name: "Bind one" }));
    expect(new URLSearchParams(window.location.search).get("step")).toBe("bind");
  });

  it("does not offer Bind one on Bind places, where the list is just below", () => {
    setup({ type: "room", id: "L1-a" }, "bind");
    expect(screen.queryByRole("button", { name: "Bind one" })).toBeNull();
    expect(screen.getByRole("region", { name: "Surveyed place" }).textContent).toContain("Pick it below.");
  });

  it("points at no picker on Bind places when no place is waiting for a room", () => {
    useEditorStore.getState().setModel({ ...model, places: [] });
    setup({ type: "room", id: "L1-a" }, "bind");
    expect(screen.getByText(/No confirmed places are waiting for a room/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Surveyed place" }).textContent).not.toContain("Pick it below");
  });

  it("shows no place card for a detail", () => {
    setup({ type: "room", id: "L1-d" }, "dressing");
    expect(screen.queryByRole("region", { name: "Surveyed place" })).toBeNull();
  });

  it("says the floor is loading, rather than asking for a selection it cannot show yet", () => {
    useEditorStore.getState().reset();
    setup(null);
    expect(screen.getByText("Loading the floor…")).toBeTruthy();
    expect(screen.queryByText(/select something on the plan/i)).toBeNull();
  });

  it("offers to make a room a lift or stair stop on Entrances & lifts", () => {
    setup({ type: "room", id: "L1-a" }, "entrances");
    expect(screen.getByRole("button", { name: "Escalator" })).toBeTruthy();
  });

  // At 1536×864 the room's fields fill the box, and the choice below them was out of view.
  it("puts the lift or stair choice above the room's own details", () => {
    setup({ type: "room", id: "L1-a" }, "entrances");
    const choice = screen.getByRole("button", { name: "Escalator" });
    expect(choice.compareDocumentPosition(screen.getByLabelText("Name")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
