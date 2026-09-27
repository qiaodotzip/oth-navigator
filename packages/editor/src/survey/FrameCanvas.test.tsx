import { PlaceSchema, SightingSchema, type Box, type Place } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrameCanvas } from "./FrameCanvas";
import type { FrameLabel } from "./labelled";

const places = [
  PlaceSchema.parse({ id: "p1", nameEn: "NTUC FairPrice", category: "retail" }),
  PlaceSchema.parse({ id: "p2", nameEn: "Public Library", category: "community" }),
];

const label = (id: string, place: Place, box?: Box, status: "proposed" | "confirmed" = "confirmed"): FrameLabel => ({
  sighting: SightingSchema.parse({ id, placeId: place.id, keyframeId: "kf_1", status, ...(box ? { box } : {}) }),
  place,
});

/** Holds the drawn box the way the survey does, and shows it for the test to read. */
function Drawing({ labels = [], onMoveLabel = vi.fn(), onRemoveLabel = vi.fn() }: {
  labels?: FrameLabel[];
  onMoveLabel?: (l: FrameLabel, b: Box) => void;
  onRemoveLabel?: (l: FrameLabel) => void;
}) {
  const [draft, setDraft] = useState<Box | null>(null);
  return (
    <>
      <FrameCanvas
        imageUrl="/f.jpg" alt="frame kf_1" widthPx={640} heightPx={480} labels={labels}
        draft={draft} onDraft={setDraft} onMoveLabel={onMoveLabel} onRemoveLabel={onRemoveLabel}
      />
      <output data-testid="draft">{draft ? JSON.stringify(draft) : "none"}</output>
    </>
  );
}

function drawn(): Box | null {
  const text = screen.getByTestId("draft").textContent!;
  return text === "none" ? null : (JSON.parse(text) as Box);
}

/** The frame reports a real size; jsdom gives every element zero by default. */
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("drawing a box", () => {
  it("turns a drag into a box in fractions of the frame", () => {
    render(<Drawing />);
    const frame = screen.getByTestId("tag-frame");
    fireEvent.mouseDown(frame, { clientX: 100, clientY: 60 });
    fireEvent.mouseMove(frame, { clientX: 300, clientY: 240 });
    fireEvent.mouseUp(frame);
    const box = drawn()!;
    expect(box.x).toBeCloseTo(0.25, 2);
    expect(box.y).toBeCloseTo(0.2, 2);
    expect(box.w).toBeCloseTo(0.5, 2);
    expect(box.h).toBeCloseTo(0.6, 2);
  });

  it("draws the box while you drag", () => {
    render(<Drawing />);
    const frame = screen.getByTestId("tag-frame");
    fireEvent.mouseDown(frame, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(frame, { clientX: 200, clientY: 150 });
    expect(screen.getByTestId("tag-box")).toBeTruthy();
  });

  it("finishes a drag that is released outside the frame", () => {
    // Boxing something at the edge means letting go off the image.
    render(<Drawing />);
    const frame = screen.getByTestId("tag-frame");
    fireEvent.mouseDown(frame, { clientX: 100, clientY: 60 });
    fireEvent.mouseMove(frame, { clientX: 300, clientY: 240 });
    fireEvent.mouseUp(window);
    fireEvent.mouseMove(frame, { clientX: 380, clientY: 300 });
    expect((screen.getByTestId("tag-box") as HTMLElement).style.width).toBe("50%");
  });

  it("stops the browser dragging the image instead of drawing a box", () => {
    render(<Drawing />);
    expect((screen.getByAltText("frame kf_1") as HTMLImageElement).draggable).toBe(false);
  });

  it("offers no drawing where none is asked for", () => {
    render(<FrameCanvas imageUrl="/f.jpg" alt="frame kf_1" widthPx={640} heightPx={480} labels={[]} onMoveLabel={vi.fn()} />);
    const frame = screen.getByTestId("tag-frame");
    fireEvent.mouseDown(frame, { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(frame, { clientX: 200, clientY: 150 });
    expect(screen.queryByTestId("tag-box")).toBeNull();
  });
});

describe("what has already been identified", () => {
  it("draws a box where the thing was, named", () => {
    render(<Drawing labels={[label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.3, h: 0.1 })]} />);
    expect(screen.getByTestId("label-box-s1").textContent).toContain("NTUC FairPrice");
  });

  it("places the box where the fractions say", () => {
    render(<Drawing labels={[label("s1", places[0]!, { x: 0.25, y: 0.5, w: 0.2, h: 0.1 })]} />);
    const box = screen.getByTestId("label-box-s1") as HTMLElement;
    expect(box.style.left).toBe("25%");
    expect(box.style.top).toBe("50%");
    expect(box.style.width).toBe("20%");
  });

  it("draws a proposed box dashed, so it differs by more than its colour", () => {
    render(<Drawing labels={[
      label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.2, h: 0.2 }, "proposed"),
      label("s2", places[1]!, { x: 0.5, y: 0.2, w: 0.2, h: 0.2 }),
    ]} />);
    expect(screen.getByTestId("label-box-s1").className).toContain("border-dashed");
    expect(screen.getByTestId("label-box-s2").className).not.toContain("border-dashed");
  });

  it("keeps the label and its remove control on the image when the box hugs the top", () => {
    render(<Drawing labels={[label("s1", places[0]!, { x: 0.1, y: 0, w: 0.3, h: 0.2 })]} />);
    const tag = screen.getByTestId("label-box-s1").querySelector("span")!;
    expect(tag.className).toContain("top-0");
    expect(tag.className).not.toContain("-top-5");
  });

  it("drags a misplaced box to where the thing actually is", () => {
    const onMoveLabel = vi.fn();
    render(<Drawing onMoveLabel={onMoveLabel} labels={[label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.2, h: 0.2 })]} />);
    fireEvent.mouseDown(screen.getByTitle(/Drag to move, corners to resize/), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(screen.getByTestId("tag-frame"), { clientX: 140, clientY: 130 });
    fireEvent.mouseUp(screen.getByTestId("tag-frame"));
    const moved = onMoveLabel.mock.calls[0]![1] as Box;
    expect(moved.x).toBeCloseTo(0.2, 2);
    expect(moved.y).toBeCloseTo(0.3, 2);
    expect(moved.w).toBeCloseTo(0.2, 2);
  });

  it("resizes a box that is the wrong size, holding the opposite corner", () => {
    const onMoveLabel = vi.fn();
    render(<Drawing onMoveLabel={onMoveLabel} labels={[label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.2, h: 0.2 })]} />);
    fireEvent.mouseDown(screen.getByLabelText("Resize NTUC FairPrice se"), { clientX: 120, clientY: 120 });
    fireEvent.mouseMove(screen.getByTestId("tag-frame"), { clientX: 200, clientY: 180 });
    fireEvent.mouseUp(screen.getByTestId("tag-frame"));
    const sized = onMoveLabel.mock.calls[0]![1] as Box;
    expect(sized.x).toBeCloseTo(0.1, 2);
    expect(sized.y).toBeCloseTo(0.2, 2);
    expect(sized.w).toBeCloseTo(0.4, 2);
    expect(sized.h).toBeCloseTo(0.4, 2);
  });

  it("does not start drawing a new box when an existing one is grabbed", () => {
    const onMoveLabel = vi.fn();
    render(<Drawing onMoveLabel={onMoveLabel} labels={[label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.2, h: 0.2 })]} />);
    fireEvent.mouseDown(screen.getByTitle(/Drag to move/), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(screen.getByTestId("tag-frame"), { clientX: 140, clientY: 100 });
    fireEvent.mouseUp(screen.getByTestId("tag-frame"));
    expect(onMoveLabel).toHaveBeenCalled();
    expect(drawn()).toBeNull();
  });

  it("leaves the box body transparent, so a shopfront inside a walkway can still be drawn", () => {
    render(<Drawing labels={[label("s1", places[0]!, { x: 0, y: 0.2, w: 1, h: 0.8 })]} />);
    expect(screen.getByTestId("label-box-s1").className).toContain("pointer-events-none");
  });

  it("removes a tag without dragging the box on the way out", () => {
    const onRemoveLabel = vi.fn();
    const onMoveLabel = vi.fn();
    render(<Drawing onRemoveLabel={onRemoveLabel} onMoveLabel={onMoveLabel} labels={[label("s1", places[0]!, { x: 0.1, y: 0.2, w: 0.2, h: 0.2 })]} />);
    const x = screen.getByLabelText("Remove tag NTUC FairPrice from this frame");
    fireEvent.mouseDown(x, { clientX: 100, clientY: 100 });
    fireEvent.click(x);
    expect(onRemoveLabel).toHaveBeenCalled();
    expect(onMoveLabel).not.toHaveBeenCalled();
  });

  it("still shows a tag that applies to the whole frame", () => {
    render(<Drawing labels={[label("s2", places[1]!)]} />);
    expect(screen.getByTestId("whole-frame-labels").textContent).toContain("Public Library");
  });

  it("removes a whole-frame tag from its tray", () => {
    // Ruling 19: the boxed case already had a test; the tray beneath the
    // image, for a tag with no box, had none.
    const onRemoveLabel = vi.fn();
    render(<Drawing onRemoveLabel={onRemoveLabel} labels={[label("s2", places[1]!)]} />);
    fireEvent.click(screen.getByLabelText("Remove tag Public Library from this frame"));
    expect(onRemoveLabel.mock.calls[0]![0].sighting.id).toBe("s2");
  });

  it("shows nothing over a frame nobody has tagged", () => {
    render(<Drawing />);
    expect(screen.queryByTestId("whole-frame-labels")).toBeNull();
  });
});
