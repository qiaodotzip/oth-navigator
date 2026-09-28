import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import {
  currentProposal, evidenceFor, floorlessProposals, nextProposal, readReviewParams, reviewQueue, sameAs,
} from "./queue";

const frame = (id: string, captureId: string, timeMs: number) =>
  ({ id, captureId, timeMs, imageId: id, widthPx: 64, heightPx: 36 });

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  captures: [
    { id: "cap_1", kind: "video", filename: "L1.mp4", levelId: "oth-L1" },
    { id: "cap_2", kind: "video", filename: "L2.mp4", levelId: "oth-L2" },
  ],
  keyframes: [frame("kf_2", "cap_1", 2000), frame("kf_1", "cap_1", 1000), frame("kf_9", "cap_2", 0)],
  places: [
    { id: "p_big", nameEn: "Festive Mall", category: "retail", status: "proposed" },
    { id: "p_gate", nameEn: "Gate 1", category: "facility", status: "proposed" },
    { id: "p_conf", nameEn: "Gate 1", category: "facility", levelId: "oth-L1" },
    { id: "p_prop_twin", nameEn: "Gate 1", category: "facility", status: "proposed", levelId: "oth-L1" },
    { id: "p_l2_gate", nameEn: "Gate 1", category: "facility", levelId: "oth-L2" },
    { id: "p_up", nameEn: "Up there", category: "retail", status: "proposed" },
    { id: "p_none", nameEn: "No frames", category: "retail", status: "proposed" },
  ],
  sightings: [
    { id: "s2", placeId: "p_big", keyframeId: "kf_2", status: "proposed" },
    { id: "s1", placeId: "p_big", keyframeId: "kf_1", status: "proposed" },
    { id: "s3", placeId: "p_gate", keyframeId: "kf_1", status: "proposed" },
    { id: "s9", placeId: "p_up", keyframeId: "kf_9", status: "proposed" },
    { id: "s_gone", placeId: "p_gate", keyframeId: "kf_deleted", status: "proposed" },
  ],
});
const ids = (queue: { place: { id: string } }[]) => queue.map(q => q.place.id);

describe("readReviewParams", () => {
  it("reads the address as given", () => {
    expect(readReviewParams({ place: "p_big", list: "open", scope: "floorless" }))
      .toEqual({ place: "p_big", listOpen: true, scope: "floorless" });
  });

  it("falls back to the defaults for anything it does not know", () => {
    expect(readReviewParams({ list: "yes", scope: "everywhere" }))
      .toEqual({ place: null, listOpen: false, scope: "floor" });
  });
});

describe("reviewQueue", () => {
  it("holds the proposals on this floor, by the floor their frames were filmed on, most-evidenced first", () => {
    expect(ids(reviewQueue(model, "oth-L1"))).toEqual(["p_big", "p_gate", "p_prop_twin"]);
    expect(ids(reviewQueue(model, "oth-L2"))).toEqual(["p_up"]);
  });

  it("holds, in the floorless scope, the proposals no floor's queue would ever show", () => {
    expect(ids(reviewQueue(model, "oth-L1", "floorless"))).toEqual(["p_none"]);
    expect(ids(floorlessProposals(model))).toEqual(["p_none"]);
  });

  it("is empty, not broken, before the model loads", () => {
    expect(reviewQueue(null, "oth-L1")).toEqual([]);
    expect(floorlessProposals(null)).toEqual([]);
  });
});

describe("moving through the queue", () => {
  const queue = reviewQueue(model, "oth-L1");
  const none = new Set<string>();

  it("shows the proposal asked for, or the first when that one is decided or unknown", () => {
    expect(currentProposal(queue, "p_gate", none)?.place.id).toBe("p_gate");
    expect(currentProposal(queue, "p_decided", none)?.place.id).toBe("p_big");
    expect(currentProposal(queue, null, none)?.place.id).toBe("p_big");
    expect(currentProposal([], null, none)).toBeNull();
  });

  it("goes on to the next, wrapping to the start", () => {
    expect(nextProposal(queue, "p_big", none)?.place.id).toBe("p_gate");
    expect(nextProposal(queue, "p_prop_twin", none)?.place.id).toBe("p_big");
  });

  it("has nothing next when this was the last one", () => {
    expect(nextProposal(queue.slice(0, 1), "p_big", none)).toBeNull();
  });

  // Ruling 1: a decision's reload lands after the next proposal is on screen,
  // so until then the queue still holds the ones just decided.
  it("never shows a proposal decided, or still being decided, even when the address asks for it", () => {
    expect(currentProposal(queue, "p_big", new Set(["p_big"]))?.place.id).toBe("p_gate");
    expect(currentProposal(queue, null, new Set(["p_big"]))?.place.id).toBe("p_gate");
  });

  it("has nothing to show while the last one left is being decided, so a second A decides nothing", () => {
    const last = queue.slice(0, 1);
    const deciding = new Set(["p_big"]);
    expect(nextProposal(last, "p_big", deciding)).toBeNull();
    expect(currentProposal(last, null, deciding)).toBeNull();
    expect(currentProposal(last, "p_big", deciding)).toBeNull();
  });

  it("wraps past a proposal whose decision has not reloaded yet", () => {
    expect(nextProposal(queue, "p_prop_twin", new Set(["p_big", "p_prop_twin"]))?.place.id).toBe("p_gate");
    expect(nextProposal(queue, "p_prop_twin", new Set(["p_big", "p_gate", "p_prop_twin"]))).toBeNull();
  });

  it("decides each proposal once however often A is pressed before any reload lands", () => {
    const deciding = new Set<string>();
    const decided: string[] = [];
    let address: string | null = null;
    for (let press = 0; press < 5; press++) {
      const current = currentProposal(queue, address, deciding);
      if (!current) break;
      decided.push(current.place.id);
      deciding.add(current.place.id);
      address = nextProposal(queue, current.place.id, deciding)?.place.id ?? null;
    }
    expect(decided).toEqual(["p_big", "p_gate", "p_prop_twin"]);
  });

  it("shows a proposal again once its decision fails and it leaves the set", () => {
    const deciding = new Set(["p_gate"]);
    expect(currentProposal(queue, "p_gate", deciding)?.place.id).toBe("p_big");
    deciding.delete("p_gate");
    expect(currentProposal(queue, "p_gate", deciding)?.place.id).toBe("p_gate");
  });
});

describe("sameAs", () => {
  const gate = model.places.find(p => p.id === "p_gate")!;

  it("offers a confirmed place on this floor with the same name, whatever its case and spacing", () => {
    // Review Focus 3.
    expect(sameAs(model, "oth-L1", gate, "  gate   1 ").map(p => p.id)).toEqual(["p_conf"]);
  });

  it("never offers the proposal itself, another proposal, or another floor's place", () => {
    const offered = sameAs(model, "oth-L1", gate, "Gate 1").map(p => p.id);
    expect(offered).not.toContain("p_gate");
    expect(offered).not.toContain("p_prop_twin");
    expect(offered).not.toContain("p_l2_gate");
  });

  it("offers nothing for a blank name", () => {
    expect(sameAs(model, "oth-L1", gate, "  ")).toEqual([]);
  });
});

describe("evidenceFor", () => {
  it("puts a proposal's frames on their timeline, leaving out any that are gone", () => {
    const [big] = reviewQueue(model, "oth-L1");
    expect(evidenceFor(model, big!.sightings).map(e => e.frame.id)).toEqual(["kf_1", "kf_2"]);
    const gate = reviewQueue(model, "oth-L1").find(q => q.place.id === "p_gate")!;
    expect(evidenceFor(model, gate.sightings).map(e => e.frame.id)).toEqual(["kf_1"]);
  });

  it("has nothing to show, not a broken frame, for a proposal no frame shows", () => {
    // Six real proposals have no frame at all.
    const [bare] = floorlessProposals(model);
    expect(bare!.sightings).toEqual([]);
    expect(evidenceFor(model, bare!.sightings)).toEqual([]);
    const gate = reviewQueue(model, "oth-L1").find(q => q.place.id === "p_gate")!;
    expect(evidenceFor(model, gate.sightings.filter(s => s.id === "s_gone"))).toEqual([]);
  });
});
