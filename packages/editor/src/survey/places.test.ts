import { PlaceSchema } from "@oth/model";
import { describe, expect, it } from "vitest";
import { matchPlaces, sightingCounts } from "./places";

const place = (id: string, nameEn: string, nameZh = "") =>
  PlaceSchema.parse({ id, nameEn, nameZh, category: "retail" });

const all = [
  place("p1", "NTUC FairPrice"),
  place("p2", "Coffee Bean"),
  place("p3", "Bean There", "咖啡"),
];

describe("matchPlaces", () => {
  it("matches on any part of the name, since people type the distinctive word", () => {
    expect(matchPlaces(all, "coff").map(p => p.nameEn)).toContain("Coffee Bean");
  });

  it("ignores case and surrounding space", () => {
    expect(matchPlaces(all, "  ntuc  ").map(p => p.id)).toEqual(["p1"]);
  });

  it("puts a prefix match first, since that is usually the one meant", () => {
    expect(matchPlaces(all, "bean").map(p => p.id)).toEqual(["p3", "p2"]);
  });

  it("returns everything for an empty query, so the list is browsable", () => {
    expect(matchPlaces(all, "")).toHaveLength(3);
  });

  it("matches the Chinese name too", () => {
    expect(matchPlaces(all, "咖啡").map(p => p.id)).toEqual(["p3"]);
  });

  it("returns nothing when nothing matches, rather than everything", () => {
    expect(matchPlaces(all, "zzz")).toEqual([]);
  });

  it("does not mutate what it was given", () => {
    matchPlaces(all, "bean");
    expect(all.map(p => p.id)).toEqual(["p1", "p2", "p3"]);
  });
});

describe("sightingCounts", () => {
  it("counts how often each place was seen", () => {
    const counts = sightingCounts([{ placeId: "p1" }, { placeId: "p1" }, { placeId: "p2" }]);
    expect(counts.get("p1")).toBe(2);
    expect(counts.get("p2")).toBe(1);
  });

  it("knows nothing about a place never sighted", () => {
    expect(sightingCounts([]).get("p1")).toBeUndefined();
  });
});
