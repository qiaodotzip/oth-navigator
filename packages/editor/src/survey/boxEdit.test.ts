import { describe, expect, it } from "vitest";
import { MIN_SIDE, labelInside, moveBox, resizeBox } from "./boxEdit";

const box = { x: 0.3, y: 0.3, w: 0.2, h: 0.2 };

describe("moveBox", () => {
  it("slides by the drag", () => {
    const out = moveBox(box, 0.1, -0.1);
    expect(out.x).toBeCloseTo(0.4, 6);
    expect(out.y).toBeCloseTo(0.2, 6);
  });

  it("keeps the whole box on the frame rather than clipping it", () => {
    expect(moveBox(box, -1, -1)).toMatchObject({ x: 0, y: 0, w: 0.2, h: 0.2 });
    expect(moveBox(box, 1, 1)).toMatchObject({ x: 0.8, y: 0.8 });
  });
});

describe("resizeBox", () => {
  it("leaves the opposite corner where it is", () => {
    const out = resizeBox(box, "nw", -0.1, -0.1);
    expect(out.x).toBeCloseTo(0.2, 6);
    expect(out.x + out.w).toBeCloseTo(0.5, 6);
  });

  it("grows from the south-east without moving the origin", () => {
    const out = resizeBox(box, "se", 0.1, 0.1);
    expect(out).toMatchObject({ x: 0.3, y: 0.3 });
    expect(out.w).toBeCloseTo(0.3, 6);
  });

  it("flips through the anchor rather than going negative", () => {
    const out = resizeBox(box, "nw", 0.4, 0.4);
    expect(out.w).toBeGreaterThan(0);
    expect(out.h).toBeGreaterThan(0);
  });

  it("never shrinks below something you can grab again", () => {
    // Dragged exactly onto the opposite corner, which is where a box would
    // otherwise collapse to nothing.
    const out = resizeBox(box, "se", -0.2, -0.2);
    expect(out.w).toBe(MIN_SIDE);
    expect(out.h).toBe(MIN_SIDE);
  });

  it("stays on the frame", () => {
    const out = resizeBox(box, "se", 5, 5);
    expect(out.x + out.w).toBeLessThanOrEqual(1);
    expect(out.y + out.h).toBeLessThanOrEqual(1);
  });
});

describe("labelInside", () => {
  it("puts the label inside when the box hugs the top edge", () => {
    // Otherwise the label, and the x that deletes the tag, are off the image.
    expect(labelInside({ x: 0.1, y: 0, w: 0.2, h: 0.2 })).toBe(true);
  });

  it("keeps it above the box everywhere else", () => {
    expect(labelInside(box)).toBe(false);
  });
});
