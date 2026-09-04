import { describe, expect, it } from "vitest";
import { round3, stableStringify } from "./serialise";

describe("round3", () => {
  it("rounds to millimetre precision", () => {
    expect(round3(1.23456)).toBe(1.235);
  });

  it("leaves integers alone", () => {
    expect(round3(42)).toBe(42);
  });

  it("does not produce negative zero", () => {
    expect(Object.is(round3(-0.0001), 0)).toBe(true);
  });
});

describe("stableStringify", () => {
  it("sorts object keys so key insertion order cannot change the bytes", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it("preserves array order, which is meaningful for rings", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("rounds nested floats", () => {
    expect(stableStringify({ p: [1.23456, 2.99999] })).toBe('{"p":[1.235,3]}');
  });

  it("handles null and nested objects", () => {
    expect(stableStringify({ z: null, a: { y: 1, x: 2 } })).toBe('{"a":{"x":2,"y":1},"z":null}');
  });
});
