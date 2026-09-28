import { PlaceSchema, SightingSchema, type Box, type Place } from "@oth/model";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FramePanel } from "./FramePanel";
import type { FrameLabel } from "./labelled";

const places = [
  PlaceSchema.parse({ id: "p1", nameEn: "NTUC FairPrice", category: "retail" }),
  PlaceSchema.parse({ id: "p2", nameEn: "Public Library", category: "community" }),
];

const label = (id: string, place: Place, box?: Box): FrameLabel => ({
  sighting: SightingSchema.parse({ id, placeId: place.id, keyframeId: "kf_1", ...(box ? { box } : {}) }),
  place,
});

function setup(labels: readonly FrameLabel[] = [], onFloor: readonly Place[] = places) {
  const onRemove = vi.fn();
  const onPickPlace = vi.fn();
  render(
    <FramePanel
      labels={labels}
      places={onFloor}
      counts={new Map()}
      levelCode="L1"
      placeFilter={null}
      onRemove={onRemove}
      onPickPlace={onPickPlace}
    />,
  );
  return { onRemove, onPickPlace };
}

// Ruling 19: spec §9 moved "Tagged in this frame" (once PlaceTagger's) into
// this panel's "On this frame" list. These four cases carry that coverage
// over — see `git show cfbc63b:packages/editor/src/survey/PlaceTagger.test.tsx`,
// describe("taking a wrong tag off a frame").
describe("On this frame", () => {
  it("removes a whole-frame tag without touching that place elsewhere", () => {
    // Two tags side by side: only the one clicked comes off.
    const { onRemove } = setup([
      label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }),
      label("s2", places[1]!),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Remove tag Public Library from this frame" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove.mock.calls[0]![0].sighting.id).toBe("s2");
  });

  it("removes a boxed tag", () => {
    const { onRemove } = setup([label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.3, h: 0.1 })]);
    fireEvent.click(screen.getByRole("button", { name: "Remove tag NTUC FairPrice from this frame" }));
    expect(onRemove.mock.calls[0]![0].sighting.id).toBe("s1");
  });

  it("lists every tag on the frame, boxed and whole-frame", () => {
    setup([
      label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }),
      label("s2", places[1]!),
    ]);
    const onFrame = within(screen.getByRole("heading", { name: "On this frame" }).closest("section")!);
    expect(onFrame.getByText("NTUC FairPrice").closest("li")!.textContent).toContain("boxed");
    expect(onFrame.getByText("Public Library").closest("li")!.textContent).toContain("whole frame");
  });

  it("shows no tag list when the frame has none", () => {
    setup();
    expect(screen.getByText("Nothing tagged here yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Remove tag .* from this frame$/ })).toBeNull();
  });
});

describe("Places on the floor", () => {
  it("marks a proposed place with a pill that is readable at 13 px", () => {
    // Ruling 13: the proposed blue as 13 px text on white is 4.1:1, under AA.
    setup([], [...places, PlaceSchema.parse({ id: "p3", nameEn: "Festive Mall", category: "retail", status: "proposed" })]);
    const pill = screen.getByText("proposed");
    expect(pill.closest("button")!.textContent).toContain("Festive Mall");
    expect(pill.className).toContain("bg-proposed-soft");
    expect(pill.className).toContain("text-stone-900");
    expect(pill.className).not.toContain("text-proposed");
  });
});
