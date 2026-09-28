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

  it("records who marked a step done", async () => {
    let labelDone = false;
    const getSetup = vi.fn(async () => setupState(labelDone
      ? { label: { status: "done", finishedBy: "u_sc", finishedVia: null, finishedAt: new Date().toISOString() } }
      : {}));
    const setSetupStep = vi.fn(async (_levelId: string, step: string) => {
      if (step === "label") labelDone = true;
      return {};
    });
    at("/floors/L1/setup/2", fakeSetupApi({ getSetup, setSetupStep }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark done" }));
    expect(await bar().findByText("Done by Stef Chan, just now")).toBeTruthy();
    expect(setSetupStep).toHaveBeenCalledWith("oth-L1", "label", { status: "done" });
  });

  it("shows the floor's Review queue at step 3, and Skip skips it", async () => {
    const api = at("/floors/L1/setup/3");
    expect(await screen.findByDisplayValue("Festive Mall")).toBeTruthy();
    fireEvent.click(bar().getByRole("button", { name: "Skip" }));
    await waitFor(() => expect(api.setSetupStep).toHaveBeenCalledWith("oth-L1", "review", { status: "skipped" }));
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
