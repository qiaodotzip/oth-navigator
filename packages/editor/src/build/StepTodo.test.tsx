import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepTodo } from "./StepTodo";
import type { TodoItem } from "./todo";

const item = (over: Partial<TodoItem> = {}): TodoItem => ({
  key: "room.name.missing:L1-a",
  step: "rooms",
  severity: "warning",
  code: "room.name.missing",
  message: "Room L1-a has no name.",
  target: { kind: "select", selection: { type: "room", id: "L1-a" } },
  ...over,
});

function setup(items: TodoItem[], step: TodoItem["step"] = "rooms") {
  const onChoose = vi.fn();
  const onDeleteOrphan = vi.fn();
  render(<StepTodo step={step} items={items} onChoose={onChoose} onDeleteOrphan={onDeleteOrphan} />);
  return { onChoose, onDeleteOrphan };
}

describe("StepTodo", () => {
  it("says so when a step has nothing left", () => {
    setup([], "pathways");
    expect(screen.getByText(/nothing left to do on pathways/i)).toBeTruthy();
  });

  it("takes you to the thing an item is about", () => {
    const todo = item();
    const { onChoose } = setup([todo]);
    fireEvent.click(screen.getByRole("button", { name: /has no name/ }));
    expect(onChoose).toHaveBeenCalledWith(todo);
  });

  it("marks errors and warnings in words, not only in colour", () => {
    setup([item({ key: "a", severity: "error", message: "Broken outline." }), item({ key: "b" })]);
    expect(screen.getByRole("button", { name: "Error: Broken outline." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Warning: Room L1-a has no name." })).toBeTruthy();
  });

  it("lets a surveyed place be chosen, to find the room it is in", () => {
    const place = item({ step: "bind", message: "Festive Mall is not bound.", target: { kind: "place", placeId: "pl_1" } });
    const { onChoose } = setup([place], "bind");
    fireEvent.click(screen.getByRole("button", { name: /Festive Mall/ }));
    expect(onChoose).toHaveBeenCalledWith(place);
  });

  it("shows an item about the whole floor as text, since there is nothing to go to", () => {
    setup([item({ message: "Level L1 has no lift.", target: { kind: "none" } })], "entrances");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Level L1 has no lift.")).toBeTruthy();
  });

  it("offers to delete a lift with no stops", () => {
    const orphan = item({ message: "Lift x connects nothing.", target: { kind: "orphan-portal", portalId: "lift-x", version: 0 } });
    const { onDeleteOrphan } = setup([orphan], "entrances");
    fireEvent.click(screen.getByRole("button", { name: "Delete this lift" }));
    expect(onDeleteOrphan).toHaveBeenCalledWith(orphan);
  });

  it("shows the first fifty of a long list, and the rest on request", () => {
    const many = Array.from({ length: 60 }, (_, i) => item({ key: `k${i}`, message: `Item ${i}.` }));
    setup(many, "bind");
    expect(screen.getAllByRole("listitem")).toHaveLength(50);
    fireEvent.click(screen.getByRole("button", { name: "Show all 60" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(60);
  });
});
