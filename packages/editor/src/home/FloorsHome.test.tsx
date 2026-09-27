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

  it("says when the map was last published", async () => {
    const api = fakeApi({
      latestPublished: vi.fn().mockResolvedValue({ version: "v12", createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), warningCount: 0 }),
    });
    render(<FloorsHome api={api} saver={fakeSaver()} />);
    expect(await screen.findByText(/last published v12, 3 days ago/)).toBeTruthy();
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
