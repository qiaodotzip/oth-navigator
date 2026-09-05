import { parseModel } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { Inspector } from "./Inspector";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [{ id: "L1-vend", levelId: "oth-L1", kind: "detail", footprint: [[0, 0], [4, 0], [4, 2], [0, 2]], heightM: 1.2, walkable: false }],
});

function setup() {
  const onRename = vi.fn();
  const onResize = vi.fn();
  render(<Inspector onRename={onRename} onResize={onResize} />);
  return { onRename, onResize };
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
  useEditorStore.getState().select({ type: "room", id: "L1-vend" });
});

describe("Inspector", () => {
  it("edits the height, which is the brief a modeller works to", () => {
    const { onResize } = setup();
    const input = screen.getByLabelText("Height (m)");
    fireEvent.change(input, { target: { value: "1.9" } });
    fireEvent.blur(input);
    expect(onResize).toHaveBeenCalledWith("L1-vend", 0, 1.9);
  });

  it("ignores a height that is not a positive number", () => {
    // For a detail this is a dimension someone models to, so a typo that
    // silently saved zero would be worse than ignoring it.
    const { onResize } = setup();
    const input = screen.getByLabelText("Height (m)");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(onResize).not.toHaveBeenCalled();
  });

  it("does not save a height that did not change", () => {
    const { onResize } = setup();
    fireEvent.blur(screen.getByLabelText("Height (m)"));
    expect(onResize).not.toHaveBeenCalled();
  });

  it("says nothing is selected rather than rendering an empty form", () => {
    useEditorStore.getState().select(null);
    setup();
    expect(screen.getByText(/nothing selected/i)).toBeTruthy();
  });
});
