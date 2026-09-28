import { RoomDraftSchema, type RoomDraft } from "@oth/model";
import { LABEL_COLOURS, LABEL_FONT_PX } from "@oth/renderer";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PROPOSED_STROKE, SELECTED_STROKE } from "./colours";
import { DraftLayer, type ShownDraft } from "./DraftLayer";

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
    for (const name of [screen.getByText("Shop"), screen.getByText("Plaza · draw by hand")]) {
      expect(name.getAttribute("fill")).toBe(LABEL_COLOURS.proposed);
      expect(name.getAttribute("font-size")).toBe(String(LABEL_FONT_PX));
      expect(name.getAttribute("stroke")).toBe("#ffffff");
    }
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

  it("leaves off the name of a draft too small on screen to hold it", () => {
    layer([{ draft: draft("rd_shop", "Shop"), covered: false }], { viewport: { originX: 0, originY: 0, scale: 1 } });
    expect(screen.queryByText("Shop")).toBeNull();
  });

  it("marks a space the drawing leaves open at its name, to draw by hand", () => {
    layer([], { open: [draft("rd_plaza", "Plaza", { footprint: undefined, kind: "area", areaM2: 0 })] });
    expect(screen.getByTestId("open-rd_plaza").textContent).toBe("Plaza · draw by hand");
  });
});
