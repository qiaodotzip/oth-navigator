import { KeyframeSchema, PlaceSchema, SightingSchema, type Box, type Place } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FrameLabel } from "./labelled";
import { PlaceTagger } from "./PlaceTagger";

const keyframe = KeyframeSchema.parse({
  id: "kf_1", captureId: "cap_1", timeMs: 0, imageId: "kf_1", widthPx: 640, heightPx: 480,
});

const places = [
  PlaceSchema.parse({ id: "p1", nameEn: "NTUC FairPrice", category: "retail" }),
  PlaceSchema.parse({ id: "p2", nameEn: "Public Library", category: "community" }),
];

function setup(existing = places, labels: FrameLabel[] = []) {
  const onTag = vi.fn();
  const onRemoveLabel = vi.fn();
  render(
    <PlaceTagger
      keyframe={keyframe} imageUrl="/f.jpg" places={existing} labels={labels}
      onTag={onTag} onRemoveLabel={onRemoveLabel}
    />,
  );
  return { onTag, onRemoveLabel };
}

const label = (id: string, place: Place, box?: Box): FrameLabel => ({
  sighting: SightingSchema.parse({ id, placeId: place.id, keyframeId: "kf_1", ...(box ? { box } : {}) }),
  place,
});

/** The frame reports a real size; jsdom gives every element zero by default. */
beforeEach(() => {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0,
    toJSON: () => ({}),
  })) as unknown as typeof Element.prototype.getBoundingClientRect;
});

describe("PlaceTagger", () => {
  it("tags the whole frame when no box is drawn", () => {
    const { onTag } = setup();
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "Kopitiam" } });
    fireEvent.click(screen.getByRole("button"));
    expect(onTag).toHaveBeenCalledWith(expect.objectContaining({ nameEn: "Kopitiam" }));
    expect(onTag.mock.calls[0]![0].box).toBeUndefined();
  });

  it("turns a drag into a box in fractions of the frame", () => {
    const { onTag } = setup();
    const frame = screen.getByTestId("tag-frame");
    fireEvent.mouseDown(frame, { clientX: 100, clientY: 60 });
    fireEvent.mouseMove(frame, { clientX: 300, clientY: 240 });
    fireEvent.mouseUp(frame);
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "Kopitiam" } });
    fireEvent.click(screen.getByRole("button"));
    const box = onTag.mock.calls[0]![0].box;
    expect(box.x).toBeCloseTo(0.25, 2);
    expect(box.y).toBeCloseTo(0.2, 2);
    expect(box.w).toBeCloseTo(0.5, 2);
    expect(box.h).toBeCloseTo(0.6, 2);
  });

  it("draws the box back while you are dragging", () => {
    setup();
    const frame = screen.getByTestId("tag-frame");
    fireEvent.mouseDown(frame, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(frame, { clientX: 200, clientY: 150 });
    expect(screen.getByTestId("tag-box")).toBeTruthy();
  });

  it("links to an existing place rather than making a second one", () => {
    const { onTag } = setup();
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "NTUC FairPrice" } });
    fireEvent.click(screen.getByRole("button", { name: /Tag as NTUC FairPrice/ }));
    expect(onTag).toHaveBeenCalledWith(expect.objectContaining({ placeId: "p1" }));
  });

  it("keeps an existing place's category, rather than letting one frame change it", () => {
    const { onTag } = setup();
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "Public Library" } });
    fireEvent.click(screen.getByRole("button", { name: /Tag as/ }));
    expect(onTag.mock.calls[0]![0].category).toBe("community");
  });

  it("creates a place when the name is new", () => {
    const { onTag } = setup();
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "Fresh Bakery" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "lifestyle" } });
    fireEvent.click(screen.getByRole("button"));
    expect(onTag).toHaveBeenCalledWith(
      expect.objectContaining({ placeId: null, nameEn: "Fresh Bakery", category: "lifestyle" }),
    );
  });

  it("refuses to tag with an empty name", () => {
    const { onTag } = setup();
    fireEvent.click(screen.getByRole("button"));
    expect(onTag).not.toHaveBeenCalled();
  });

  it("refuses a name that is only spaces", () => {
    const { onTag } = setup();
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button"));
    expect(onTag).not.toHaveBeenCalled();
  });

  it("tags on Enter, since the hands are already on the keyboard", () => {
    const { onTag } = setup();
    const input = screen.getByLabelText("Place name");
    fireEvent.change(input, { target: { value: "Kopitiam" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onTag).toHaveBeenCalled();
  });

  it("clears the name after tagging, ready for the next thing in frame", () => {
    setup();
    const input = screen.getByLabelText("Place name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Kopitiam" } });
    fireEvent.click(screen.getByRole("button"));
    expect(input.value).toBe("");
  });

  it("stops the browser dragging the image instead of drawing a box", () => {
    // Without this the browser starts its own image drag on mousedown and
    // stops delivering mousemove, so no box is ever drawn and the label
    // silently falls back to applying to the whole frame.
    setup();
    const img = screen.getByAltText("frame kf_1") as HTMLImageElement;
    expect(img.draggable).toBe(false);
  });

  it("ignores a box too small to have been drawn on purpose", () => {
    const { onTag } = setup();
    const frame = screen.getByTestId("tag-frame");
    fireEvent.mouseDown(frame, { clientX: 100, clientY: 60 });
    fireEvent.mouseMove(frame, { clientX: 101, clientY: 61 });
    fireEvent.mouseUp(frame);
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "Kopitiam" } });
    fireEvent.click(screen.getByRole("button", { name: "Tag" }));
    expect(onTag.mock.calls[0]![0].box).toBeUndefined();
  });

  it("finishes a drag that is released outside the frame", () => {
    // Boxing something at the edge means letting go off the image.
    setup();
    const frame = screen.getByTestId("tag-frame");
    fireEvent.mouseDown(frame, { clientX: 100, clientY: 60 });
    fireEvent.mouseMove(frame, { clientX: 300, clientY: 240 });
    fireEvent.mouseUp(window);
    fireEvent.mouseMove(frame, { clientX: 380, clientY: 300 });
    const box = screen.getByTestId("tag-box") as HTMLElement;
    // The box kept the size it had when the mouse was released.
    expect(box.style.width).toBe("50%");
  });

  it("says whether it is about to tag the frame or the box", () => {
    setup();
    expect(screen.getByText(/whole frame/i)).toBeTruthy();
  });
});

describe("what has already been identified", () => {
  it("draws a box where the thing was, named", () => {
    setup(places, [label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.3, h: 0.1 })]);
    const box = screen.getByTestId("label-box-s1");
    expect(box.textContent).toContain("NTUC FairPrice");
  });

  it("places the box where the fractions say", () => {
    setup(places, [label("s1", places[0]!, { x: 0.25, y: 0.5, w: 0.2, h: 0.1 })]);
    const box = screen.getByTestId("label-box-s1") as HTMLElement;
    expect(box.style.left).toBe("25%");
    expect(box.style.top).toBe("50%");
    expect(box.style.width).toBe("20%");
  });

  it("still shows a label that applies to the whole frame", () => {
    // No box does not mean nothing was said about the frame.
    setup(places, [label("s2", places[1]!)]);
    expect(screen.getByTestId("whole-frame-labels").textContent).toContain("Public Library");
  });

  it("shows nothing when the frame has not been labelled", () => {
    setup();
    expect(screen.queryByTestId("whole-frame-labels")).toBeNull();
  });
});

describe("taking a wrong tag off a frame", () => {
  it("removes a whole-frame tag without touching the place elsewhere", () => {
    // The case that prompted this: one frame-wide tag left over from a drag
    // that never drew, sitting beside a correct boxed one.
    const { onRemoveLabel } = setup(places, [label("s2", places[1]!)]);
    fireEvent.click(screen.getByLabelText("Remove Public Library from this frame"));
    expect(onRemoveLabel.mock.calls[0]![0].sighting.id).toBe("s2");
  });

  it("removes a boxed tag too", () => {
    const { onRemoveLabel } = setup(places, [
      label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }),
    ]);
    fireEvent.click(screen.getByLabelText("Remove NTUC FairPrice from this frame"));
    expect(onRemoveLabel.mock.calls[0]![0].sighting.id).toBe("s1");
  });

  it("lists every tag on the frame, so removal does not mean hunting overlays", () => {
    setup(places, [
      label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }),
      label("s2", places[1]!),
    ]);
    const list = screen.getByTestId("tags-on-frame");
    expect(list.textContent).toContain("boxed");
    expect(list.textContent).toContain("whole frame");
  });

  it("shows no tag list when the frame has none", () => {
    setup();
    expect(screen.queryByTestId("tags-on-frame")).toBeNull();
  });
});
