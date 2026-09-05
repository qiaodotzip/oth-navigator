import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { LockBanner } from "./LockBanner";

const me = { id: "user_me", email: "me@example.com", displayName: "Stef" };
const weiHolds = [
  { entityType: "room", entityId: "L1-a", lockedBy: "user_wei", lockedByName: "Wei" },
];

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setUser(me);
});

describe("LockBanner", () => {
  it("says nothing when what I selected is free", () => {
    useEditorStore.getState().setLocks(weiHolds);
    useEditorStore.getState().select({ type: "room", id: "L1-free" });
    const { container } = render(<LockBanner />);
    expect(container.textContent).toBe("");
  });

  it("names who is in the entity I just selected", () => {
    useEditorStore.getState().setLocks(weiHolds);
    useEditorStore.getState().select({ type: "room", id: "L1-a" });
    render(<LockBanner />);
    expect(screen.getByRole("status").textContent).toContain("Wei");
  });

  it("says the edit is still allowed, because the lock only warns", () => {
    useEditorStore.getState().setLocks(weiHolds);
    useEditorStore.getState().select({ type: "room", id: "L1-a" });
    render(<LockBanner />);
    expect(screen.getByRole("status").textContent).toMatch(/can still edit/i);
  });

  it("says nothing about a lock I hold myself", () => {
    useEditorStore.getState().setLocks([
      { entityType: "room", entityId: "L1-a", lockedBy: "user_me", lockedByName: "Stef" },
    ]);
    useEditorStore.getState().select({ type: "room", id: "L1-a" });
    const { container } = render(<LockBanner />);
    expect(container.textContent).toBe("");
  });

  it("says nothing when nothing is selected", () => {
    useEditorStore.getState().setLocks(weiHolds);
    const { container } = render(<LockBanner />);
    expect(container.textContent).toBe("");
  });
});
