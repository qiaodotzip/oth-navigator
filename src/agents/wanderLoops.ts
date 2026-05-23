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
    points: [[128, 83.37], [125, 83.37], [132, 85.66], [130, 46.83], [128, 83.37]],
  },
  // L1 - services loop: town square -> PSC -> hawker -> community
  {
    floorId: "L1",
    color: "#0066B3",
    points: [[128, 83.37], [99, 60.53], [97, 43.4], [84, 65.1], [128, 83.37]],
  },
  // L1 - leisure loop: town square -> interim park -> community
  {
    floorId: "L1",
    color: "#4CAF50",
    points: [[128, 83.37], [91, 95.93], [84, 65.1], [128, 83.37]],
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
