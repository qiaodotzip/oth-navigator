import type { RoomLabel } from "@oth/renderer";
import { LABEL_COLOURS } from "@oth/renderer";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { PlanRoomLabels } from "./RoomLabels";

const labels: RoomLabel[] = [
  { roomId: "a", name: "Starbucks", tone: "confirmed", at: [5, 5], widthM: 10, heightM: 10, liftM: 3 },
  { roomId: "b", name: "Anchor Books", tone: "proposed", at: [25, 5], widthM: 10, heightM: 10, liftM: 3 },
  { roomId: "c", name: "Shop", tone: "drawing", at: [45, 5], widthM: 10, heightM: 10, liftM: 3 },
];

function show(scale: number) {
  useEditorStore.getState().setViewport({ originX: 0, originY: 500, scale });
  render(<svg><PlanRoomLabels labels={labels} /></svg>);
}

const label = (id: string) => screen.queryByTestId(`room-label-${id}`);

beforeEach(() => useEditorStore.getState().reset());

describe("PlanRoomLabels", () => {
  it("names each room where it fits: ✓ for confirmed, proposed spelled out, the drawing's name in grey", () => {
    show(20);
    expect(label("a")?.textContent).toBe("✓ Starbucks");
    expect(label("b")?.textContent).toBe("Anchor Books proposed");
    expect(label("c")?.textContent).toBe("Shop");
    expect(label("c")?.getAttribute("fill")).toBe(LABEL_COLOURS.drawing);
  });

  it("sits each label at its point on screen", () => {
    show(20);
    expect(label("a")?.getAttribute("x")).toBe("100");
    expect(label("a")?.getAttribute("y")).toBe("400");
  });

  it("cuts names short, and leaves out those that cannot fit, as you zoom out", () => {
    show(6);
    expect(label("a")?.textContent).toBe("✓ Sta…");
    expect(label("b")).toBeNull();
    expect(label("c")?.textContent).toBe("Shop");
  });

  it("shows nothing when zoomed out too far for a line of text", () => {
    show(1);
    expect(screen.getByTestId("room-labels").childElementCount).toBe(0);
  });

  it("lets clicks through to the rooms beneath", () => {
    show(20);
    expect(screen.getByTestId("room-labels").getAttribute("pointer-events")).toBe("none");
  });
});
