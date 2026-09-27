import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ignoreKey, useKeys } from "./keys";

function element(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host.firstElementChild!;
}

const press = (target: EventTarget | null, key = "a", extra: Partial<KeyboardEvent> = {}) => ({
  key, target, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, ...extra,
});

describe("ignoreKey", () => {
  it("leaves a key typed into a search field or a select to it", () => {
    expect(ignoreKey(press(element(`<input type="search">`), "n"))).toBe(true);
    expect(ignoreKey(press(element(`<select><option>a</option></select>`), "a"))).toBe(true);
  });

  it("leaves a plain key on the page to the workspace", () => {
    expect(ignoreKey(press(document.body))).toBe(false);
  });

  it("leaves a key typed into a field to the field", () => {
    expect(ignoreKey(press(element(`<input>`), "n"))).toBe(true);
  });

  it("never takes a key held with Ctrl, Cmd or Alt, which belong to the browser", () => {
    expect(ignoreKey(press(document.body, "r", { ctrlKey: true }))).toBe(true);
    expect(ignoreKey(press(document.body, "r", { metaKey: true }))).toBe(true);
    expect(ignoreKey(press(document.body, "r", { altKey: true }))).toBe(true);
  });

  it("does nothing behind a dialog or an open popover", () => {
    expect(ignoreKey(press(element(`<div role="dialog"><button>Close</button></div>`).firstElementChild))).toBe(true);
  });

  it("leaves Enter and Space on a button to press that button", () => {
    expect(ignoreKey(press(element(`<button>Go</button>`), "Enter"))).toBe(true);
    expect(ignoreKey(press(element(`<button>Go</button>`), " "))).toBe(true);
    expect(ignoreKey(press(element(`<button>Go</button>`), "a"))).toBe(false);
  });

  it("leaves a key something else already handled", () => {
    expect(ignoreKey(press(document.body, "a", { defaultPrevented: true }))).toBe(true);
  });
});

function Probe({ onKey }: { onKey: (key: string) => void }) {
  useKeys(event => onKey(event.key));
  return <input aria-label="Name" />;
}

describe("useKeys", () => {
  it("hears a key pressed on the page, and not one typed into a field", () => {
    const onKey = vi.fn();
    render(<Probe onKey={onKey} />);
    fireEvent.keyDown(document.body, { key: "n" });
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "n" });
    expect(onKey.mock.calls).toEqual([["n"]]);
  });
});
