import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as progress from "../flow/floorProgress";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi, sampleModel, sampleTeam } from "../testing/fakeApi";
import { Header } from "./Header";

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setUser({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" });
  useEditorStore.getState().setModel(sampleModel);
  useEditorStore.getState().setTeam(sampleTeam);
  window.history.pushState({}, "", "/floors/L1/survey");
});

function renderHeader(path = "/floors/L1/survey") {
  const api = fakeApi();
  const route = path === "/floors"
    ? { name: "floors" as const }
    : { name: "floor" as const, code: path.split("/")[2]!, tab: path.split("/")[3] as "survey", params: {} };
  render(<Header api={api} saver={createSaver(api)} route={route} />);
}

describe("Header", () => {
  it("links home from every screen", () => {
    renderHeader();
    expect(screen.getByRole("link", { name: "OTH Map" }).getAttribute("href")).toBe("/floors");
  });

  it("shows the floor's tabs, the current one marked, with what is waiting in Review", () => {
    renderHeader();
    const tabs = within(screen.getByRole("navigation", { name: "Workspace" }));
    expect(tabs.getByRole("link", { name: "Survey" }).getAttribute("aria-current")).toBe("page");
    expect(tabs.getByRole("link", { name: /Review/ }).textContent).toContain("1");
    expect(tabs.getByRole("link", { name: "Build" }).getAttribute("href")).toBe("/floors/L1/build");
  });

  it("shows Review's waiting count in a pill that is readable at 13 px", () => {
    // Ruling 13: the proposed blue as 13 px text on its soft fill is 3.57:1, under AA.
    renderHeader();
    const tabs = within(screen.getByRole("navigation", { name: "Workspace" }));
    const pill = within(tabs.getByRole("link", { name: /Review/ })).getByText("1");
    const classes = pill.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["bg-proposed-soft", "border", "border-proposed", "text-stone-900"]));
    expect(classes).not.toContain("text-proposed");
  });

  it("marks your own floor in the switcher", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /Floor L1/ }));
    const l1 = await screen.findByRole("link", { name: /^L1/ });
    expect(l1.textContent).toContain("Yours");
    expect(screen.getByRole("link", { name: /^L2/ }).getAttribute("href")).toBe("/floors/L2/survey");
  });

  it("closes the switcher once you pick a floor", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /Floor L1/ }));
    fireEvent.click(await screen.findByRole("link", { name: /^L2/ }));
    expect(window.location.pathname).toBe("/floors/L2/survey");
    await waitFor(() => expect(screen.queryByRole("link", { name: /^L2/ })).toBeNull());
  });

  it("has no floor controls on the floors home", () => {
    renderHeader("/floors");
    expect(screen.queryByRole("navigation", { name: "Workspace" })).toBeNull();
  });

  it("works out floor progress only once the switcher is opened", () => {
    const spy = vi.spyOn(progress, "floorProgress");
    renderHeader();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Floor L1/ }));
    expect(spy).toHaveBeenCalledTimes(2); // once per floor: L1, L2
    spy.mockRestore();
  });

  it("says in the switcher when the team could not be loaded", async () => {
    useEditorStore.getState().setTeamLoadError();
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /Floor L1/ }));
    expect(await screen.findByText(/couldn't load the team/i)).toBeTruthy();
  });
});
