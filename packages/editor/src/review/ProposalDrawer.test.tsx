import { PlaceSchema, SightingSchema } from "@oth/model";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProposedPlace } from "../survey/review";
import { ProposalDrawer } from "./ProposalDrawer";

const entry = (id: string, nameEn: string, frames: number): ProposedPlace => ({
  place: PlaceSchema.parse({ id, nameEn, category: "retail", status: "proposed" }),
  sightings: Array.from({ length: frames }, (_, i) =>
    SightingSchema.parse({ id: `${id}_s${i}`, placeId: id, keyframeId: `kf_${i}`, status: "proposed" })),
});
const queue = [entry("p1", "Festive Mall", 3), entry("p2", "Gate 1", 1), entry("p3", "Gate 2", 1)];

function setup(currentId = "p1", decided: ReadonlySet<string> = new Set()) {
  const onJump = vi.fn();
  const onAcceptMany = vi.fn(async () => {});
  const onClose = vi.fn();
  const drawerWith = (d: ReadonlySet<string>) => (
    <ProposalDrawer
      queue={queue} decided={d} currentId={currentId} onJump={onJump} onAcceptMany={onAcceptMany} onClose={onClose}
    />
  );
  const { rerender } = render(drawerWith(decided));
  return {
    onJump, onAcceptMany, onClose,
    decide: (d: ReadonlySet<string>) => rerender(drawerWith(d)),
    drawer: within(screen.getByRole("complementary", { name: "Proposals" })),
  };
}

describe("ProposalDrawer", () => {
  it("lists the floor's proposals with how often each was seen, the current one marked", () => {
    const { drawer } = setup();
    expect(drawer.getByRole("heading", { name: "Proposals (3)" })).toBeTruthy();
    expect(drawer.getByRole("button", { name: /^Festive Mall/ }).getAttribute("aria-current")).toBe("true");
    expect(drawer.getByText("3 frames · retail")).toBeTruthy();
  });

  it("jumps to a proposal", () => {
    const { drawer, onJump } = setup();
    fireEvent.click(drawer.getByRole("button", { name: /^Gate 1/ }));
    expect(onJump).toHaveBeenCalledWith("p2");
  });

  it("narrows the list to names that match", () => {
    const { drawer } = setup();
    fireEvent.change(drawer.getByLabelText("Filter proposals"), { target: { value: "gate" } });
    expect(drawer.queryByRole("button", { name: /^Festive Mall/ })).toBeNull();
    expect(drawer.getByRole("button", { name: /^Gate 2/ })).toBeTruthy();
  });

  it("accepts the ticked ones together", async () => {
    const { drawer, onAcceptMany } = setup();
    fireEvent.click(drawer.getByLabelText("Tick Gate 1"));
    fireEvent.click(drawer.getByLabelText("Tick Gate 2"));
    await act(async () => { fireEvent.click(drawer.getByRole("button", { name: "Accept 2 ticked" })); });
    expect(onAcceptMany).toHaveBeenCalledWith([queue[1], queue[2]]);
    expect(drawer.getByRole("button", { name: "Accept 0 ticked" })).toHaveProperty("disabled", true);
  });

  it("ticks everything the filter shows, and only that", () => {
    const { drawer } = setup();
    fireEvent.change(drawer.getByLabelText("Filter proposals"), { target: { value: "gate" } });
    fireEvent.click(drawer.getByLabelText("Tick all shown"));
    fireEvent.change(drawer.getByLabelText("Filter proposals"), { target: { value: "" } });
    expect((drawer.getByLabelText("Tick Festive Mall") as HTMLInputElement).checked).toBe(false);
    expect((drawer.getByLabelText("Tick Gate 1") as HTMLInputElement).checked).toBe(true);
    expect(drawer.getByRole("button", { name: "Accept 2 ticked" })).toBeTruthy();
  });

  it("closes", () => {
    const { drawer, onClose } = setup();
    fireEvent.click(drawer.getByRole("button", { name: "Close the list" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("leaves out what is decided, or being decided, and a tick on it counts for nothing", async () => {
    // A decision under way is as good as made: listing it would offer to decide it twice.
    const { drawer, decide, onAcceptMany } = setup("p1", new Set(["p1"]));
    expect(drawer.getByRole("heading", { name: "Proposals (2)" })).toBeTruthy();
    expect(drawer.queryByLabelText("Tick Festive Mall")).toBeNull();
    fireEvent.click(drawer.getByLabelText("Tick Gate 1"));
    fireEvent.click(drawer.getByLabelText("Tick Gate 2"));
    decide(new Set(["p1", "p2"]));
    await act(async () => { fireEvent.click(drawer.getByRole("button", { name: "Accept 1 ticked" })); });
    expect(onAcceptMany).toHaveBeenCalledWith([queue[2]]);
  });
});
