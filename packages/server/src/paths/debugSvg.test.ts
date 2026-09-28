import { describe, expect, it } from "vitest";
import { suggestionSvg } from "./debugSvg";
import { suggestPaths } from "./suggest";
import { doorway, floor, LEVEL, rect } from "./testing";

const count = (svg: string, tag: string) => (svg.match(new RegExp(`<${tag} `, "g")) ?? []).length;

describe("suggestionSvg", () => {
  it("draws each room, each line as a band and a centre line, each link, and a ring at each unconnected target", () => {
    const model = floor([{ footprint: rect(0, 0, 20, 4) }, { footprint: rect(30, 0, 34, 4), kind: "room", walkable: false }], {
      doorways: [doorway("door-1", [[9, 4], [11, 4]]), doorway("door-far", [[10, 50], [12, 50]])],
    });
    const svg = suggestionSvg(model, LEVEL, suggestPaths(model, LEVEL));
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toMatch(/Lines: 1\. Links: 1\. Unconnected: 1\./);
    expect(count(svg, "path")).toBe(2);
    expect(count(svg, "polyline")).toBe(3);
    expect(count(svg, "circle")).toBe(1);
  });

  it("puts north at the top", () => {
    const model = floor([{ footprint: rect(0, 0, 20, 4) }], { doorways: [doorway("door-far", [[10, 50], [12, 50]])] });
    const svg = suggestionSvg(model, LEVEL, suggestPaths(model, LEVEL));
    const ringY = Number(/<circle cx="[\d.]+" cy="([\d.]+)"/.exec(svg)![1]);
    const lineY = Number(/<polyline points="[\d.]+,([\d.]+)/.exec(svg)![1]);
    expect(ringY).toBeLessThan(lineY);
  });

  it("says so when there is nothing on the floor", () => {
    expect(suggestionSvg(floor([]), LEVEL, { lines: [], links: [], unconnected: [], entranceGuesses: [] })).toMatch(/Nothing on this floor\./);
  });
});
