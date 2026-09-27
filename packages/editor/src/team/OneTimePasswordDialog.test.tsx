import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OneTimePasswordDialog, type Issued } from "./OneTimePasswordDialog";

const issued: Issued = {
  user: { id: "u_new", email: "aisha@oth.local", displayName: "Aisha" },
  password: "otp-123",
  kind: "invite",
};

// Radix arms its outside-click listener on a timer, so a test needs a tick
// to pass before firing one, or it lands before the listener is attached.
const nextTick = () => act(() => new Promise(r => setTimeout(r, 0)));

describe("OneTimePasswordDialog", () => {
  // M11: an accidental outside click must not forget a password shown once.
  it("survives an outside click, but Done still closes and forgets it", async () => {
    const onClose = vi.fn();
    render(<OneTimePasswordDialog issued={issued} onClose={onClose} />);
    expect(screen.getByText("otp-123")).toBeTruthy();

    await nextTick();
    fireEvent.pointerDown(document.body);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("otp-123")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("also closes on its ×", async () => {
    const onClose = vi.fn();
    render(<OneTimePasswordDialog issued={issued} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
