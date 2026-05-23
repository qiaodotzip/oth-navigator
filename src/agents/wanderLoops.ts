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
    points: [[128, 73], [125, 73], [132, 75], [130, 41], [128, 73]],
  },
  // L1 - services loop: town square -> PSC -> hawker -> community
  {
    floorId: "L1",
    color: "#0066B3",
    points: [[128, 73], [99, 53], [97, 38], [84, 57], [128, 73]],
  },
  // L1 - leisure loop: town square -> interim park -> community
  {
    floorId: "L1",
    color: "#4CAF50",
    points: [[128, 73], [91, 84], [84, 57], [128, 73]],
  },
  // L2 - library / arts loop
  {
    floorId: "L2",
    color: "#9C27B0",
    points: [[128, 73], [145, 79], [134, 97], [114, 95], [128, 73]],
  },
  // L2 - housing / civic loop
  {
    floorId: "L2",
    color: "#E91E63",
    points: [[128, 73], [128, 37], [131, 38], [95, 37], [128, 73]],
  },
];
