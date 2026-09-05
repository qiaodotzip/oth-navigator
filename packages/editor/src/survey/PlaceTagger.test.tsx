import { KeyframeSchema, PlaceSchema } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaceTagger } from "./PlaceTagger";

const keyframe = KeyframeSchema.parse({
  id: "kf_1", captureId: "cap_1", timeMs: 0, imageId: "kf_1", widthPx: 640, heightPx: 480,
});

const places = [
  PlaceSchema.parse({ id: "p1", nameEn: "NTUC FairPrice", category: "retail" }),
  PlaceSchema.parse({ id: "p2", nameEn: "Public Library", category: "community" }),
];

function setup(existing = places) {
  const onTag = vi.fn();
  render(
    <PlaceTagger keyframe={keyframe} imageUrl="/f.jpg" places={existing} onTag={onTag} />,
  );
  return { onTag };
}

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

  it("says whether it is about to tag the frame or the box", () => {
    setup();
    expect(screen.getByText(/whole frame/i)).toBeTruthy();
  });
});
