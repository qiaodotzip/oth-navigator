import { bboxOfRing, type Ring } from "@oth/model";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { padded, planView, renderPlan } from "./plan";

/** 1000 × 500 px at 0.1 m/px, top-left pixel at (0, 50): the world from x 0–100 m and y 0–50 m. */
const IMAGE = { widthPx: 1000, heightPx: 500, metresPerPixel: 0.1, offsetX: 0, offsetY: 50 };
const shop = { id: "L1-shop-1", nameEn: "Shop 1", kind: "room", footprint: [[10, 40], [20, 40], [20, 30], [10, 30]] as Ring };
const far = { id: "L1-shop-9", nameEn: "Shop 9", kind: "room", footprint: [[80, 10], [90, 10], [90, 5], [80, 5]] as Ring };

describe("planView", () => {
  it("shows the whole plan scaled to fit, with every room's box in picture pixels", () => {
    const view = planView(IMAGE, [shop, far], null, null, 500)!;
    expect(view).toMatchObject({ crop: { left: 0, top: 0, width: 1000, height: 500 }, width: 500, height: 250, metresPerPixel: 0.2 });
    expect(view.rooms).toEqual([
      { id: "L1-shop-1", name: "Shop 1", kind: "room", box: [50, 50, 50, 50] },
      { id: "L1-shop-9", name: "Shop 9", kind: "room", box: [400, 200, 50, 25] },
    ]);
    expect(view.svg).not.toContain("#dc2626");
  });

  it("crops round a room at full size, leaves out rooms off the picture, and draws that room in red", () => {
    const view = planView(IMAGE, [shop, far], padded(bboxOfRing(shop.footprint), 10), shop.id)!;
    expect(view).toMatchObject({ crop: { left: 0, top: 0, width: 300, height: 300 }, width: 300, height: 300 });
    expect(view.rooms).toEqual([{ id: "L1-shop-1", name: "Shop 1", kind: "room", box: [100, 100, 100, 100] }]);
    expect(view.svg.match(/#dc2626/g)).toHaveLength(1);
    expect(view.shows.minX).toBeCloseTo(0);
    expect(view.shows.maxX).toBeCloseTo(30);
    expect(view.shows.minY).toBeCloseTo(20);
    expect(view.shows.maxY).toBeCloseTo(50);
  });

  it("is null when the part asked for is off the plan", () => {
    expect(planView(IMAGE, [shop], { minX: 200, minY: 0, maxX: 210, maxY: 10 }, null)).toBeNull();
  });

  it("puts nothing from the data into the SVG but numbers", () => {
    const hostile = { ...shop, id: "<script>", nameEn: "</svg><script>alert(1)</script>" };
    expect(planView(IMAGE, [hostile], null, null)!.svg).not.toContain("script");
  });
});

describe("renderPlan", () => {
  it("renders the view as a JPEG of its size", async () => {
    const plan = await sharp({ create: { width: 1000, height: 500, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const view = planView(IMAGE, [shop], null, null, 500)!;
    const meta = await sharp(Buffer.from(await renderPlan(new Uint8Array(plan), view))).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 500, 250]);
  });
});
