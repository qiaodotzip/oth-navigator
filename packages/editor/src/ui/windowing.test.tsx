import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useScrollWindow, type Axis } from "./windowing";

const FALLBACK = { width: 300, height: 150 };

/** Exposes the hook's state through the DOM, so a test can read it back. */
function Probe({ axis }: { axis: Axis }) {
  const { ref, size, offset, onScroll, scrollTo } = useScrollWindow({ axis, fallback: FALLBACK });
  return (
    <>
      <div data-testid="box" ref={ref} onScroll={onScroll} />
      <output data-testid="size">{`${size.width}x${size.height}`}</output>
      <output data-testid="offset">{offset}</output>
      <button type="button" onClick={() => scrollTo(500)}>Scroll to 500</button>
    </>
  );
}

describe("useScrollWindow", () => {
  it("reports the fallback size until the box is measured — always, in jsdom", () => {
    render(<Probe axis="x" />);
    expect(screen.getByTestId("size").textContent).toBe("300x150");
  });

  it("tracks scrollLeft on the x axis", () => {
    render(<Probe axis="x" />);
    const box = screen.getByTestId("box");
    Object.defineProperty(box, "scrollLeft", { value: 120, configurable: true, writable: true });
    fireEvent.scroll(box);
    expect(screen.getByTestId("offset").textContent).toBe("120");
  });

  it("tracks scrollTop on the y axis, not scrollLeft", () => {
    render(<Probe axis="y" />);
    const box = screen.getByTestId("box");
    // A decoy on the axis this probe should ignore, so the test would catch
    // the two axes being swapped.
    Object.defineProperty(box, "scrollLeft", { value: 999, configurable: true, writable: true });
    Object.defineProperty(box, "scrollTop", { value: 80, configurable: true, writable: true });
    fireEvent.scroll(box);
    expect(screen.getByTestId("offset").textContent).toBe("80");
  });

  it("scrolling to an offset updates it immediately, without waiting for a scroll event", () => {
    render(<Probe axis="x" />);
    fireEvent.click(screen.getByText("Scroll to 500"));
    expect(screen.getByTestId("offset").textContent).toBe("500");
  });
});
