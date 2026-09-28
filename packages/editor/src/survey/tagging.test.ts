import { ObjectKindSchema, PlaceSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { drawnBox, kindNamed, newId, sizeText, tagWrites, walkwayColour } from "./tagging";

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

describe("tagging an object", () => {
  const bin = ObjectKindSchema.parse({ id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } });
  const binPlace = PlaceSchema.parse({ id: "pl_bin", nameEn: "wastebin", category: "facility", objectKindId: "ok_bin" });
  // As on the live server: a place of its own, with no kind yet.
  const cooler = PlaceSchema.parse({ id: "pl_cooler", nameEn: "water cooler", category: "facility" });
  const known = { places: [binPlace, cooler], kinds: [bin] };

  it("makes a kind at the guessed size, and a place for it on no floor", () => {
    const w = tagWrites({ placeId: null, nameEn: "Recycling bin", category: "facility", object: true }, "kf_1", "oth-L1", ids(), known);
    expect(w.objectKind).toEqual({ id: "ok_2", nameEn: "Recycling bin", size: { w: 0.5, d: 0.5, h: 1 } });
    expect(w.place).toEqual({ id: "pl_1", nameEn: "Recycling bin", category: "facility", objectKindId: "ok_2" });
    expect(w.makeObject).toBeNull();
    expect(w.sighting).toEqual({ id: "sg_3", placeId: "pl_1", keyframeId: "kf_1" });
  });

  it("only tags the frame when the place already stands for a kind", () => {
    const w = tagWrites({ placeId: "pl_bin", nameEn: "wastebin", category: "facility", object: true }, "kf_1", "oth-L1", ids(), known);
    expect([w.objectKind, w.place, w.makeObject]).toEqual([null, null, null]);
    expect(w.sighting).toMatchObject({ placeId: "pl_bin", keyframeId: "kf_1" });
  });

  it("turns a place already surveyed into the kind's place, rather than making a second of the same name", () => {
    const w = tagWrites({ placeId: "pl_cooler", nameEn: "water cooler", category: "facility", object: true }, "kf_1", "oth-L1", ids(), known);
    expect(w.objectKind).toMatchObject({ id: "ok_1", nameEn: "water cooler" });
    expect(w.place).toBeNull();
    expect(w.makeObject).toEqual({ placeId: "pl_cooler", objectKindId: "ok_1" });
  });

  it("reuses a kind of the same name, whatever its case, so a retried tag makes no second kind", () => {
    const w = tagWrites({ placeId: null, nameEn: "Wastebin", category: "facility", object: true }, "kf_1", "oth-L1", ids(), known);
    expect(w.objectKind).toBeNull();
    expect(w.place).toMatchObject({ objectKindId: "ok_bin" });
  });

  it("still files an ordinary place under the floor being surveyed", () => {
    expect(tagWrites({ placeId: null, nameEn: "Kiosk", category: "retail" }, "kf_1", "oth-L1", ids(), known).place)
      .toEqual({ id: "pl_1", nameEn: "Kiosk", category: "retail", levelId: "oth-L1" });
  });
});

describe("kindNamed", () => {
  const bin = ObjectKindSchema.parse({ id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } });

  it("finds a kind by name, ignoring case and spacing", () => {
    expect(kindNamed([bin], "  WasteBin ")?.id).toBe("ok_bin");
    expect(kindNamed([bin], "water cooler")).toBeUndefined();
    expect(kindNamed([bin], "   ")).toBeUndefined();
  });
});

describe("sizeText", () => {
  it("says a size as width × depth × height in metres, to the centimetre", () => {
    expect(sizeText({ w: 0.5, d: 0.5, h: 1 })).toBe("0.5 × 0.5 × 1 m");
    expect(sizeText({ w: 0.333, d: 1.2, h: 1.999 })).toBe("0.33 × 1.2 × 2 m");
  });
});
