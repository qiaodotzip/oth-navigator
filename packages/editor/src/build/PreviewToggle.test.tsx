import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PreviewPanel, PreviewToggle, usePreview } from "./PreviewToggle";

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
