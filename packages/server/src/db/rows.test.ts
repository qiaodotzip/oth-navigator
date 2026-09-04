import { describe, expect, it } from "vitest";
import { stripAuditFields, toModelRow } from "./rows";

describe("toModelRow", () => {
  it("converts Date columns to ISO strings", () => {
    const at = new Date("2026-09-04T12:00:00.000Z");
    expect(toModelRow({ updatedAt: at }).updatedAt).toBe("2026-09-04T12:00:00.000Z");
  });

  it("drops null optionals so the model's defaults apply", () => {
    expect("hours" in toModelRow({ hours: null })).toBe(false);
    expect("updatedBy" in toModelRow({ updatedBy: null })).toBe(false);
  });

  it("keeps a null deletedAt, where null means 'not deleted'", () => {
    expect(toModelRow({ deletedAt: null })).toEqual({ deletedAt: null });
  });

  it("leaves ordinary values alone, including false and zero", () => {
    expect(toModelRow({ walkable: false, version: 0, nameEn: "" }))
      .toEqual({ walkable: false, version: 0, nameEn: "" });
  });
});

describe("stripAuditFields", () => {
  it("removes the repository-owned columns", () => {
    expect(stripAuditFields({ id: "a", version: 3, updatedBy: "u", updatedAt: "x", deletedAt: null }))
      .toEqual({ id: "a" });
  });
});
