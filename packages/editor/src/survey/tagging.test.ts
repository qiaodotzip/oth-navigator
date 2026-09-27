import { describe, expect, it } from "vitest";
import { drawnBox, newId, tagWrites, walkwayColour } from "./tagging";

const ids = () => {
  let n = 0;
  return (prefix: string) => `${prefix}_${++n}`;
};

describe("newId", () => {
  it("makes an id the server accepts: letters, digits and underscores", () => {
    expect(newId("pl", 1_790_000_000_000, () => 0.123456789)).toMatch(/^pl_[a-z0-9]+$/);
  });

  it("differs for two made in the same millisecond", () => {
    expect(newId("sg", 1, () => 0.1)).not.toBe(newId("sg", 1, () => 0.2));
  });
});

describe("tagWrites", () => {
  it("makes a new place on the floor being surveyed, then the sighting on the frame", () => {
    const writes = tagWrites({ placeId: null, nameEn: "Kiosk", category: "retail" }, "kf_1", "oth-L1", ids());
    expect(writes.place).toEqual({ id: "pl_1", nameEn: "Kiosk", category: "retail", levelId: "oth-L1" });
    expect(writes.sighting).toEqual({ id: "sg_2", placeId: "pl_1", keyframeId: "kf_1" });
  });

  it("links an existing place without writing it again", () => {
    const writes = tagWrites({ placeId: "p_ntuc", nameEn: "NTUC FairPrice", category: "retail" }, "kf_1", "oth-L1", ids());
    expect(writes.place).toBeNull();
    expect(writes.sighting).toMatchObject({ placeId: "p_ntuc", keyframeId: "kf_1" });
  });

  it("keeps the box, and a walkway's type", () => {
    const box = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    const writes = tagWrites(
      { placeId: null, nameEn: "Covered link east", category: "facility", pathwayKindId: "pk-1", box },
      "kf_1", "oth-L1", ids(),
    );
    expect(writes.place).toMatchObject({ pathwayKindId: "pk-1" });
    expect(writes.sighting).toMatchObject({ box });
  });
});

describe("drawnBox", () => {
  it("keeps a box drawn on purpose", () => {
    expect(drawnBox({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 })).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  });

  it("drops a box too small to have been drawn on purpose, and no box at all", () => {
    expect(drawnBox({ x: 0.1, y: 0.1, w: 0.005, h: 0.3 })).toBeUndefined();
    expect(drawnBox(null)).toBeUndefined();
  });
});

describe("walkwayColour", () => {
  it("gives each new walkway type the next colour, round the palette", () => {
    expect(walkwayColour(0)).toBe("#38bdf8");
    expect(walkwayColour(6)).toBe("#38bdf8");
    expect(walkwayColour(1)).not.toBe(walkwayColour(0));
  });
});
