import type { TimeOfDay } from "@/store";

export type TimePreset = {
  bg: string;
  fog: [number, number]; // near, far
  ambient: { color: string; intensity: number };
  dir: { color: string; intensity: number; pos: [number, number, number] };
  hemi: { sky: string; ground: string; intensity: number };
  groundColor: string;
};

export const TIME_PRESETS: Record<TimeOfDay, TimePreset> = {
  morning: {
    bg: "#F4F8FC",
    fog: [180, 420],
    ambient: { color: "#ffffff", intensity: 0.8 },
    dir: { color: "#fff3df", intensity: 1.15, pos: [120, 210, 90] },
    hemi: { sky: "#e4f0ff", ground: "#d7d2c6", intensity: 0.55 },
    groundColor: "#FAFBFC",
  },
  evening: {
    bg: "#F6DCC0",
    fog: [160, 380],
    ambient: { color: "#ffd9a8", intensity: 0.6 },
    dir: { color: "#ff974d", intensity: 1.25, pos: [-190, 95, 60] },
    hemi: { sky: "#ffce95", ground: "#7d6448", intensity: 0.45 },
    groundColor: "#F0E2D2",
  },
  night: {
    bg: "#0E1426",
    fog: [150, 360],
    ambient: { color: "#7184c0", intensity: 0.4 },
    dir: { color: "#aebee8", intensity: 0.5, pos: [70, 170, -130] },
    hemi: { sky: "#2a3556", ground: "#0a1020", intensity: 0.55 },
    groundColor: "#3A4560",
  },
};
