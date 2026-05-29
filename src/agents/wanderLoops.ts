import type { FloorId } from "@/data/types";

export type WanderLoop = {
  floorId: FloorId;
  color: string;
  points: [number, number][];
};

// Loops between real OTH zone centers so NPCs visibly traverse the building.
export const WANDER_LOOPS: WanderLoop[] = [
  // L1 - shopper / commerce loop: town square -> stadium -> dance studios -> commercial
  {
    floorId: "L1",
    color: "#F2A33C",
    points: [[128, 95.21], [125, 95.21], [132, 97.83], [130, 53.48], [128, 95.21]],
  },
  // L1 - services loop: town square -> PSC -> hawker -> community
  {
    floorId: "L1",
    color: "#0066B3",
    points: [[128, 95.21], [99, 69.13], [97, 49.57], [84, 74.35], [128, 95.21]],
  },
  // L1 - leisure loop: town square -> interim park -> community
  {
    floorId: "L1",
    color: "#4CAF50",
    points: [[128, 95.21], [91, 109.56], [84, 74.35], [128, 95.21]],
  },
  // L2 - library / arts loop
  {
    floorId: "L2",
    color: "#9C27B0",
    points: [[128, 83.37], [145, 90.22], [134, 110.78], [114, 108.5], [128, 83.37]],
  },
  // L2 - housing / civic loop
  {
    floorId: "L2",
    color: "#E91E63",
    points: [[128, 83.37], [128, 42.26], [131, 43.4], [95, 42.26], [128, 83.37]],
  },
];
