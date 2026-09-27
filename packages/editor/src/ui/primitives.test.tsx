import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Avatar, avatarColor, initials } from "./Avatar";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { Progress } from "./Progress";

describe("initials", () => {
  it("takes the first and last word's letters", () => {
    expect(initials("Wei Kang Tan")).toBe("WT");
  });
  it("takes two letters of a single name", () => {
    expect(initials("aisha")).toBe("AI");
  });
  it("never renders blank", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("Avatar", () => {
  it("names the person for assistive tech", () => {
    render(<Avatar userId="user_1" name="Wei Kang" />);
    expect(screen.getByRole("img", { name: "Wei Kang" }).textContent).toBe("WK");
  });
  it("gives the same person the same colour every time", () => {
    expect(avatarColor("user_1")).toBe(avatarColor("user_1"));
  });
});

describe("Button", () => {
  it("is a plain button unless told otherwise, so it never submits a form by accident", () => {
    render(<form><Button>Go</Button></form>);
    expect(screen.getByRole("button", { name: "Go" }).getAttribute("type")).toBe("button");
  });
});

describe("Chip", () => {
  it("reports whether it is on, and its count", () => {
    const onClick = vi.fn();
    render(<Chip selected count={214} onClick={onClick}>Untagged</Chip>);
    const chip = screen.getByRole("button", { name: /untagged/i });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.textContent).toContain("214");
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Progress", () => {
  it("exposes its numbers, clamped to the maximum", () => {
    render(<Progress value={9} max={6} label="Build progress" />);
    const bar = screen.getByRole("progressbar", { name: "Build progress" });
    expect(bar.getAttribute("aria-valuenow")).toBe("6");
    expect(bar.getAttribute("aria-valuemax")).toBe("6");
  });
  it("is empty rather than broken when there is nothing to count", () => {
    render(<Progress value={0} max={0} label="Survey progress" />);
    const fill = screen.getByRole("progressbar").firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });
});
