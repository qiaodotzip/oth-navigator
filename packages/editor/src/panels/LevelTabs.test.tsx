import { parseModel } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { LevelTabs } from "./LevelTabs";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-B1", buildingId: "oth", code: "B1", ordinal: -1, nameEn: "B1", nameZh: "地下一层", elevationM: -4, heightM: 4 },
  ],
});

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
});

describe("LevelTabs", () => {
  it("renders nothing before a model loads", () => {
    useEditorStore.getState().reset();
    const { container } = render(<LevelTabs />);
    expect(container.firstChild).toBeNull();
  });

  it("lists levels in building order, basement first", () => {
    render(<LevelTabs />);
    const codes = screen.getAllByRole("tab").map(n => n.textContent);
    expect(codes).toEqual(["B1", "L1", "L2"]);
  });

  it("marks the active level", () => {
    render(<LevelTabs />);
    // The lowest ordinal is selected automatically when a model loads.
    expect(screen.getByTestId("level-B1").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("level-L2").getAttribute("aria-selected")).toBe("false");
  });

  it("switches level when a tab is clicked", () => {
    render(<LevelTabs />);
    fireEvent.click(screen.getByTestId("level-L2"));
    expect(useEditorStore.getState().activeLevelId).toBe("oth-L2");
  });
});
