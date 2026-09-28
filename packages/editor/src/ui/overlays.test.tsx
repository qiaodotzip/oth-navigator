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

  it("stacks toasts top centre, below the toolbar row, clear of every control", () => {
    // jsdom has no layout, so the position is read from the classes; the
    // browser check is plan2-shots/20-toasts-review.png and 21-toasts-survey.png.
    // The corners hold Review's decision buttons and List, the drawer and
    // Survey's panel, so neither corner is safe; top-36 clears Survey's toolbar
    // even when it wraps to two lines at 1366 px and below.
    render(<Toaster />);
    const classes = screen.getByRole("region").querySelector("ol")!.className.split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining(["fixed", "top-36", "left-1/2", "-translate-x-1/2", "w-[360px]", "flex-col", "gap-2"]),
    );
    expect(classes.some(c => /^(bottom|right)-/.test(c))).toBe(false);
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

  // Radix arms its outside-click listener on a timer, so a test needs a tick
  // to pass before firing one, or it lands before the listener is attached.
  const nextTick = () => act(() => new Promise(r => setTimeout(r, 0)));

  it("closes on an outside click by default", async () => {
    const onOpenChange = vi.fn();
    render(<Dialog open onOpenChange={onOpenChange} title="Change password"><p>body</p></Dialog>);
    await nextTick();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  // M11: a one-time password must survive a stray outside click, but Escape
  // and its × still forget it on purpose.
  it("ignores an outside click when closeOnOutsideClick is false, but keeps Escape and its close control", async () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange} title="A new password" closeOnOutsideClick={false}>
        <p>otp-123</p>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();

    await nextTick();
    fireEvent.pointerDown(document.body);
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
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
