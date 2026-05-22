import type { FloorId } from "@/data/types";

export type WanderLoop = {
  floorId: FloorId;
  color: string;
  points: [number, number][];
};

// Tuned roughly to OTH's L1+L2 bounds (~210m x 130m).
// Will be refined once the user's traced floor SVGs are loaded.
export const WANDER_LOOPS: WanderLoop[] = [
  {
    floorId: "L1",
    color: "#F2A33C",
    points: [[20, 20], [60, 20], [60, 60], [20, 60]],
  },
  {
    floorId: "L1",
    color: "#0066B3",
    points: [[100, 30], [160, 30], [160, 90], [100, 90]],
  },
  {
    floorId: "L2",
    color: "#4CAF50",
    points: [[30, 30], [120, 30], [120, 100], [30, 100]],
  },
];
