import { parseModel } from "@oth/model";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { EntranceInspector, PortalInspector } from "./PointInspectors";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [{
    id: "L1-a", levelId: "oth-L1", kind: "area",
    footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 5, walkable: true,
  }],
  entrances: [
    { id: "en-1", levelId: "oth-L1", roomId: "L1-a", point: [1, 1], nameEn: "Gate 1" },
    { id: "en-2", levelId: "oth-L1", roomId: "L1-a", point: [2, 2], nameEn: "Gate 2" },
  ],
  portals: [
    { id: "lift-a", kind: "lift", nameEn: "" },
    { id: "lift-b", kind: "lift", nameEn: "Lift B" },
  ],
  portalEndpoints: [
    { id: "ep-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-a", point: [5, 5] },
    { id: "ep-2", portalId: "lift-a", levelId: "oth-L2", roomId: "L1-a", point: [5, 5] },
    { id: "ep-3", portalId: "lift-b", levelId: "oth-L1", roomId: "L1-a", point: [6, 6] },
  ],
});

function fakeSaver() {
  return { update: vi.fn().mockResolvedValue(true) } as unknown as Saver & {
    update: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
});

describe("EntranceInspector", () => {
  it("explains how to place one when none is selected", () => {
    render(<EntranceInspector saver={fakeSaver()} />);
    expect(screen.getByText(/click inside an area/i)).toBeTruthy();
  });

  it("renames the selected entrance", () => {
    const saver = fakeSaver();
    useEditorStore.getState().select({ type: "entrance", id: "en-1" });
    render(<EntranceInspector saver={saver} />);
    const name = screen.getByLabelText("Entrance name");
    fireEvent.change(name, { target: { value: "Gate 6" } });
    fireEvent.blur(name);
    expect(saver.update).toHaveBeenCalledWith("entrance", "en-1", 0, { nameEn: "Gate 6" });
  });

  it("marks it the main entrance", () => {
    const saver = fakeSaver();
    useEditorStore.getState().select({ type: "entrance", id: "en-1" });
    render(<EntranceInspector saver={saver} />);
    fireEvent.click(screen.getByLabelText("Main entrance"));
    expect(saver.update).toHaveBeenCalledWith("entrance", "en-1", 0, { isPrimary: true });
  });

  // M9: an unblurred edit on one entrance must not land on the next one
  // selected — the field is uncontrolled, so it needs a key by entity id.
  it("resets the name field when a different entrance is selected", () => {
    useEditorStore.getState().select({ type: "entrance", id: "en-1" });
    render(<EntranceInspector saver={fakeSaver()} />);
    fireEvent.change(screen.getByLabelText("Entrance name"), { target: { value: "typed but not saved" } });
    act(() => useEditorStore.getState().select({ type: "entrance", id: "en-2" }));
    expect(screen.getByLabelText("Entrance name")).toHaveValue("Gate 2");
  });
});

describe("PortalInspector", () => {
  it("explains how to place one when none is selected", () => {
    render(<PortalInspector saver={fakeSaver()} />);
    // Each level frames itself, so "the same spot" means nothing on screen;
    // the dashed outline is what there is to click.
    expect(screen.getByText(/dashed outline/i)).toBeTruthy();
  });

  it("lists the levels the lift stops on", () => {
    useEditorStore.getState().select({ type: "portalEndpoint", id: "ep-1" });
    render(<PortalInspector saver={fakeSaver()} />);
    expect(screen.getByTestId("portal-stops").textContent).toMatch(/L1.*L2/);
  });

  it("says how to add the next stop to a lift with one, in the words the header uses", () => {
    useEditorStore.getState().select({ type: "portalEndpoint", id: "ep-3" });
    render(<PortalInspector saver={fakeSaver()} />);
    expect(screen.getByText("Only one stop so far. Switch floor and click its dashed outline to add the next.")).toBeTruthy();
  });

  it("turns a lift into a stair, which is not step-free", () => {
    const saver = fakeSaver();
    useEditorStore.getState().select({ type: "portalEndpoint", id: "ep-1" });
    render(<PortalInspector saver={saver} />);
    fireEvent.change(screen.getByLabelText("Kind of connection"), { target: { value: "stair" } });
    expect(saver.update).toHaveBeenCalledWith("portal", "lift-a", 0, { kind: "stair", stepFree: false });
  });

  it("names the lift, not just this stop", () => {
    const saver = fakeSaver();
    useEditorStore.getState().select({ type: "portalEndpoint", id: "ep-1" });
    render(<PortalInspector saver={saver} />);
    const name = screen.getByLabelText("Lift or stair name");
    fireEvent.change(name, { target: { value: "Lift A" } });
    fireEvent.blur(name);
    expect(saver.update).toHaveBeenCalledWith("portal", "lift-a", 0, { nameEn: "Lift A" });
  });

  // M9: an unblurred edit on one lift must not land on the next one selected.
  it("resets the name field when a different portal is selected", () => {
    useEditorStore.getState().select({ type: "portalEndpoint", id: "ep-1" });
    render(<PortalInspector saver={fakeSaver()} />);
    fireEvent.change(screen.getByLabelText("Lift or stair name"), { target: { value: "typed but not saved" } });
    act(() => useEditorStore.getState().select({ type: "portalEndpoint", id: "ep-3" }));
    expect(screen.getByLabelText("Lift or stair name")).toHaveValue("Lift B");
  });
});
