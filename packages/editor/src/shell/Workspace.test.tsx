import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { Workspace } from "./Workspace";

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
  localStorage.clear();
  useEditorStore.getState().setUser({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" });
});

function at(path: string) {
  window.history.pushState({}, "", path);
  render(<Workspace api={fakeApi()} />);
}

describe("Workspace", () => {
  it("sends the root to the floors home", async () => {
    at("/");
    await waitFor(() => expect(window.location.pathname).toBe("/floors"));
    expect(await screen.findByRole("heading", { name: "Floors" })).toBeTruthy();
  });

  it("sends an old survey link to your floor's survey", async () => {
    at("/survey");
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L1/survey"));
  });

  it("chooses a tab for a floor opened without one, and replaces the address", async () => {
    at("/floors/L1");
    // L1 has footage, so Survey.
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L1/survey"));
  });

  it("takes a floor that does not exist back to the floors home, and says so", async () => {
    at("/floors/L9/build");
    await waitFor(() => expect(window.location.pathname).toBe("/floors"));
    expect(useToasts.getState().toasts.some(t => /no floor L9/i.test(t.message))).toBe(true);
  });

  it("remembers the last tab and floor you used", async () => {
    at("/floors/L2/review");
    await waitFor(() => expect(localStorage.getItem("oth.lastTab.L2")).toBe("review"));
    expect(localStorage.getItem("oth.lastFloor")).toBe("L2");
  });

  it("shows the team page", async () => {
    at("/team");
    expect(await screen.findByRole("heading", { name: "Team" })).toBeTruthy();
  });
});
