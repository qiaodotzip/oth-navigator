import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { followLink, href, navigate, parseRoute, setParams, useCurrentRoute, useRoute } from "./route";

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

describe("parseRoute", () => {
  it("reads the floors home", () => {
    expect(parseRoute("/floors")).toEqual({ name: "floors" });
  });

  it("reads a floor tab with its parameters", () => {
    expect(parseRoute("/floors/L1/survey", "?frame=212&view=grid")).toEqual({
      name: "floor", code: "L1", tab: "survey", params: { frame: "212", view: "grid" },
    });
  });

  it("forgives a lowercase floor code typed by hand", () => {
    expect(parseRoute("/floors/l1/build")).toMatchObject({ code: "L1", tab: "build" });
  });

  it("leaves the tab to be chosen when there is none, or it is not a tab", () => {
    expect(parseRoute("/floors/L1")).toMatchObject({ code: "L1", tab: null });
    expect(parseRoute("/floors/L1/bogus")).toMatchObject({ code: "L1", tab: null });
  });

  it("reads the team page, the old survey link and the root", () => {
    expect(parseRoute("/team")).toEqual({ name: "team" });
    expect(parseRoute("/survey")).toEqual({ name: "legacy-survey" });
    expect(parseRoute("/")).toEqual({ name: "home" });
  });

  it("calls anything else not found, rather than guessing", () => {
    expect(parseRoute("/nope/x")).toEqual({ name: "not-found", path: "/nope/x" });
  });

  it("calls a malformed %-escape not found instead of throwing a blank page", () => {
    // M1: decodeURIComponent throws URIError on a broken escape; floor codes
    // never need escaping, so this is always a stray link.
    expect(parseRoute("/floors/%E0%A4%A")).toEqual({ name: "not-found", path: "/floors/%E0%A4%A" });
  });
});

describe("href", () => {
  it("round-trips a floor route", () => {
    const r = parseRoute("/floors/L2/review", "?place=pl_1");
    expect(href(r)).toBe("/floors/L2/review?place=pl_1");
  });

  it("writes parameters in a stable order and drops empty ones", () => {
    expect(href({ name: "floor", code: "L1", tab: "survey", params: { view: "grid", frame: "3", filter: "" } }))
      .toBe("/floors/L1/survey?frame=3&view=grid");
  });

  it("writes a floor with no tab without a trailing slash", () => {
    expect(href({ name: "floor", code: "L1", tab: null, params: {} })).toBe("/floors/L1");
  });
});

function RouteProbe() {
  const r = useCurrentRoute();
  return <span data-testid="current">{JSON.stringify(r)}</span>;
}

describe("useCurrentRoute and friends", () => {
  it("follows navigation, query included", () => {
    render(<RouteProbe />);
    act(() => navigate("/floors/L1/survey?frame=5"));
    expect(JSON.parse(screen.getByTestId("current").textContent!)).toMatchObject({ tab: "survey", params: { frame: "5" } });
  });

  it("replaces rather than pushes when asked, so Back skips a redirect", () => {
    const before = window.history.length;
    act(() => navigate("/floors", { replace: true }));
    expect(window.history.length).toBe(before);
    expect(window.location.pathname).toBe("/floors");
  });

  it("merges parameters into the current address and removes the ones set to null", () => {
    render(<RouteProbe />);
    act(() => navigate("/floors/L1/survey?frame=5&view=grid"));
    act(() => setParams({ frame: "6", view: null }));
    expect(window.location.search).toBe("?frame=6");
    expect(JSON.parse(screen.getByTestId("current").textContent!).params).toEqual({ frame: "6" });
  });

  it("leaves a Ctrl-click to the browser, so it can open a new tab", () => {
    // Called directly: a real Ctrl-click in jsdom would attempt a navigation
    // jsdom does not implement.
    const preventDefault = vi.fn();
    followLink("/team")({ button: 0, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, preventDefault } as never);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(window.location.pathname).not.toBe("/team");
  });

  it("navigates in place on a plain click", () => {
    render(<a href="/team" onClick={followLink("/team")}>Team</a>);
    fireEvent.click(screen.getByText("Team"));
    expect(window.location.pathname).toBe("/team");
  });
});
