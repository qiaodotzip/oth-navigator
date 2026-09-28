import { RoomSchema } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VertexHandles } from "./VertexHandles";
import { DEFAULT_VIEWPORT } from "./viewport";

const room = RoomSchema.parse({
  id: "L1-a",
  levelId: "oth-L1",
  kind: "room",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 3,
  walkable: true,
});

/** A trivial screen-to-world so the drag maths is checkable: 1 px is 1 unit. */
const toWorld = (e: { clientX: number; clientY: number }): [number, number] => [
  e.clientX,
  e.clientY,
];

function setup(footprint = room.footprint) {
  const onCommit = vi.fn();
  render(
    <svg>
      <VertexHandles
        room={{ ...room, footprint }}
        viewport={DEFAULT_VIEWPORT}
        toWorld={toWorld}
        onCommit={onCommit}
      />
    </svg>,
  );
  return { onCommit };
}

describe("VertexHandles", () => {
  it("renders a handle per vertex", () => {
    setup();
    expect(screen.getAllByTestId(/^vertex-/)).toHaveLength(4);
  });

  it("renders a midpoint per edge, for inserting", () => {
    setup();
    expect(screen.getAllByTestId(/^edge-mid-/)).toHaveLength(4);
  });

  it("commits once on release, not on every move", () => {
    const { onCommit } = setup();
    fireEvent.mouseDown(screen.getByTestId("vertex-1"), { clientX: 10, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 12, clientY: 3 });
    fireEvent.mouseMove(window, { clientX: 14, clientY: 5 });
    // Saving per move would fire dozens of optimistic-locked writes and every
    // one after the first would 409.
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.mouseUp(window, { clientX: 14, clientY: 5 });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits the moved ring", () => {
    const { onCommit } = setup();
    fireEvent.mouseDown(screen.getByTestId("vertex-1"), { clientX: 10, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 14, clientY: 5 });
    fireEvent.mouseUp(window, { clientX: 14, clientY: 5 });
    expect(onCommit.mock.calls[0]![0][1]).toEqual([14, 5]);
  });

  it("leaves the other vertices untouched", () => {
    const { onCommit } = setup();
    fireEvent.mouseDown(screen.getByTestId("vertex-1"), { clientX: 10, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 14, clientY: 5 });
    fireEvent.mouseUp(window, { clientX: 14, clientY: 5 });
    const ring = onCommit.mock.calls[0]![0];
    expect(ring[0]).toEqual([0, 0]);
    expect(ring[3]).toEqual([0, 10]);
  });

  it("does not save a press with no movement", () => {
    const { onCommit } = setup();
    fireEvent.mouseDown(screen.getByTestId("vertex-1"), { clientX: 10, clientY: 0 });
    fireEvent.mouseUp(window, { clientX: 10, clientY: 0 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("inserts a vertex when an edge midpoint is clicked", () => {
    const { onCommit } = setup();
    fireEvent.click(screen.getByTestId("edge-mid-0"));
    expect(onCommit.mock.calls[0]![0]).toHaveLength(5);
  });

  it("deletes a vertex on Delete while one is selected", () => {
    const { onCommit } = setup();
    fireEvent.click(screen.getByTestId("vertex-2"));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onCommit.mock.calls[0]![0]).toHaveLength(3);
  });

  it("does nothing on Delete with no vertex selected", () => {
    const { onCommit } = setup();
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("refuses to delete below three vertices", () => {
    const { onCommit } = setup([[0, 0], [5, 0], [0, 5]]);
    fireEvent.click(screen.getByTestId("vertex-0"));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("claims Delete on a selected corner even when the shape cannot lose one, so the room is not deleted instead", () => {
    setup([[0, 0], [5, 0], [0, 5]]);
    fireEvent.click(screen.getByTestId("vertex-0"));
    // fireEvent returns false when a listener called preventDefault.
    expect(fireEvent.keyDown(window, { key: "Delete" })).toBe(false);
  });

  it("leaves Backspace in a text field alone, even with a corner selected", () => {
    const { onCommit } = setup();
    fireEvent.click(screen.getByTestId("vertex-2"));
    const field = document.body.appendChild(document.createElement("input"));
    expect(fireEvent.keyDown(field, { key: "Backspace" })).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
    field.remove();
  });
});
