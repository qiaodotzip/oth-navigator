import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PreviewPanel, PreviewToggle, usePreview, usePreviewOptions } from "./PreviewToggle";

function Harness() {
  const [on, toggle] = usePreview();
  return (
    <>
      <PreviewToggle on={on} onToggle={toggle} />
      {on && <PreviewPanel><p>scene</p></PreviewPanel>}
    </>
  );
}

beforeEach(() => localStorage.clear());

describe("the 3D toggle", () => {
  it("is off until asked for", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "3D" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("region", { name: "3D preview" })).toBeNull();
  });

  it("floats the preview when switched on, and hides it again", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    expect(screen.getByRole("region", { name: "3D preview" }).textContent).toBe("scene");
    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    expect(screen.queryByRole("region", { name: "3D preview" })).toBeNull();
  });

  it("remembers the choice in this browser", () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    expect(localStorage.getItem("oth.build.preview")).toBe("on");
    unmount();
    render(<Harness />);
    expect(screen.getByRole("button", { name: "3D" }).getAttribute("aria-pressed")).toBe("true");
  });
});

function OptionsHarness() {
  const [options, setOptions] = usePreviewOptions();
  return <PreviewPanel options={options} onOptions={setOptions}><p>scene</p></PreviewPanel>;
}

describe("the preview's options", () => {
  it("keeps walls low until you ask for full height, and remembers it", () => {
    const { unmount } = render(<OptionsHarness />);
    const walls = screen.getByRole("button", { name: "Full-height walls" });
    expect(walls.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(walls);
    expect(walls.getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("oth.build.preview.walls")).toBe("full");
    unmount();
    render(<OptionsHarness />);
    expect(screen.getByRole("button", { name: "Full-height walls" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("makes the panel larger, and remembers it", () => {
    render(<OptionsHarness />);
    const panel = screen.getByRole("region", { name: "3D preview" });
    expect(panel.getAttribute("data-size")).toBe("small");
    fireEvent.click(screen.getByRole("button", { name: "Larger" }));
    expect(panel.getAttribute("data-size")).toBe("large");
    expect(localStorage.getItem("oth.build.preview.size")).toBe("large");
  });
});
