import { describe, expect, it } from "vitest";
import { bestName, groupLabels, isJunk, kindOf, tidy, type ModelLine } from "./labels";

const line = (text: string, x: number, y: number): ModelLine => ({
  text, x, y, box: { minX: x - 2, minY: y - 0.5, maxX: x + 2, maxY: y + 0.5 },
});

describe("groupLabels", () => {
  it("joins lines printed one under another back into the name they were", () => {
    expect(groupLabels([line("CHANGING", 10, 21.2), line("ROOM", 10, 20)])).toEqual([{ text: "CHANGING ROOM", x: 10, y: 20.6 }]);
  });

  it("keeps the order a name is read in, even when its second line sits right of centre", () => {
    // The script sorted by x first, so this came apart as "ROOM" and "CHANGING".
    expect(groupLabels([line("ROOM", 10.4, 20), line("CHANGING", 10, 21.2)]).map(l => l.text)).toEqual(["CHANGING ROOM"]);
  });

  it("does not join lines two metres or more apart, or far off to the side", () => {
    expect(groupLabels([line("SHOP", 10, 23), line("STORE", 10, 20), line("KIOSK", 14, 22)]).map(l => l.text).sort())
      .toEqual(["KIOSK", "SHOP", "STORE"]);
  });

  it("leaves out the floor levels printed under the names", () => {
    expect(groupLabels([line("TOILET", 10, 21.2), line("FFL +111.50", 10, 20), line("+111.50", 10, 19)]).map(l => l.text))
      .toEqual(["TOILET"]);
  });
});

describe("tidy", () => {
  it("names a space as a person would, as the script did", () => {
    expect(tidy("TOILET (FEMALE) (SSC)")).toBe("Toilet (Female)");
    expect(tidy("SHOP FFL +111.50")).toBe("Shop");
    expect(tidy("AHU ROOM")).toBe("AHU Room");
    expect(tidy("- LOBBY -")).toBe("Lobby");
  });
  it("keeps the letter after an apostrophe small: \"Cleaner's\", where the script wrote \"Cleaner'S\"", () => {
    expect(tidy("CLEANER'S ROOM")).toBe("Cleaner's Room");
  });
});

describe("bestName, kindOf and isJunk", () => {
  it("takes the longest name when several labels flood one space", () => {
    expect(bestName(["SHOP", "SHOP UNIT 12", ""])).toBe("Shop Unit 12");
    expect(bestName(["ROOM", "SHOP"])).toBe("Room");
    // A label that is only a level note names nothing.
    expect(bestName(["FFL +111.50"])).toBeNull();
  });
  it("gives a draft its kind from the script's word lists, and a void its own", () => {
    expect(kindOf("Riser Shaft")).toBe("service");
    expect(kindOf("Main Lobby")).toBe("area");
    expect(kindOf("Shop")).toBe("room");
    expect(kindOf("Void")).toBe("void");
    expect(kindOf("Atrium Void")).toBe("void");
  });
  it("drops what is not a space, but not a void", () => {
    expect(isJunk("Slab Above")).toBe(true);
    expect(isJunk("Void")).toBe(false);
  });
});
