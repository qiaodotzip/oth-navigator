import { parseModel } from "@oth/model";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Api } from "../api/client";
import { useDrafts } from "../build/drafts";
import { useCurrentRoute } from "../route";
import { useEditorStore } from "../state/store";
import { sampleModel, sampleTeam } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { SetupWizard } from "./SetupWizard";
import { useSetupStore } from "./sync";
import { fakeSetupApi, setupState } from "./testing";
import type { SetupApi } from "./types";

const me = { id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" };

function Hosted({ api }: { api: Api & SetupApi }) {
  const route = useCurrentRoute();
  return route.name === "setup" ? <SetupWizard api={api} route={route} /> : null;
}

function at(path: string, api = fakeSetupApi()) {
  window.history.pushState({}, "", path);
  render(<Hosted api={api} />);
  return api;
}

const bar = () => within(screen.getByRole("region", { name: "Setup controls" }));

beforeEach(() => {
  useSetupStore.getState().reset();
  useDrafts.getState().reset();
  useToasts.getState().clear();
  const s = useEditorStore.getState();
  s.reset();
  s.setUser(me);
  s.setModel(sampleModel);
  s.setTeam(sampleTeam);
});

describe("SetupWizard", () => {
  it("opens on the first step not done, and writes it into the address", async () => {
    // sampleModel: L2 has no footage.
    at("/floors/L2/setup");
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L2/setup/1"));
    expect(await screen.findByRole("heading", { name: "Add footage" })).toBeTruthy();
  });

  it("on a floor with footage, opens on Claude's labels, and stores Add footage done then, once", async () => {
    const api = at("/floors/L1/setup");
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L1/setup/2"));
    await waitFor(() => expect(api.setSetupStep).toHaveBeenCalledWith("oth-L1", "footage", { status: "done" }));
    await act(async () => {});
    expect(api.setSetupStep).toHaveBeenCalledTimes(1);
  });

  it("opens the first step not done for a step that isn't one of the nine", async () => {
    at("/floors/l2/setup/12");
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L2/setup/1"));
  });

  it("moves a step at a time, and warns but never blocks when a step isn't done", async () => {
    at("/floors/L2/setup/1");
    expect(await screen.findByRole("heading", { name: "Add footage" })).toBeTruthy();
    expect(bar().getByRole("status").textContent).toBe("! No footage is filed under L2 yet.");
    expect(bar().getByRole("button", { name: "Back" })).toBeDisabled();
    fireEvent.click(bar().getByRole("button", { name: "Next" }));
    expect(window.location.pathname).toBe("/floors/L2/setup/2");
    fireEvent.click(bar().getByRole("button", { name: "Back" }));
    expect(window.location.pathname).toBe("/floors/L2/setup/1");
    fireEvent.click(bar().getByRole("button", { name: "Leave setup" }));
    expect(window.location.pathname).toBe("/floors");
  });

  it("gives a Claude step its command", async () => {
    at("/floors/L1/setup/5");
    expect((await screen.findByLabelText("Command for Claude Code")).textContent).toBe("/mcp__oth__map_rooms L1");
  });

  it("records who marked a step done, from the setup the server answers with: no second load", async () => {
    let labelDone = false;
    const now = () => setupState({
      footage: { status: "done", finishedAt: "2026-09-28T09:00:00.000Z" },
      ...(labelDone ? { label: { status: "done", finishedBy: "u_sc", finishedVia: null, finishedAt: new Date().toISOString() } } : {}),
    });
    const getSetup = vi.fn(async () => now());
    const setSetupStep = vi.fn(async (_levelId: string, step: string) => {
      if (step === "label") labelDone = true;
      return now();
    });
    at("/floors/L1/setup/2", fakeSetupApi({ getSetup, setSetupStep }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark done" }));
    expect(await bar().findByText("Done by Stef Chan, just now")).toBeTruthy();
    expect(setSetupStep).toHaveBeenCalledWith("oth-L1", "label", { status: "done" });
    expect(getSetup).toHaveBeenCalledTimes(1);
  });

  it("reloads the map on arriving at each step, without validating it", async () => {
    const api = at("/floors/L2/setup/1");
    await waitFor(() => expect(api.getModel).toHaveBeenCalledTimes(1));
    fireEvent.click(bar().getByRole("button", { name: "Next" }));
    await waitFor(() => expect(api.getModel).toHaveBeenCalledTimes(2));
    expect(api.validate).not.toHaveBeenCalled();
  });

  it("asks for the cheap setup again as Review's decisions reload the map, so its tick follows them", async () => {
    const api = at("/floors/L1/setup/3");
    await waitFor(() => expect(api.getSetup).toHaveBeenCalledWith("oth-L1"));
    await act(async () => {});
    act(() => useEditorStore.getState().setModel(parseModel({ ...sampleModel, places: [], sightings: [] })));
    await waitFor(() => expect(api.getSetup).toHaveBeenCalledWith("oth-L1", { light: true }));
  });

  it("puts the focus on where you are as the step changes", async () => {
    at("/floors/L2/setup/1");
    expect(await screen.findByRole("heading", { name: "Add footage" })).toBeTruthy();
    fireEvent.click(bar().getByRole("button", { name: "Next" }));
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Step 2 of 9: Label the survey"));
  });

  it("keeps the bar's warning in one live region whose words change", async () => {
    // L1's footage is filed, so step 1 has nothing to warn of; step 2 has.
    at("/floors/L1/setup/1");
    expect(await screen.findByRole("heading", { name: "Add footage" })).toBeTruthy();
    const line = bar().getByRole("status");
    expect(line.textContent).toBe("");
    fireEvent.click(bar().getByRole("button", { name: "Next" }));
    await waitFor(() => expect(line.textContent).toBe("! Claude hasn't finished labelling yet."));
    expect(bar().getByRole("status")).toBe(line);
  });

  it("tries the footage stamp again at the next step when it failed", async () => {
    const setSetupStep = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(setupState({ footage: { status: "done", finishedAt: "2026-09-28T09:00:00.000Z" } }));
    at("/floors/L1/setup/2", fakeSetupApi({ setSetupStep }));
    await waitFor(() => expect(setSetupStep).toHaveBeenCalledTimes(1));
    fireEvent.click(bar().getByRole("button", { name: "Next" }));
    await waitFor(() => expect(setSetupStep).toHaveBeenCalledTimes(2));
    expect(setSetupStep).toHaveBeenLastCalledWith("oth-L1", "footage", { status: "done" });
  });

  it("gives Check one main button, Looks right: Next is plain there", async () => {
    at("/floors/L1/setup/7");
    expect(bar().getByRole("button", { name: "Next" }).className).toContain("bg-accent");
    fireEvent.click(bar().getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("button", { name: "Looks right" })).toBeTruthy();
    expect(bar().getByRole("button", { name: "Next" }).className).not.toContain("bg-accent");
  });

  it("says a floor is set up at Finish only once every step is done or skipped", async () => {
    at("/floors/L1/setup/9");
    expect(await screen.findByRole("heading", { name: "Finish" })).toBeTruthy();
    expect(screen.queryByText(/L1 is set up\./)).toBeNull();
    expect(screen.getByText(/Steps 2, 3, 4, 5, 6, 7 and 8 aren't done yet\./)).toBeTruthy();
  });

  it("shows the floor's Review queue at step 3, and Skip skips it", async () => {
    const api = at("/floors/L1/setup/3");
    expect(await screen.findByDisplayValue("Festive Mall")).toBeTruthy();
    fireEvent.click(bar().getByRole("button", { name: "Skip" }));
    await waitFor(() => expect(api.setSetupStep).toHaveBeenCalledWith("oth-L1", "review", { status: "skipped" }));
  });

  it("lets go of the map's selection on a Claude step, and keeps Show's on Check", async () => {
    const withRoom = parseModel({
      ...sampleModel,
      rooms: [{ id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 4 }],
    });
    useEditorStore.getState().setModel(withRoom);
    const api = fakeSetupApi({ getModel: vi.fn().mockResolvedValue(withRoom) });
    at("/floors/L1/setup/8", api);
    expect(await screen.findByRole("button", { name: "Looks right" })).toBeTruthy();
    act(() => useEditorStore.getState().select({ type: "room", id: "L1-a" }));
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-a" });
    fireEvent.click(bar().getByRole("button", { name: "Back" }));
    expect(await screen.findByLabelText("Command for Claude Code")).toBeTruthy();
    act(() => useEditorStore.getState().select({ type: "room", id: "L1-a" }));
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it("goes on to Finish once Claude's work looks right", async () => {
    const api = at("/floors/L1/setup/8");
    fireEvent.click(await screen.findByRole("button", { name: "Looks right" }));
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L1/setup/9"));
    expect(api.setSetupStep).toHaveBeenCalledWith("oth-L1", "check", { status: "done" });
  });

  it("hands the floor to Build at Finish", async () => {
    const api = at("/floors/L1/setup/9");
    fireEvent.click(await screen.findByRole("button", { name: "Finish setup and open Build" }));
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L1/build"));
    expect(api.setSetupStep).toHaveBeenCalledWith("oth-L1", "finish", { status: "done" });
  });

  it("stays on the step and says so when it can't be stored", async () => {
    at("/floors/L1/setup/8", fakeSetupApi({ setSetupStep: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) }));
    fireEvent.click(await screen.findByRole("button", { name: "Looks right" }));
    await waitFor(() => expect(useToasts.getState().toasts.at(-1)?.message)
      .toBe("Couldn't mark the step done. Check your connection, then retry."));
    expect(window.location.pathname).toBe("/floors/L1/setup/8");
  });

  it("still opens a step when the floor's setup can't be loaded", async () => {
    at("/floors/L2/setup", fakeSetupApi({ getSetup: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) }));
    await waitFor(() => expect(window.location.pathname).toBe("/floors/L2/setup/1"));
    expect(await screen.findByRole("heading", { name: "Add footage" })).toBeTruthy();
  });

  it("sends a floor that doesn't exist to the floors, and says so", async () => {
    at("/floors/L9/setup");
    await waitFor(() => expect(window.location.pathname).toBe("/floors"));
    expect(useToasts.getState().toasts.some(t => t.message === "There is no floor L9. Pick one from the floors.")).toBe(true);
  });
});
