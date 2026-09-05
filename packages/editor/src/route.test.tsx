import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { navigate, useRoute } from "./route";

function Probe() {
  return <span data-testid="route">{useRoute()}</span>;
}

beforeEach(() => {
  window.history.pushState({}, "", "/");
});

describe("routing", () => {
  it("reads the current path", () => {
    render(<Probe />);
    expect(screen.getByTestId("route").textContent).toBe("/");
  });

  it("changes path without reloading", () => {
    render(<Probe />);
    act(() => navigate("/survey"));
    expect(screen.getByTestId("route").textContent).toBe("/survey");
  });

  it("follows the browser's back button", () => {
    render(<Probe />);
    act(() => navigate("/survey"));
    act(() => {
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByTestId("route").textContent).toBe("/");
  });

  it("stops listening once unmounted", () => {
    const { unmount } = render(<Probe />);
    unmount();
    // Would throw on a render of an unmounted tree if the listener leaked.
    expect(() => act(() => navigate("/survey"))).not.toThrow();
  });
});
