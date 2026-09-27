import { parseModel } from "@oth/model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { PathwayKindsPanel } from "./PathwayKindsPanel";

const base = {
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
};

function setup(extra: Record<string, unknown> = {}) {
  const saver = {
    create: vi.fn().mockResolvedValue(true),
    update: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
  } as unknown as Saver;
  useEditorStore.getState().setModel(parseModel({ ...base, ...extra }));
  render(<PathwayKindsPanel saver={saver} />);
  return saver as unknown as {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
}

const covered = { id: "pk-1", nameEn: "Covered link", colorHex: "#38bdf8", modellingNote: "Roofed." };

beforeEach(() => {
  useEditorStore.getState().reset();
});

describe("PathwayKindsPanel", () => {
  it("says what to do when no types exist yet", () => {
    setup();
    expect(screen.getByText(/none yet/i)).toBeTruthy();
  });

  it("adds a type with a colour already chosen", () => {
    const saver = setup();
    fireEvent.change(screen.getByLabelText("New walkway type"), { target: { value: "Ramp" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(saver.create.mock.calls[0]![1]).toMatchObject({ nameEn: "Ramp" });
    // Picking a colour by hand for every type is friction nobody needs.
    expect(saver.create.mock.calls[0]![1].colorHex).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("refuses an empty type name", () => {
    const saver = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(saver.create).not.toHaveBeenCalled();
  });

  it("keeps the modelling note, which is the reason types exist", () => {
    const saver = setup({ pathwayKinds: [covered] });
    const note = screen.getByLabelText("Modelling note for Covered link");
    fireEvent.change(note, { target: { value: "Roofed, open sides, 3 m clear." } });
    fireEvent.blur(note);
    expect(saver.update.mock.calls[0]![3]).toEqual({ modellingNote: "Roofed, open sides, 3 m clear." });
  });

  it("counts the walkways on each type", () => {
    setup({
      pathwayKinds: [covered],
      pathways: [
        { id: "p1", levelId: "oth-L1", polyline: [[0, 0], [9, 0]], kindId: "pk-1" },
        { id: "p2", levelId: "oth-L1", polyline: [[0, 5], [9, 5]], kindId: "pk-1" },
      ],
    });
    expect(screen.getByTestId("kind-pk-1").textContent).toContain("on 2 walkway(s)");
  });

  it("refuses to delete a type still in use, rather than orphaning walkways", async () => {
    const saver = setup({
      pathwayKinds: [covered],
      pathways: [{ id: "p1", levelId: "oth-L1", polyline: [[0, 0], [9, 0]], kindId: "pk-1" }],
    });
    fireEvent.click(screen.getByLabelText("Delete Covered link"));
    expect(saver.remove).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(useEditorStore.getState().status).toContain("1 walkway"));
  });

  it("deletes a type nothing uses", () => {
    const saver = setup({ pathwayKinds: [covered] });
    fireEvent.click(screen.getByLabelText("Delete Covered link"));
    expect(saver.remove).toHaveBeenCalledWith("pathwayKind", "pk-1", 0);
  });
});
