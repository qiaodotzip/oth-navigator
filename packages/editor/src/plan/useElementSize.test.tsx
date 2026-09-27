import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useElementSize } from "./useElementSize";

type Callback = (entries: { contentRect: { width: number; height: number } }[]) => void;
let observed: Callback | null = null;

class FakeResizeObserver {
  constructor(cb: Callback) { observed = cb; }
  observe() {}
  disconnect() {}
}

function Probe({ mounted = true }: { mounted?: boolean }) {
  const [ref, size] = useElementSize();
  return (
    <>
      <span data-testid="probe">{size ? `${size.width}x${size.height}` : "unmeasured"}</span>
      {mounted && <div ref={ref} />}
    </>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  observed = null;
});

describe("useElementSize", () => {
  it("reports the element's size, and follows it when it changes", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    render(<Probe />);
    act(() => observed?.([{ contentRect: { width: 1200, height: 800 } }]));
    expect(screen.getByTestId("probe").textContent).toBe("1200x800");
    act(() => observed?.([{ contentRect: { width: 900, height: 500 } }]));
    expect(screen.getByTestId("probe").textContent).toBe("900x500");
  });

  it("is unmeasured until the first report, so nothing frames itself at a guessed size", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("unmeasured");
  });

  it("measures an element that mounts after the component did", () => {
    // The editor's canvas box only exists once someone has signed in.
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const { rerender } = render(<Probe mounted={false} />);
    expect(observed).toBeNull();
    rerender(<Probe mounted />);
    act(() => observed?.([{ contentRect: { width: 640, height: 480 } }]));
    expect(screen.getByTestId("probe").textContent).toBe("640x480");
  });

  it("ignores a zero size, which is an element not laid out yet", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    render(<Probe />);
    act(() => observed?.([{ contentRect: { width: 0, height: 0 } }]));
    expect(screen.getByTestId("probe").textContent).toBe("unmeasured");
  });
});
