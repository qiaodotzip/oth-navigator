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

function setup(items: TodoItem[], step: TodoItem["step"] = "rooms", done = false) {
  const onChoose = vi.fn();
  const onDeleteOrphan = vi.fn();
  const { rerender } = render(
    <StepTodo step={step} done={done} items={items} onChoose={onChoose} onDeleteOrphan={onDeleteOrphan} />,
  );
  const show = (next: TodoItem["step"]) =>
    rerender(<StepTodo step={next} done={done} items={items} onChoose={onChoose} onDeleteOrphan={onDeleteOrphan} />);
  return { onChoose, onDeleteOrphan, show };
}

const orphanLift = (portalId: string): TodoItem =>
  item({
    key: `portal.endpoints:${portalId}`,
    step: "entrances",
    message: `Portal "${portalId}" has fewer than two endpoints, so it connects nothing.`,
    target: { kind: "orphan-portal", portalId, version: 0 },
  });

describe("StepTodo", () => {
  it("says so when a step has nothing left", () => {
    setup([], "pathways", true);
    expect(screen.getByText(/nothing left to do on pathways/i)).toBeTruthy();
  });

  it("says what comes next on a step that is empty but not done, with no tick", () => {
    // A blank floor: nothing to fix on Areas & rooms, because nothing is traced yet.
    setup([], "rooms", false);
    expect(screen.getByText("Next: trace areas and rooms")).toBeTruthy();
    expect(screen.queryByText(/nothing left/i)).toBeNull();
    expect(screen.getByRole("region", { name: "To do" }).textContent).not.toContain("✓");
  });

  it("lists what is still open on a step that is done, not the all-clear", () => {
    setup([item()], "rooms", true);
    expect(screen.getByRole("button", { name: /has no name/ })).toBeTruthy();
    expect(screen.queryByText(/nothing left/i)).toBeNull();
  });

  it("says why a step with only warnings is ticked: none of them stops you publishing", () => {
    setup([item()], "pathways", true);
    const note = screen.getByText(/nothing here stops you publishing/i);
    expect(note.textContent).toContain("✓");
    expect(note.textContent).toContain("1 warning");
  });

  it("says what the errors on a step are for, and gives no tick", () => {
    const broken = item({ key: "a", severity: "error", message: 'Room "L1-west-column-05" has an area below 0.5 m².' });
    setup([broken, item({ key: "b", severity: "error" }), item({ key: "c" })], "rooms", false);
    expect(screen.getByText("Fix these 2 errors before publishing.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "To do" }).textContent).not.toContain("✓");
  });

  it("never ticks a list that has an error on it, whatever it is told", () => {
    setup([item({ severity: "error" })], "rooms", true);
    expect(screen.getByText("Fix this error before publishing.")).toBeTruthy();
    expect(screen.queryByText(/nothing here stops/i)).toBeNull();
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

  it("marks errors and warnings with a sign you can see, as well as the words a screen reader hears", () => {
    setup([item({ key: "a", severity: "error", message: "Broken outline." }), item({ key: "b" })]);
    expect(screen.getByRole("button", { name: "Error: Broken outline." }).textContent).toContain("✕");
    expect(screen.getByRole("button", { name: "Warning: Room L1-a has no name." }).textContent).toContain("!");
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

  it("tells one lift's Delete from another's by the row it sits in", () => {
    setup([orphanLift("lift-x"), orphanLift("lift-y")], "entrances");
    const [x, y] = screen.getAllByRole("button", { name: "Delete this lift" });
    expect(x).toHaveAccessibleDescription('Portal "lift-x" has fewer than two endpoints, so it connects nothing.');
    expect(y).toHaveAccessibleDescription('Portal "lift-y" has fewer than two endpoints, so it connects nothing.');
  });

  it("shows the first fifty of a long list, and the rest on request", () => {
    const many = Array.from({ length: 60 }, (_, i) => item({ key: `k${i}`, message: `Item ${i}.` }));
    setup(many, "bind");
    expect(screen.getAllByRole("listitem")).toHaveLength(50);
    fireEvent.click(screen.getByRole("button", { name: "Show all 60" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(60);
  });

  it("offers no Show all when fifty is the whole list", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => item({ key: `k${i}`, message: `Item ${i}.` }));
    setup(fifty, "bind");
    expect(screen.getAllByRole("listitem")).toHaveLength(50);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("puts you on the first item Show all revealed, since the button itself is gone", () => {
    const many = Array.from({ length: 60 }, (_, i) => item({ key: `k${i}`, message: `Item ${i}.` }));
    setup(many, "bind");
    fireEvent.click(screen.getByRole("button", { name: "Show all 60" }));
    expect(screen.getByRole("button", { name: "Warning: Item 50." })).toHaveFocus();
  });

  it("puts you on a revealed item even when it has nothing to go to", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      i === 50
        ? item({ key: "floor", message: "Level L1 has no lift.", target: { kind: "none" } })
        : item({ key: `k${i}`, message: `Item ${i}.` }),
    );
    setup(many, "bind");
    fireEvent.click(screen.getByRole("button", { name: "Show all 60" }));
    const row = screen.getByText("Level L1 has no lift.").closest("li")!;
    expect(row.contains(document.activeElement)).toBe(true);
  });

  it("starts every step's list short again once you change step, the one you left included", () => {
    const many = Array.from({ length: 60 }, (_, i) => item({ key: `k${i}`, message: `Item ${i}.` }));
    const { show } = setup(many, "bind");
    fireEvent.click(screen.getByRole("button", { name: "Show all 60" }));
    show("rooms");
    expect(screen.getAllByRole("listitem")).toHaveLength(50);
    expect(screen.getByRole("button", { name: "Show all 60" })).toBeTruthy();
    show("bind");
    expect(screen.getAllByRole("listitem")).toHaveLength(50);
  });
});
