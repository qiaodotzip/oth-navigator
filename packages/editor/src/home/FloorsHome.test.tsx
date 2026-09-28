import { parseModel } from "@oth/model";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { fakeApi, sampleModel, sampleTeam } from "../testing/fakeApi";
import { FloorsHome } from "./FloorsHome";

function fakeSaver() {
  return { update: vi.fn().mockResolvedValue(true) } as never;
}

beforeEach(() => {
  useEditorStore.getState().reset();
  localStorage.clear();
  useEditorStore.getState().setUser({ id: "u_wei", email: "wei@oth.local", displayName: "Wei Kang" });
  useEditorStore.getState().setModel(sampleModel);
  useEditorStore.getState().setTeam(sampleTeam);
});

describe("FloorsHome", () => {
  it("sends you on to your floor", async () => {
    render(<FloorsHome api={fakeApi()} saver={fakeSaver()} />);
    const go = screen.getByRole("link", { name: /Continue on L2/ });
    // L2 has no footage, so it opens on Build.
    expect(go.getAttribute("href")).toBe("/floors/L2/build");
  });

  it("shows a card per floor, bottom up, marking yours", () => {
    render(<FloorsHome api={fakeApi()} saver={fakeSaver()} />);
    const cards = screen.getAllByRole("article");
    expect(cards.map(c => within(c).getAllByRole("link")[0]!.textContent)).toEqual(["L1", "L2"]);
    expect(within(cards[1]!).getByText("Yours")).toBeTruthy();
    expect(within(cards[0]!).queryByText("Yours")).toBeNull();
  });

  it("says what is next on each floor", () => {
    render(<FloorsHome api={fakeApi()} saver={fakeSaver()} />);
    expect(within(screen.getAllByRole("article")[0]!).getByText("Next: add the floorplan and set its scale")).toBeTruthy();
  });

  it("says how many of a floor's confirmed places are on the map", () => {
    useEditorStore.getState().setModel(parseModel({
      ...sampleModel,
      rooms: [{ id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3 }],
      places: [
        { id: "pl_a", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-a" },
        { id: "pl_b", nameEn: "Anchor Books", category: "retail", levelId: "oth-L1" },
      ],
      sightings: [],
    }));
    render(<FloorsHome api={fakeApi()} saver={fakeSaver()} />);
    const [l1, l2] = screen.getAllByRole("article");
    expect(within(l1!).getByText("1 of 2 confirmed places are on the map")).toBeTruthy();
    expect(within(l2!).queryByText(/confirmed place/)).toBeNull();
  });

  it("says when the map was last published as a date, not as its version id", async () => {
    // Built from local parts, so the calendar day is 4 Sep in whatever time
    // zone the test runs; the page shows the day where the reader is.
    const createdAt = new Date(2026, 8, 4, 17, 7, 35, 19);
    const now = vi.spyOn(Date, "now").mockReturnValue(createdAt.getTime() + 24 * 86_400_000);
    const api = fakeApi({
      latestPublished: vi.fn().mockResolvedValue({ version: "2026-09-04T09-07-35-019Z", createdAt: createdAt.toISOString(), warningCount: 0 }),
    });
    try {
      render(<FloorsHome api={api} saver={fakeSaver()} />);
      const line = await screen.findByText(/last published/);
      expect(line.textContent).toMatch(/ · last published 4 Sep 2026, 24 days ago$/);
    } finally {
      now.mockRestore();
    }
  });

  it("leaves the published clause out on a failed fetch, rather than saying 'not published yet'", async () => {
    // M5: `latest: null` (genuinely never published) and a failed fetch must
    // not render the same way.
    const api = fakeApi({ latestPublished: vi.fn().mockRejectedValue(new Error("offline")) });
    render(<FloorsHome api={api} saver={fakeSaver()} />);
    await waitFor(() => expect(api.latestPublished).toHaveBeenCalled());
    expect(screen.queryByText(/not published yet/)).toBeNull();
    expect(screen.queryByText(/last published/)).toBeNull();
  });

  it("assigns an owner from the card", async () => {
    const saver = fakeSaver() as { update: ReturnType<typeof vi.fn> };
    render(<FloorsHome api={fakeApi()} saver={saver as never} />);
    fireEvent.click(screen.getByRole("button", { name: "Owners of L1" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Wei Kang" }));
    await waitFor(() => expect(saver.update).toHaveBeenCalledWith("level", "oth-L1", 0, { ownerIds: ["u_sc", "u_wei"] }));
  });

  it("shows an owner who left the team as a former teammate, not as nobody", () => {
    useEditorStore.getState().setTeam([sampleTeam[1]!]);
    render(<FloorsHome api={fakeApi()} saver={fakeSaver()} />);
    expect(screen.getAllByRole("img", { name: "Former teammate" }).length).toBeGreaterThan(0);
  });

  // M4: an owner must not flash "Former teammate" before the team has even
  // loaded, and a failed load must not call everyone a former teammate either.
  it("shows a glyph for an owner while the team is still loading", () => {
    useEditorStore.setState({ team: [], teamStatus: "loading" });
    render(<FloorsHome api={fakeApi()} saver={fakeSaver()} />);
    expect(screen.queryByRole("img", { name: "Former teammate" })).toBeNull();
    expect(screen.getAllByRole("img", { name: "Owner – name not loaded" }).length).toBeGreaterThan(0);
  });

  it("shows a glyph, not 'Former teammate', when the team failed to load", () => {
    useEditorStore.setState({ team: [], teamStatus: "error" });
    render(<FloorsHome api={fakeApi()} saver={fakeSaver()} />);
    expect(screen.queryByRole("img", { name: "Former teammate" })).toBeNull();
    expect(screen.getAllByRole("img", { name: "Owner – name not loaded" }).length).toBeGreaterThan(0);
  });

  it("says the team could not load, instead of 'Loading the team…' forever", async () => {
    useEditorStore.setState({ team: [], teamStatus: "error" });
    render(<FloorsHome api={fakeApi()} saver={fakeSaver()} />);
    fireEvent.click(screen.getByRole("button", { name: "Owners of L1" }));
    expect(await screen.findByText(/couldn't load the team/i)).toBeTruthy();
    expect(screen.queryByText(/loading the team/i)).toBeNull();
  });

  it("locks the picker while an owner change is saving, so a quick second tick is not lost", async () => {
    let release!: () => void;
    const update = vi.fn(() => new Promise<boolean>(r => { release = () => r(true); }));
    const saver = { update };
    render(<FloorsHome api={fakeApi()} saver={saver as never} />);
    fireEvent.click(screen.getByRole("button", { name: "Owners of L1" }));

    fireEvent.click(await screen.findByRole("checkbox", { name: "Wei Kang" }));
    expect(update).toHaveBeenCalledTimes(1);

    // While that save is in flight, every checkbox in the picker is locked...
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
    // ...so a quick second tick does not fire off a second save from stale data.
    fireEvent.click(screen.getByRole("checkbox", { name: "Stef Chan" }));
    expect(update).toHaveBeenCalledTimes(1);

    await act(async () => release());

    for (const box of screen.getAllByRole("checkbox")) expect(box).not.toBeDisabled();
  });
});
