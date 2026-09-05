import { parseModel } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { LayersPanel } from "./LayersPanel";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
  ],
  rooms: [
    { id: "L1-lobby", levelId: "oth-L1", kind: "area", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 6, walkable: true, nameEn: "Town Square", nameZh: "广场" },
    { id: "L1-b", levelId: "oth-L1", kind: "room", footprint: [[20, 0], [30, 0], [30, 10]], heightM: 3, walkable: true },
  ],
  doorways: [
    { id: "L1-door", levelId: "oth-L1", roomA: "L1-lobby", roomB: "L1-b", segment: [[10, 4], [10, 6]], widthM: 2 },
  ],
});

function setup() {
  const onRename = vi.fn();
  const onDelete = vi.fn();
  render(<LayersPanel onRename={onRename} onDelete={onDelete} />);
  return { onRename, onDelete };
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
});

describe("LayersPanel", () => {
  it("lists every entity group with its count", () => {
    setup();
    expect(screen.getByText("Rooms (2)")).toBeTruthy();
    expect(screen.getByText("Doorways (1)")).toBeTruthy();
    expect(screen.getByText("Entrances (0)")).toBeTruthy();
  });

  it("shows a room by its name", () => {
    setup();
    expect(screen.getByText("Town Square")).toBeTruthy();
  });

  it("falls back to the id for an unnamed room", () => {
    setup();
    expect(screen.getByText("L1-b")).toBeTruthy();
  });

  it("selects an entity when its row is clicked", () => {
    setup();
    fireEvent.click(screen.getByText("Town Square"));
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-lobby" });
  });

  it("deletes with the entity's current version, so the write is locked", () => {
    const { onDelete } = setup();
    fireEvent.click(screen.getByLabelText("Delete Town Square"));
    expect(onDelete.mock.calls[0]![0]).toMatchObject({ id: "L1-lobby", version: 0, type: "room" });
  });

  it("renames a room in place", () => {
    const { onRename } = setup();
    fireEvent.click(screen.getByLabelText("Rename Town Square"));
    const input = screen.getByLabelText("Rename Town Square");
    fireEvent.change(input, { target: { value: "Main Atrium" } });
    fireEvent.blur(input);
    expect(onRename.mock.calls[0]![1]).toBe("Main Atrium");
  });

  it("does not save a rename that changed nothing", () => {
    const { onRename } = setup();
    fireEvent.click(screen.getByLabelText("Rename Town Square"));
    fireEvent.blur(screen.getByLabelText("Rename Town Square"));
    expect(onRename).not.toHaveBeenCalled();
  });

  it("does not offer rename for an entity with no name of its own", () => {
    setup();
    // A doorway is identified by what it connects, so there is nothing to rename.
    expect(screen.queryByLabelText(/Rename Town Square ↔/)).toBeNull();
    expect(screen.getByLabelText(/Delete Town Square ↔/)).toBeTruthy();
  });

  it("says so when a group is empty rather than showing nothing", () => {
    setup();
    expect(screen.getAllByText("none yet").length).toBeGreaterThan(0);
  });
});
