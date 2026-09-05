import { parseModel } from "@oth/model";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { DetailExportButton } from "./DetailExportButton";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [
    { id: "L1-vend", levelId: "oth-L1", kind: "detail", footprint: [[0, 0], [4, 0], [4, 2], [0, 2]], heightM: 1.9, walkable: false },
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: [[0, 4], [10, 4], [10, 10], [0, 10]], heightM: 3.5, walkable: false, nameEn: "Shop", nameZh: "店" },
  ],
});

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
});

describe("DetailExportButton", () => {
  it("is disabled until a detail is selected", () => {
    render(<DetailExportButton />);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it("stays disabled for a room, which exports with the level instead", () => {
    useEditorStore.getState().select({ type: "room", id: "L1-shop" });
    render(<DetailExportButton />);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it("is enabled for a selected detail", () => {
    useEditorStore.getState().select({ type: "room", id: "L1-vend" });
    render(<DetailExportButton />);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false);
  });

  it("names what it will export, so nothing leaves by accident", () => {
    useEditorStore.getState().select({ type: "room", id: "L1-vend" });
    render(<DetailExportButton />);
    expect(screen.getByRole("button").textContent).toContain("L1-vend");
  });

  it("says what to do when nothing is selected", () => {
    render(<DetailExportButton />);
    expect(screen.getByRole("button").textContent).toMatch(/select a detail/i);
  });
});
