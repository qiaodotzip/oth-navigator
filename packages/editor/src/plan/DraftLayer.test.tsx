import { RoomDraftSchema, type RoomDraft } from "@oth/model";
import { LABEL_COLOURS, LABEL_FONT_PX, fitLabel } from "@oth/renderer";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PROPOSED_STROKE, SELECTED_STROKE } from "./colours";
import { DraftLayer, draftNameSpot, DraftOutline, type DraftShape, type ShownDraft } from "./DraftLayer";
import { worldToScreen } from "./viewport";

const draft = (id: string, nameEn: string, over: Record<string, unknown> = {}): RoomDraft => RoomDraftSchema.parse({
  id, levelId: "oth-L2", nameEn, kind: "room", footprint: [[0, 0], [10, 0], [10, 8], [0, 8]],
  labelPoint: [5, 4], areaM2: 76, source: { checksum: "c".repeat(64), page: 1 }, ...over,
});
const viewport = { originX: 100, originY: 500, scale: 10 };

function layer(drafts: ShownDraft[], over: Partial<Parameters<typeof DraftLayer>[0]> = {}) {
  const onSelect = vi.fn();
  render(
    <svg width={800} height={600}>
      <DraftLayer drafts={drafts} open={[]} selectedId={null} viewport={viewport} clickable onSelect={onSelect} {...over} />
    </svg>,
  );
  return onSelect;
}
const shape = (id: string) => screen.getByTestId(`draft-${id}`).querySelector("path")!;
const hit = (id: string) => screen.getByTestId(`draft-${id}`).querySelector("path[data-hit]");
const name = (id: string) => screen.getByTestId(`draft-${id}`).querySelector("text");
const spot = (overRooms: boolean, over: Partial<DraftShape> = {}): DraftShape =>
  ({ at: [5, 4], span: { width: 10, height: 8 }, overRooms, ...over });

describe("DraftLayer", () => {
  it("draws a draft dashed and named, so it reads as a draft by more than its colour", () => {
    layer([{ draft: draft("rd_shop", "Shop"), covered: false }]);
    expect(shape("rd_shop").getAttribute("stroke-dasharray")).toBe("6 4");
    expect(shape("rd_shop").getAttribute("stroke")).toBe(PROPOSED_STROKE);
    expect(screen.getByText("Shop")).toBeTruthy();
  });

  it("writes names as the room labels are, dark enough to read on a halo over the drawing", () => {
    layer([{ draft: draft("rd_shop", "Shop"), covered: false }], {
      open: [draft("rd_plaza", "Plaza", { footprint: undefined, kind: "area", areaM2: 0 })],
    });
    for (const text of [screen.getByText("Shop"), screen.getByText("Plaza · draw by hand")]) {
      expect(text.getAttribute("fill")).toBe(LABEL_COLOURS.proposed);
      expect(text.getAttribute("font-size")).toBe(String(LABEL_FONT_PX));
      expect(text.getAttribute("stroke")).toBe("#ffffff");
      expect(text.getAttribute("font-weight")).toBe("500");
    }
  });

  it("fits a name across its draft as a room's label is, cut short where the draft is narrow", () => {
    // 10 m wide and 8 m tall at 10 px a metre.
    layer([{ draft: draft("rd_long", "Regional Football Field"), covered: false }]);
    expect(name("rd_long")!.textContent).toBe(fitLabel("Regional Football Field", 0, 100, 80));
    expect(name("rd_long")!.textContent).toMatch(/…$/);
  });

  it("names a draft where its shape says, in the room the shape gives", () => {
    layer([{ draft: draft("rd_shop", "Shop"), covered: false, shape: spot(false, { at: [2, 3], span: { width: 4, height: 4 } }) }]);
    expect([Number(name("rd_shop")!.getAttribute("x")), Number(name("rd_shop")!.getAttribute("y"))]).toEqual(worldToScreen(viewport, [2, 3]));
  });

  it("names a draft at its middle when the drawing printed its name outside it", () => {
    const off = draft("rd_off", "Riser", { labelPoint: [30, 30] });
    expect(draftNameSpot(off).at).not.toEqual([30, 30]);
    expect(draftNameSpot(off).span.width).toBeGreaterThan(0);
  });

  it("takes clicks only on the outline of a draft over rooms, so what lies inside it can still be clicked", () => {
    const onSelect = layer([{ draft: draft("rd_hall", "Hall"), covered: false, shape: spot(true) }]);
    expect(shape("rd_hall").getAttribute("pointer-events")).toBe("none");
    expect(hit("rd_hall")!.getAttribute("pointer-events")).toBe("stroke");
    expect(hit("rd_hall")!.getAttribute("stroke")).toBe("transparent");
    expect(hit("rd_hall")!.getAttribute("fill")).toBe("none");
    expect(Number(hit("rd_hall")!.getAttribute("stroke-width"))).toBeGreaterThanOrEqual(8);
    fireEvent.click(hit("rd_hall")!);
    expect(onSelect).toHaveBeenCalledWith("rd_hall");
  });

  it("keeps the whole inside of a draft over empty floor clickable", () => {
    layer([{ draft: draft("rd_shop", "Shop"), covered: false, shape: spot(false) }]);
    expect(shape("rd_shop").getAttribute("pointer-events")).toBe("visiblePainted");
    expect(hit("rd_shop")).toBeNull();
  });

  it("takes a draft it knows nothing about as lying over rooms, which never traps a click", () => {
    layer([{ draft: draft("rd_shop", "Shop"), covered: false }]);
    expect(shape("rd_shop").getAttribute("pointer-events")).toBe("none");
    expect(hit("rd_shop")!.getAttribute("pointer-events")).toBe("stroke");
  });

  it("says a draft already on the map is, and draws it fainter", () => {
    layer([{ draft: draft("rd_hall", "Hall"), covered: true }]);
    expect(screen.getByTestId("draft-rd_hall").textContent).toContain("already on the map");
    expect(shape("rd_hall").getAttribute("stroke-opacity")).toBe("0.5");
  });

  it("draws the draft in hand in the selection's colour, and thicker", () => {
    layer([{ draft: draft("rd_shop", "Shop"), covered: false }], { selectedId: "rd_shop" });
    expect(shape("rd_shop").getAttribute("stroke")).toBe(SELECTED_STROKE);
    expect(shape("rd_shop").getAttribute("stroke-width")).toBe("2.5");
  });

  it("takes a click on a draft only while Select is in use", () => {
    const onSelect = layer([{ draft: draft("rd_shop", "Shop"), covered: false }]);
    fireEvent.click(shape("rd_shop"));
    expect(onSelect).toHaveBeenCalledWith("rd_shop");
  });

  it("lets clicks through to the drawing tool when another tool is in use", () => {
    const onSelect = layer([{ draft: draft("rd_shop", "Shop"), covered: false }], { clickable: false });
    expect(shape("rd_shop").getAttribute("pointer-events")).toBe("none");
    fireEvent.click(shape("rd_shop"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("lets clicks through a draft's outline and inside alike when another tool is in use", () => {
    layer([
      { draft: draft("rd_hall", "Hall"), covered: false, shape: spot(true) },
      { draft: draft("rd_shop", "Shop"), covered: false, shape: spot(false) },
    ], { clickable: false });
    expect(hit("rd_hall")?.getAttribute("pointer-events") ?? "none").toBe("none");
    expect(shape("rd_shop").getAttribute("pointer-events")).toBe("none");
  });

  it("leaves off the name of a draft too small on screen to hold it", () => {
    layer([{ draft: draft("rd_shop", "Shop"), covered: false }], { viewport: { originX: 0, originY: 0, scale: 1 } });
    expect(screen.queryByText("Shop")).toBeNull();
  });

  it("marks a space the drawing leaves open at its name, to draw by hand", () => {
    layer([], { open: [draft("rd_plaza", "Plaza", { footprint: undefined, kind: "area", areaM2: 0 })] });
    expect(screen.getByTestId("open-rd_plaza").textContent).toBe("Plaza · draw by hand");
  });

  it("fits an open space's name too, keeps 'draw by hand' whole, and leaves the words off far out", () => {
    const walkway = draft("rd_walk", "Covered Public Walkway", { footprint: undefined, kind: "area", areaM2: 0 });
    layer([], { open: [walkway] });
    expect(screen.getByTestId("open-rd_walk").textContent).toMatch(/^Covered Public W.*… · draw by hand$/);
  });

  it("keeps an open space's mark but not its words when the plan is too far out to read them", () => {
    layer([], { open: [draft("rd_plaza", "Plaza", { footprint: undefined, kind: "area", areaM2: 0 })], viewport: { originX: 0, originY: 0, scale: 1 } });
    expect(screen.getByTestId("open-rd_plaza").querySelector("circle")).toBeTruthy();
    expect(screen.getByTestId("open-rd_plaza").textContent).toBe("");
  });
});

describe("DraftOutline", () => {
  it("draws one outline painted as the draft in hand is, and never in the way of a click", () => {
    const ring: [number, number][] = [[0, 0], [10, 0], [10, 8], [0, 8]];
    layer([{ draft: draft("rd_shop", "Shop"), covered: false }], { selectedId: "rd_shop" });
    render(<svg><DraftOutline outline={ring} viewport={viewport} /></svg>);
    const drawn = screen.getByTestId("draft-outline");
    expect(drawn.getAttribute("d")).toBe(`M${ring.map(p => worldToScreen(viewport, p).join(",")).join("L")}Z`);
    for (const paint of ["fill", "fill-opacity", "stroke", "stroke-opacity", "stroke-width", "stroke-dasharray"]) {
      expect(drawn.getAttribute(paint)).toBe(shape("rd_shop").getAttribute(paint));
    }
    expect(drawn.getAttribute("stroke")).toBe(SELECTED_STROKE);
    expect(drawn.getAttribute("pointer-events")).toBe("none");
  });
});
