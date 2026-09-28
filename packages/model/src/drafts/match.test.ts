import { describe, expect, it } from "vitest";
import { RoomDraftSchema, type RoomDraft } from "../schema/pdfPlan";
import { RoomSchema, type Room } from "../schema/structure";
import { coverage, draftMatch } from "./match";

const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const room = (id: string, ring: [number, number][], kind: Room["kind"] = "room"): Room =>
  RoomSchema.parse({ id, levelId: "oth-L2", kind, footprint: ring, heightM: 4 });
const shaped = (id: string, ring: [number, number][] | undefined, over: Partial<RoomDraft> = {}): RoomDraft => ({
  ...RoomDraftSchema.parse({
    id, levelId: "oth-L2", nameEn: id, kind: "room", footprint: square(0, 0, 10),
    labelPoint: [5, 5], areaM2: 96, source: { checksum: "c".repeat(64), page: 1 },
  }),
  footprint: ring,
  ...over,
});

describe("coverage", () => {
  it("is how much of a room a draft covers", () => {
    expect(coverage(shaped("d", square(0, 0, 10)), room("r", square(0, 0, 10)))).toBeCloseTo(1, 1);
    expect(coverage(shaped("d", square(0, 0, 10)), room("r", square(5, 0, 10)))).toBeCloseTo(0.5, 1);
    expect(coverage(shaped("d", square(0, 0, 10)), room("r", square(30, 30, 5)))).toBe(0);
    expect(coverage(shaped("d", undefined), room("r", square(0, 0, 10)))).toBe(0);
  });
  it("counts nothing a draft's hole leaves out", () => {
    const ring = shaped("d", square(0, 0, 10), { holes: [square(2, 2, 6)] });
    expect(coverage(ring, room("r", square(2, 2, 6)))).toBe(0);
  });
});

describe("draftMatch", () => {
  it("finds the room a draft copies: each covers more than half of the other", () => {
    const shop = room("L2-shop", square(50.2, 50.2, 9.6));
    expect(draftMatch(shaped("copy", square(50, 50, 10)), [shop])).toEqual({ copyOf: shop, overRooms: true });
  });

  it("keeps a new hall built round a small room, since that room is only a sliver of it, but says it lies over one", () => {
    expect(draftMatch(shaped("hall", square(0, 0, 30)), [room("L2-riser", square(10, 10, 2))])).toEqual({ copyOf: null, overRooms: true });
  });

  it("never takes a column for the hall it stands in", () => {
    const column = shaped("col", square(10, 10, 1), { kind: "detail" });
    expect(draftMatch(column, [room("L2-hall", square(0, 0, 30))]).copyOf).toBeNull();
  });

  it("says nothing of a space the drawing leaves open", () => {
    expect(draftMatch(shaped("plaza", undefined), [room("r", square(0, 0, 10))])).toEqual({ copyOf: null, overRooms: false });
  });
});
