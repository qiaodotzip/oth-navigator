import { describe, expect, it } from "vitest";
import { BUILD_KEYS, buildKeyAction, type KeyInput } from "./keys";

const press = (key: string, more: Omit<KeyInput, "key"> = {}) => buildKeyAction({ key, ...more });

describe("buildKeyAction", () => {
  it.each([
    ["v", "select"],
    ["a", "draw-area"],
    ["r", "draw-room"],
    ["p", "draw-pathway"],
    ["e", "place-entrance"],
    ["l", "place-portal"],
  ] as const)("%s picks %s", (key, tool) => {
    expect(press(key)).toEqual({ kind: "tool", tool });
  });

  it("reads a letter the same with Shift or Caps Lock", () => {
    expect(press("R")).toEqual({ kind: "tool", tool: "draw-room" });
  });

  it("fits on F", () => {
    expect(press("f")).toEqual({ kind: "fit" });
  });

  it("deletes on Delete, and on Backspace, since a Mac laptop has no Delete key", () => {
    expect(press("Delete")).toEqual({ kind: "delete" });
    expect(press("Backspace")).toEqual({ kind: "delete" });
  });

  it("leaves Delete and Backspace to a shape being drawn", () => {
    expect(press("Backspace", { drafting: true })).toBeNull();
    expect(press("Delete", { drafting: true })).toBeNull();
  });

  it("cancels on Escape", () => {
    expect(press("Escape")).toEqual({ kind: "cancel" });
  });

  it("leaves shortcuts with Ctrl, Cmd or Alt to the browser", () => {
    expect(press("r", { ctrlKey: true })).toBeNull();
    expect(press("l", { metaKey: true })).toBeNull();
    expect(press("p", { altKey: true })).toBeNull();
  });

  it("ignores every key typed into a field, Escape and Delete included", () => {
    for (const tag of ["input", "textarea", "select"]) {
      const field = document.createElement(tag);
      expect(press("r", { target: field })).toBeNull();
      expect(press("Escape", { target: field })).toBeNull();
      expect(press("Delete", { target: field })).toBeNull();
    }
  });

  it("still works from a focused button, which takes no text", () => {
    expect(press("r", { target: document.createElement("button") })).toEqual({ kind: "tool", tool: "draw-room" });
  });

  it("has nothing for keys it does not know — Space included, which the canvas pans on", () => {
    expect(press(" ")).toBeNull();
    expect(press("x")).toBeNull();
    expect(press("Enter")).toBeNull();
  });

  it("maps exactly spec §11's keys", () => {
    expect(Object.keys(BUILD_KEYS).sort()).toEqual(["a", "delete", "e", "escape", "f", "l", "p", "r", "v"]);
  });
});
