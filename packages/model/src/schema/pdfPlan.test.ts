import { describe, expect, it } from "vitest";
import { PlanSheetSchema, PlanSourceSchema, RoomDraftInputSchema, RoomDraftSchema } from "./pdfPlan";

const draft = {
  id: "rd_1", levelId: "oth-L2", nameEn: " Shop ", kind: "room",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], labelPoint: [5, 5], areaM2: 100,
  source: { checksum: "a".repeat(64), page: 1 },
};
const sheet = {
  page: 1, pageCount: 1, pageSizePt: [792, 612], rotation: 90, clipPt: [117, 76, 684, 556],
  pointsPerPixel: 0.0933, metresPerPoint: 0.7505, runsAgree: 2, runsFound: 3,
};

describe("RoomDraftSchema", () => {
  it("reads a draft, trims its name, and gives it no holes by default", () => {
    const parsed = RoomDraftSchema.parse(draft);
    expect(parsed.nameEn).toBe("Shop");
    expect(parsed.holes).toEqual([]);
    expect(parsed.version).toBe(0);
  });
  it("keeps a space the drawing leaves open, with no shape", () => {
    expect(RoomDraftSchema.parse({ ...draft, footprint: undefined }).footprint).toBeUndefined();
  });
  it("refuses a draft with no name", () => {
    expect(RoomDraftSchema.safeParse({ ...draft, nameEn: "  " }).success).toBe(false);
  });
  it("takes any kind a room can be, a column's detail and a void included", () => {
    expect(RoomDraftSchema.safeParse({ ...draft, kind: "void" }).success).toBe(true);
    expect(RoomDraftSchema.safeParse({ ...draft, kind: "detail" }).success).toBe(true);
    expect(RoomDraftSchema.safeParse({ ...draft, kind: "corridor" }).success).toBe(false);
  });
  it("what the finder sends carries no id, floor or source: the server gives those", () => {
    const parsed = RoomDraftInputSchema.parse(draft);
    expect(Object.keys(parsed).sort()).toEqual(["areaM2", "footprint", "holes", "kind", "labelPoint", "nameEn"]);
  });
});

describe("PlanSheetSchema and PlanSourceSchema", () => {
  it("records where a plan sits on its sheet, with or without a scale", () => {
    expect(PlanSheetSchema.safeParse(sheet).success).toBe(true);
    expect(PlanSheetSchema.safeParse({ ...sheet, metresPerPoint: null, runsAgree: 0 }).success).toBe(true);
  });
  it("refuses a sheet turned other than by quarters, or with no pixels", () => {
    expect(PlanSheetSchema.safeParse({ ...sheet, rotation: 45 }).success).toBe(false);
    expect(PlanSheetSchema.safeParse({ ...sheet, pointsPerPixel: 0 }).success).toBe(false);
    expect(PlanSheetSchema.safeParse({ ...sheet, clipPt: [0, 0, 1] }).success).toBe(false);
  });
  it("names the PDF by its SHA-256", () => {
    const source = { ...sheet, pdfId: "pdf_1", checksum: "b".repeat(64), filename: "L1.pdf" };
    expect(PlanSourceSchema.safeParse(source).success).toBe(true);
    expect(PlanSourceSchema.safeParse({ ...source, checksum: "abc" }).success).toBe(false);
  });
});
