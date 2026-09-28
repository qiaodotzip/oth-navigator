import { describe, expect, it } from "vitest";
import { fitLabel, labelExtra, pixelsPerMetreAt, sceneLabelsToShow, type RoomLabel } from "./labelFit";

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

  it("shows a label near the camera whole, at the top of its room, with north as -z", () => {
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
});
