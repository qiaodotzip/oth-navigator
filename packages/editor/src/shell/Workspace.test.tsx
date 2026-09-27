import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthGate } from "../auth/AuthGate";
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

  // I1: an expired session must not blank a floor's embedded tab behind the
  // sign-in dialog. Survey is a real tab that is cheap to render in jsdom;
  // App.test.tsx pins the same rule for Build, which needs WebGL to render
  // for real.
  it("keeps a floor's tab on screen through an expired session", async () => {
    const api = fakeApi();
    window.history.pushState({}, "", "/floors/L1/survey");
    render(
      <AuthGate api={api}>
        <Workspace api={api} />
      </AuthGate>,
    );
    expect(await screen.findByText("L1 walk.mp4")).toBeTruthy();

    act(() => useEditorStore.getState().endSession("expired"));

    expect(screen.getByText("L1 walk.mp4")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: /session ended/i })).toBeTruthy();
  });
});
