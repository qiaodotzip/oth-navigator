import { describe, expect, it } from "vitest";
import { modelToThree, threeToModel } from "./coords";

describe("modelToThree", () => {
  it("maps the building origin to the three.js origin at ground level", () => {
    expect(modelToThree(0, 0, 0)).toEqual([0, 0, 0]);
  });

  it("keeps east as +x", () => {
    expect(modelToThree(10, 0, 0)).toEqual([10, 0, 0]);
  });

  it("maps north (+y) to -z, which is into the screen in three.js", () => {
    expect(modelToThree(0, 10, 0)).toEqual([0, 0, -10]);
  });

  it("maps elevation to +y, the three.js up axis", () => {
    expect(modelToThree(0, 0, 6.2)).toEqual([0, 6.2, 0]);
  });

  it("handles a realistic L2 point", () => {
    expect(modelToThree(142.29, 55.07, 6.2)).toEqual([142.29, 6.2, -55.07]);
  });
});

describe("threeToModel", () => {
  it("round-trips modelToThree", () => {
    const [x, y, z] = modelToThree(12.5, -3.25, 4);
    expect(threeToModel(x, y, z)).toEqual({ x: 12.5, y: -3.25, elevation: 4 });
  });

  it("is the inverse for the origin", () => {
    expect(threeToModel(0, 0, 0)).toEqual({ x: 0, y: 0, elevation: 0 });
  });
});
