import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import {
  cameraView, fitLabel, labelExtra, labelLiftM, pixelsPerMetreAt, sceneLabelsToShow, shownLabelsKey,
  type RoomLabel, type ShownLabel,
} from "./labelFit";

describe("fitLabel", () => {
  it("shows the whole name where it fits, with room for its ✓", () => {
    expect(fitLabel("Starbucks", labelExtra("confirmed"), 100, 40)).toBe("Starbucks");
  });

  it("cuts a name short to the room's width, with an ellipsis", () => {
    expect(fitLabel("Starbucks", labelExtra("confirmed"), 60, 40)).toBe("Sta…");
  });

  it("does not leave a space before the ellipsis", () => {
    expect(fitLabel("Anchor Books", 0, 75, 40)).toBe("Anchor…");
  });

  it("hides a name when fewer than three letters would fit", () => {
    expect(fitLabel("Starbucks", labelExtra("confirmed"), 40, 40)).toBeNull();
  });

  it("hides a name in a room too shallow for a line of text", () => {
    expect(fitLabel("Starbucks", 0, 500, 10)).toBeNull();
  });

  it("hides a blank name", () => {
    expect(fitLabel("   ", 0, 500, 40)).toBeNull();
  });

  it("counts the word proposed against the width", () => {
    // Eleven characters fit in 100 px: the name alone, but not " proposed" after it.
    expect(fitLabel("Starbucks", labelExtra("drawing"), 100, 40)).toBe("Starbucks");
    expect(fitLabel("Starbucks", labelExtra("proposed"), 100, 40)).toBeNull();
  });
});

describe("pixelsPerMetreAt", () => {
  it("is the viewport's height over the height the view spans at that distance", () => {
    expect(pixelsPerMetreAt(1, 90, 200)).toBeCloseTo(100);
    expect(pixelsPerMetreAt(2, 90, 200)).toBeCloseTo(50);
  });
});

describe("sceneLabelsToShow", () => {
  const star: RoomLabel = { roomId: "L1-shop", name: "Starbucks", tone: "confirmed", at: [0, 0], widthM: 10, heightM: 10, liftM: 3 };
  const from = (height: number) => ({ camera: [0, height, 0] as const, fovDeg: 45, heightPx: 256, elevationM: 0 });

  it("shows a label near the camera whole, at its lift, with north as -z", () => {
    const moved: RoomLabel = { ...star, at: [5, 8] };
    expect(sceneLabelsToShow([moved], { camera: [5, 23, -8], fovDeg: 45, heightPx: 256, elevationM: 0 })).toEqual([
      { roomId: "L1-shop", text: "Starbucks", tone: "confirmed", position: [5, 3, -8] },
    ]);
  });

  it("cuts it short further away, and hides it further still", () => {
    expect(sceneLabelsToShow([star], from(54.5))[0]?.text).toBe("Sta…");
    expect(sceneLabelsToShow([star], from(203))).toEqual([]);
  });

  it("lifts labels by the floor's elevation", () => {
    expect(sceneLabelsToShow([star], { ...from(29), elevationM: 6 })[0]?.position).toEqual([0, 9, 0]);
  });

  it("mounts nothing the camera cannot see", () => {
    expect(sceneLabelsToShow([star], { ...from(23), inView: () => false })).toEqual([]);
  });

  // L1's rooms are 5 m high and its walls stand 1.2 m: a label at the room's
  // top floated over the room behind. Each massing, with the walls low and at
  // full height, as roomLabels hands them over.
  it.each([
    ["an area on its slab", "area", 5, 0.12, 0.12],
    ["a room on its walls, 1.2 m or full height", "room", 5, 1.2, 5],
    ["a service space on its walls, as a room", "service", 4.5, 1.2, 4.5],
    ["a room lower than the walls on its own top", "room", 0.8, 0.8, 0.8],
    ["a solid on its own top", "detail", 2, 2, 2],
    ["a void, which builds nothing, on its floor", "void", 5, 0, 0],
  ] as const)("sits %s", (_, kind, roomHeightM, low, full) => {
    const room = { kind, heightM: roomHeightM };
    const label: RoomLabel = { ...star, liftM: labelLiftM(room, false), fullHeightLiftM: labelLiftM(room, true) };
    const heightOf = (fullHeightWalls: boolean) => sceneLabelsToShow([label], from(29), fullHeightWalls)[0]?.position[1];
    expect(heightOf(false)).toBeCloseTo(low);
    expect(heightOf(true)).toBeCloseTo(full);
  });

  it("keeps a label's one lift under full-height walls when it has no other", () => {
    expect(sceneLabelsToShow([star], from(29), true)[0]?.position).toEqual([0, 3, 0]);
  });
});

describe("shownLabelsKey", () => {
  const shown: ShownLabel = { roomId: "L1-shop", text: "Starbucks", tone: "proposed", position: [5, 3, -8] };

  it("stays the same for the same labels, so a still camera sets no state", () => {
    expect(shownLabelsKey([{ ...shown, position: [5, 3, -8] }])).toBe(shownLabelsKey([shown]));
  });

  it("changes when a place is confirmed, its label moves, or its text is cut", () => {
    const key = shownLabelsKey([shown]);
    expect(shownLabelsKey([{ ...shown, tone: "confirmed" }])).not.toBe(key);
    expect(shownLabelsKey([{ ...shown, position: [6, 3, -8] }])).not.toBe(key);
    expect(shownLabelsKey([{ ...shown, text: "Sta…" }])).not.toBe(key);
  });
});

describe("cameraView", () => {
  // A real camera, placed the way MapScene frames a floor: up and off to one
  // side, looking at the middle. Frustum maths needs no WebGL.
  const camera = () => {
    const c = new PerspectiveCamera(45, 1, 0.1, 1000);
    c.position.set(0, 40, 30);
    c.lookAt(0, 0, 0);
    return c;
  };

  it("reads the camera's position and field of view", () => {
    const view = cameraView(camera(), 256, 6);
    expect(view.camera).toEqual([0, 40, 30]);
    expect(view.fovDeg).toBe(45);
    expect(view.heightPx).toBe(256);
    expect(view.elevationM).toBe(6);
  });

  it("sees what is in front of the camera, and not what is off to the side or behind it", () => {
    const { inView } = cameraView(camera(), 256, 0);
    expect(inView?.([0, 3, 0])).toBe(true);
    expect(inView?.([200, 3, 0])).toBe(false);
    expect(inView?.([0, 80, 60])).toBe(false);
  });

  it("mounts only the labels a real camera can see", () => {
    const near: RoomLabel = { roomId: "L1-near", name: "Starbucks", tone: "confirmed", at: [0, 0], widthM: 10, heightM: 10, liftM: 3 };
    const aside: RoomLabel = { ...near, roomId: "L1-aside", at: [200, 0] };
    expect(sceneLabelsToShow([near, aside], cameraView(camera(), 256, 0)).map(l => l.roomId)).toEqual(["L1-near"]);
  });
});
