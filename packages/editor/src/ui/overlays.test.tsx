import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Popover } from "./Popover";
import { toast, useToasts } from "./toast";
import { Toaster } from "./Toaster";

beforeEach(() => useToasts.getState().clear());

describe("toast", () => {
  it("lets a plain message go on its own", () => {
    toast({ message: "Saved." });
    expect(useToasts.getState().toasts[0]).toMatchObject({ message: "Saved.", tone: "info", durationMs: 4000 });
  });

  it("keeps an error until it is dismissed, since one that vanishes goes unseen", () => {
    toast({ message: "Could not save.", tone: "error" });
    expect(useToasts.getState().toasts[0]!.durationMs).toBeNull();
  });

  it("keeps an Undo long enough to reach for it", () => {
    toast({ message: "Deleted Stadium", action: { label: "Undo", run: () => {} } });
    expect(useToasts.getState().toasts[0]!.durationMs).toBe(8000);
  });

  it("shows at most four at once", () => {
    for (let i = 0; i < 6; i++) toast({ message: `m${i}` });
    expect(useToasts.getState().toasts.map(t => t.message)).toEqual(["m2", "m3", "m4", "m5"]);
  });
});

describe("Toaster", () => {
  it("shows a toast and runs its action, which also dismisses it", async () => {
    const run = vi.fn();
    render(<Toaster />);
    act(() => { toast({ message: "Deleted Stadium", action: { label: "Undo", run } }); });
    const toastEl = await screen.findByTestId("toast-info");
    expect(toastEl).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(run).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(useToasts.getState().toasts).toHaveLength(0));
  });
});

describe("Dialog", () => {
  it("shows its title and closes on Escape", async () => {
    const onOpenChange = vi.fn();
    render(<Dialog open onOpenChange={onOpenChange} title="Change password"><p>body</p></Dialog>);
    expect(screen.getByRole("dialog", { name: "Change password" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("offers no close control when it cannot be dismissed", () => {
    const onOpenChange = vi.fn();
    render(<Dialog open dismissible={false} onOpenChange={onOpenChange} title="Your session ended"><p>body</p></Dialog>);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe("Popover", () => {
  it("opens from its trigger", async () => {
    render(<Popover trigger={<Button>Floors</Button>}><p>L1 L2 L3</p></Popover>);
    expect(screen.queryByText("L1 L2 L3")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Floors" }));
    expect(await screen.findByText("L1 L2 L3")).toBeTruthy();
  });
});
