import { describe, expect, it } from "vitest";
import { isTyping } from "./typing";

describe("isTyping", () => {
  it("is typing in a text field, a text area or a select", () => {
    expect(isTyping(document.createElement("input"))).toBe(true);
    expect(isTyping(document.createElement("textarea"))).toBe(true);
    expect(isTyping(document.createElement("select"))).toBe(true);
  });

  it("is not typing on a checkbox, a slider or a button, which take no text", () => {
    const box = document.createElement("input");
    box.type = "checkbox";
    const slider = document.createElement("input");
    slider.type = "range";
    expect(isTyping(box)).toBe(false);
    expect(isTyping(slider)).toBe(false);
    expect(isTyping(document.createElement("button"))).toBe(false);
  });

  it("is not typing on the page itself", () => {
    expect(isTyping(document.body)).toBe(false);
    expect(isTyping(window)).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
