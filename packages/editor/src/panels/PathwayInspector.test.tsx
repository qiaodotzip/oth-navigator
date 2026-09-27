import { parseModel } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { PathwayInspector } from "./PathwayInspector";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  pathwayKinds: [
    { id: "pk-1", nameEn: "Covered link", colorHex: "#38bdf8" },
    { id: "pk-2", nameEn: "Ramp", colorHex: "#f2a33c" },
  ],
  pathways: [{ id: "p1", levelId: "oth-L1", polyline: [[0, 0], [10, 0]], widthM: 2.4 }],
});

function setup(select = true) {
  const saver = { update: vi.fn().mockResolvedValue(true) } as unknown as Saver;
  useEditorStore.getState().setModel(model);
  if (select) useEditorStore.getState().select({ type: "pathway", id: "p1" });
  render(<PathwayInspector saver={saver} />);
  return saver as unknown as { update: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  useEditorStore.getState().reset();
});

describe("PathwayInspector", () => {
  it("asks for a selection first", () => {
    setup(false);
    expect(screen.getByText(/select a walkway/i)).toBeTruthy();
  });

  it("offers every type the team has defined", () => {
    setup();
    const options = [...screen.getByLabelText("Walkway type").querySelectorAll("option")]
      .map(o => o.textContent);
    expect(options).toEqual(["No type yet", "Covered link", "Ramp"]);
  });

  it("assigns a type", () => {
    const saver = setup();
    fireEvent.change(screen.getByLabelText("Walkway type"), { target: { value: "pk-2" } });
    expect(saver.update).toHaveBeenCalledWith("pathway", "p1", 0, { kindId: "pk-2" });
  });

  it("clears the type back to none, which has to be choosable", () => {
    const saver = setup();
    fireEvent.change(screen.getByLabelText("Walkway type"), { target: { value: "" } });
    expect(saver.update).toHaveBeenCalledWith("pathway", "p1", 0, { kindId: null });
  });

  it("edits the width, ignoring a value that is not a positive number", () => {
    const saver = setup();
    const width = screen.getByLabelText("Walkway width");
    fireEvent.change(width, { target: { value: "0" } });
    fireEvent.blur(width);
    expect(saver.update).not.toHaveBeenCalled();
    fireEvent.change(width, { target: { value: "3.5" } });
    fireEvent.blur(width);
    expect(saver.update).toHaveBeenCalledWith("pathway", "p1", 0, { widthM: 3.5 });
  });

  it("toggles step free, which is what makes a route accessible", () => {
    const saver = setup();
    fireEvent.click(screen.getByLabelText("Step free"));
    expect(saver.update).toHaveBeenCalledWith("pathway", "p1", 0, { stepFree: false });
  });
});
