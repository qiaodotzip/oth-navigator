import { PlaceSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { exactPlace, linkablePlaces, normalName, suggestPlaces } from "./suggest";

const place = (id: string, nameEn: string) => PlaceSchema.parse({ id, nameEn, category: "retail" });
const all = [
  place("p_ntuc", "NTUC FairPrice"),
  place("p_lib", "Public Library"),
  place("p_gate", "Gate 1"),
  place("p_l2", "Toilets"),
  place("p_l1_toilets", "Toilets"),
];
const levels = new Map<string, string | undefined>([
  ["p_ntuc", "oth-L1"], ["p_lib", "oth-L1"], ["p_gate", undefined], ["p_l2", "oth-L2"], ["p_l1_toilets", "oth-L1"],
]);
const counts = new Map([["p_ntuc", 7], ["p_gate", 1]]);

describe("normalName", () => {
  it("ignores case, spacing and the ends", () => {
    expect(normalName("  Gate   1 ")).toBe("gate 1");
    expect(normalName("GATE 1")).toBe(normalName("gate 1"));
  });
});

describe("linkablePlaces", () => {
  it("offers this floor's places and those with no floor yet, never another floor's", () => {
    // L2's Toilets are a different place from L1's, whatever they are called.
    expect(linkablePlaces(all, levels, "oth-L1").map(p => p.id).sort())
      .toEqual(["p_gate", "p_l1_toilets", "p_lib", "p_ntuc"]);
  });
});

describe("suggestPlaces", () => {
  const candidates = linkablePlaces(all, levels, "oth-L1");

  it("lists this floor's places first, alphabetically, with how often each was seen", () => {
    expect(suggestPlaces(candidates, levels, "oth-L1", "", counts).map(s => [s.place.nameEn, s.count, s.onFloor])).toEqual([
      ["NTUC FairPrice", 7, true],
      ["Public Library", 0, true],
      ["Toilets", 0, true],
      ["Gate 1", 1, false],
    ]);
  });

  it("narrows to what matches, a prefix match first", () => {
    const names = suggestPlaces(candidates, levels, "oth-L1", "li", counts).map(s => s.place.nameEn);
    expect(names).toEqual(["Public Library"]);
  });
});

describe("exactPlace", () => {
  const candidates = linkablePlaces(all, levels, "oth-L1");

  it("finds the place a name means, whatever its case and spacing", () => {
    expect(exactPlace(candidates, levels, "oth-L1", " ntuc   fairprice ")?.id).toBe("p_ntuc");
  });

  it("means this floor's place when another floor has one of the same name", () => {
    expect(exactPlace(candidates, levels, "oth-L1", "Toilets")?.id).toBe("p_l1_toilets");
  });

  it("links a place with no floor yet", () => {
    expect(exactPlace(candidates, levels, "oth-L1", "gate 1")?.id).toBe("p_gate");
  });

  it("finds nothing for a new name, or no name", () => {
    expect(exactPlace(candidates, levels, "oth-L1", "Fresh Bakery")).toBeNull();
    expect(exactPlace(candidates, levels, "oth-L1", "   ")).toBeNull();
  });
});

describe("an object's place", () => {
  it("is linkable on every floor, wherever it was filmed: a wastebin on L2 is another of L1's kind", () => {
    const bin = PlaceSchema.parse({ id: "pl_bin", nameEn: "wastebin", category: "facility", objectKindId: "ok_bin" });
    const shop = PlaceSchema.parse({ id: "pl_shop", nameEn: "Shop", category: "retail" });
    const filmed = new Map<string, string | undefined>([["pl_bin", "oth-L1"], ["pl_shop", "oth-L1"]]);
    expect(linkablePlaces([bin, shop], filmed, "oth-L2").map(p => p.id)).toEqual(["pl_bin"]);
  });
});
