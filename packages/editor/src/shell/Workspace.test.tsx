import { parseModel } from "@oth/model";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "../auth/AuthGate";
import { fakeSetupApi } from "../setup/testing";
import { useSetupStore } from "../setup/sync";
import { useEditorStore } from "../state/store";
import { fakeApi, sampleModel } from "../testing/fakeApi";
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

  // I1: an expired session must not blank a floor's tab behind the sign-in
  // dialog. BuildWorkspace.test.tsx and the test below pin the same rule for Build.
  it("keeps a floor's tab on screen through an expired session", async () => {
    const api = fakeApi();
    window.history.pushState({}, "", "/floors/L1/survey");
    render(
      <AuthGate api={api}>
        <Workspace api={api} />
      </AuthGate>,
    );
    expect(await screen.findByText(/Frame 2 of 2/)).toBeTruthy();

    act(() => useEditorStore.getState().endSession("expired"));

    expect(screen.getByText(/Frame 2 of 2/)).toBeTruthy();
    expect(screen.getByRole("dialog", { name: /session ended/i })).toBeTruthy();
  });

  it("shows the new Survey on the Survey tab", async () => {
    at("/floors/L1/survey");
    // sampleModel: two frames on L1, the first carrying a proposal, so it opens on the second.
    expect(await screen.findByText(/Frame 2 of 2/)).toBeTruthy();
    expect(screen.getByRole("group", { name: "Show frames" })).toBeTruthy();
  });

  it("opens the frame the address names, so a frame is a link", async () => {
    // The route's parameters reach the workspace: without them it opens on frame 2.
    at("/floors/L1/survey?frame=kf_1");
    expect(await screen.findByText(/Frame 1 of 2/)).toBeTruthy();
  });

  it("shows one proposal at a time on the Review tab", async () => {
    at("/floors/L1/review");
    expect(await screen.findByDisplayValue("Festive Mall")).toBeTruthy();
    expect(screen.getByText("0 of 1 decided on L1")).toBeTruthy();
  });

  it("loads the model once, whichever of Survey and Review is open", async () => {
    // The old screens each loaded it again, and doubled every error toast.
    const api = fakeApi();
    window.history.pushState({}, "", "/floors/L1/survey");
    render(<Workspace api={api} />);
    await screen.findByText(/Frame 2 of 2/);
    fireEvent.click(screen.getByRole("link", { name: /Review/ }));
    await screen.findByDisplayValue("Festive Mall");
    expect((api as unknown as { getModel: ReturnType<typeof vi.fn> }).getModel).toHaveBeenCalledTimes(1);
  });

  it("opens Build inside the shell, and loads the map only once", async () => {
    const api = fakeApi();
    window.history.pushState({}, "", "/floors/L1/build?step=rooms");
    render(<Workspace api={api} />);
    expect(await screen.findByRole("navigation", { name: "Build steps" })).toBeTruthy();
    // The workspace's own load; the old editor loaded again on top of it.
    expect(api.getModel).toHaveBeenCalledTimes(1);
  });

  it("keeps Build on screen through an expired session", async () => {
    const api = fakeApi();
    window.history.pushState({}, "", "/floors/L1/build?step=rooms");
    render(
      <AuthGate api={api}>
        <Workspace api={api} />
      </AuthGate>,
    );
    expect(await screen.findByRole("navigation", { name: "Build steps" })).toBeTruthy();

    act(() => useEditorStore.getState().endSession("expired"));

    // By text: the dialog hides the page from role queries, not from the screen.
    expect(screen.getByText("Areas & rooms", { selector: "h2" })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: /session ended/i })).toBeTruthy();
  });

  it("shows the Places tab", async () => {
    at("/floors/L1/places");
    // sampleModel: L1's one place is still a proposal.
    expect(await screen.findByRole("heading", { name: "No confirmed places on L1 yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "1 waiting in Review →" })).toBeTruthy();
  });

  it("opens a link to a room on an upper floor with that room selected", async () => {
    // The map loads onto the lowest floor. Were Build shown before this floor
    // is the active one, it would judge the link against L1 and drop it.
    const model = parseModel({
      ...sampleModel,
      rooms: [{ id: "L2-a", levelId: "oth-L2", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3, nameEn: "Upstairs" }],
    });
    const api = fakeApi({ getModel: vi.fn().mockResolvedValue(model) });
    window.history.pushState({}, "", "/floors/L2/build?step=rooms&select=room:L2-a");
    render(<Workspace api={api} />);
    expect(await screen.findByRole("navigation", { name: "Build steps" })).toBeTruthy();

    await waitFor(() => expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L2-a" }));
    expect(new URLSearchParams(window.location.search).get("select")).toBe("room:L2-a");
  });

  it("opens a floor's setup on its first step not done, with the steps in place of the tabs", async () => {
    useSetupStore.getState().reset();
    window.history.pushState({}, "", "/floors/L2/setup");
    render(<Workspace api={fakeSetupApi()} />);
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L2/setup/1"));
    expect(await screen.findByRole("heading", { name: "Add footage" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Setup steps" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Workspace" })).toBeNull();
  });
});
