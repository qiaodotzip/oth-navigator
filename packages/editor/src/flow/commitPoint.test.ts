import { parseModel } from "@oth/model";
import { describe, expect, it, vi } from "vitest";
import { commitPoint } from "./commitPoint";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-plaza", levelId: "oth-L1", kind: "area", footprint: [[0, 0], [100, 0], [100, 100], [0, 100]], heightM: 5, walkable: true },
    { id: "L2-hall", levelId: "oth-L2", kind: "area", footprint: [[0, 0], [100, 0], [100, 100], [0, 100]], heightM: 4, walkable: true },
  ],
  portals: [{ id: "lift-a", kind: "lift" }],
  portalEndpoints: [{ id: "ep-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-plaza", point: [40, 40] }],
});

function fakeSaver() {
  return { create: vi.fn().mockResolvedValue(true) };
}

describe("commitPoint", () => {
  it("saves an entrance where the entrance tool clicked", async () => {
    const saver = fakeSaver();
    const say = vi.fn();
    await commitPoint({ saver, model, tool: "place-entrance", levelId: "oth-L1", point: [5, 5], say, now: 3 });
    expect(saver.create).toHaveBeenCalledWith("entrance", {
      id: "oth-L1-entrance-3", levelId: "oth-L1", roomId: "L1-plaza", point: [5, 5],
    });
  });

  it("says why nothing was placed instead of doing nothing", async () => {
    const saver = fakeSaver();
    const say = vi.fn();
    await commitPoint({ saver, model, tool: "place-entrance", levelId: "oth-L1", point: [500, 5], say, now: 3 });
    expect(saver.create).not.toHaveBeenCalled();
    expect(say).toHaveBeenCalledWith(expect.stringMatching(/inside an area/i));
  });

  it("creates the lift before its first stop, so the stop has something to point at", async () => {
    const saver = fakeSaver();
    await commitPoint({ saver, model, tool: "place-portal", levelId: "oth-L1", point: [80, 80], say: vi.fn(), now: 9 });
    expect(saver.create.mock.calls.map(c => c[0])).toEqual(["portal", "portalEndpoint"]);
    expect(saver.create.mock.calls[1]![1]).toMatchObject({ portalId: "portal-9", levelId: "oth-L1" });
  });

  it("adds a stop to the lift already at that spot on another level", async () => {
    const saver = fakeSaver();
    const say = vi.fn();
    await commitPoint({ saver, model, tool: "place-portal", levelId: "oth-L2", point: [40, 40], say, now: 9 });
    expect(saver.create.mock.calls.map(c => c[0])).toEqual(["portalEndpoint"]);
    expect(saver.create.mock.calls[0]![1]).toMatchObject({ portalId: "lift-a", levelId: "oth-L2" });
    expect(say).toHaveBeenCalledWith(expect.stringMatching(/joined/i));
  });

  it("does not add a stop when creating its lift failed", async () => {
    const saver = { create: vi.fn().mockResolvedValue(false) };
    await commitPoint({ saver, model, tool: "place-portal", levelId: "oth-L1", point: [80, 80], say: vi.fn(), now: 9 });
    expect(saver.create).toHaveBeenCalledTimes(1);
  });
});
