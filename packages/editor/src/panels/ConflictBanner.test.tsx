import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { ConflictBanner } from "./ConflictBanner";

beforeEach(() => useEditorStore.getState().reset());

describe("ConflictBanner", () => {
  it("renders nothing when there is no conflict", () => {
    const { container } = render(<ConflictBanner onReload={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("names the entity someone else saved", () => {
    useEditorStore.getState().setConflict({
      entityType: "room", entityId: "L1-a",
      current: { updatedBy: "user_2", version: 3 },
    });
    render(<ConflictBanner onReload={vi.fn()} />);
    expect(screen.getByText("L1-a")).toBeTruthy();
  });

  it("offers to reload rather than silently overwriting", () => {
    const onReload = vi.fn();
    useEditorStore.getState().setConflict({ entityType: "room", entityId: "L1-a", current: null });
    render(<ConflictBanner onReload={onReload} />);
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(onReload).toHaveBeenCalled();
  });

  it("clears the conflict once acknowledged", () => {
    useEditorStore.getState().setConflict({ entityType: "room", entityId: "L1-a", current: null });
    render(<ConflictBanner onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(useEditorStore.getState().conflict).toBeNull();
  });

  it("says who changed it, by name, and what", () => {
    useEditorStore.getState().setTeam([{ id: "user_2", displayName: "Wei Kang" }]);
    useEditorStore.getState().setConflict({
      entityType: "room", entityId: "L1-a",
      current: { updatedBy: "user_2", version: 3, nameEn: "Stadium" },
    });
    render(<ConflictBanner onReload={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toMatch(/^Wei Kang changed Stadium/);
  });

  it("says your own last change was still saving, rather than blaming you as someone else", () => {
    useEditorStore.getState().setUser({ id: "user_1", email: "a@oth.local", displayName: "Stef Chan" });
    useEditorStore.getState().setTeam([{ id: "user_1", displayName: "Stef Chan" }]);
    useEditorStore.getState().setConflict({
      entityType: "placement", entityId: "L1-bin-1",
      current: { updatedBy: "user_1", version: 3 },
    });
    render(<ConflictBanner onReload={vi.fn()} />);
    expect(screen.getByRole("alert").textContent)
      .toMatch(/^Your last change to L1-bin-1 was still saving, so this one was not saved\. Reload, then make it again\./);
  });
});
