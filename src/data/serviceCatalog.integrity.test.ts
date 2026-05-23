import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Floor, Service } from "./types";

const root = process.cwd();
const services = JSON.parse(
  readFileSync(path.join(root, "public/data/services.json"), "utf8"),
) as Service[];
const floors: Record<string, Floor> = {
  L1: JSON.parse(readFileSync(path.join(root, "public/data/floors/L1.json"), "utf8")),
  L2: JSON.parse(readFileSync(path.join(root, "public/data/floors/L2.json"), "utf8")),
};

describe("service catalog integrity", () => {
  it("every service has a category and a sourceUrl", () => {
    for (const s of services) {
      expect(s.category, `${s.id} category`).toBeTruthy();
      expect(s.sourceUrl, `${s.id} sourceUrl`).toMatch(/^https?:\/\//);
      expect(s.displayFloor, `${s.id} displayFloor`).toBeTruthy();
    }
  });

  it("routable services resolve to a real polygon on their floor", () => {
    for (const s of services.filter(s => s.routable)) {
      expect(s.floorId, `${s.id} floorId`).toBeTruthy();
      expect(s.roomId, `${s.id} roomId`).toBeTruthy();
      const floor = floors[s.floorId!];
      expect(floor, `${s.id} floor ${s.floorId} loaded`).toBeTruthy();
      const poly = floor.polygons.find(p => p.id === s.roomId);
      expect(poly, `${s.id} roomId ${s.roomId} exists as polygon`).toBeTruthy();
    }
  });

  it("non-routable services omit floorId/roomId", () => {
    for (const s of services.filter(s => !s.routable)) {
      expect(s.floorId, `${s.id} floorId should be absent`).toBeUndefined();
      expect(s.roomId, `${s.id} roomId should be absent`).toBeUndefined();
    }
  });
});
