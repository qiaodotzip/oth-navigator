import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { useEditorStore } from "../state/store";
import { fakeApi, sampleModel } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { AccountMenu } from "./AccountMenu";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { OfflineBanner } from "./OfflineBanner";
import { PasswordBanner } from "./PasswordBanner";
import { PublishButton } from "./PublishButton";

const me = { id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" };

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
  useEditorStore.getState().setUser(me);
  useEditorStore.getState().setModel(sampleModel);
});

describe("PublishButton", () => {
  it("says what blocks publishing, and links to where it is fixed", async () => {
    useEditorStore.getState().setReport({
      ok: false, errorCount: 1, warningCount: 0,
      issues: [{ severity: "error", code: "entrance.offFloor", message: "Entrance \"Gate 1\" stands on a wall.", entityType: "entrance", entityId: "e1", levelId: "oth-L1" }],
    });
    render(<PublishButton api={fakeApi()} />);
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    const link = await screen.findByRole("link", { name: /Gate 1/ });
    expect(link.getAttribute("href")).toBe("/floors/L1/build?step=entrances");
  });

  it("publishes when nothing blocks it, and says so", async () => {
    useEditorStore.getState().setReport({ ok: true, errorCount: 0, warningCount: 2, issues: [] });
    const api = fakeApi({ publish: vi.fn().mockResolvedValue({ version: "v13", warningCount: 2 }) });
    render(<PublishButton api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(useToasts.getState().toasts[0]?.message).toBe("Published v13 with 2 warnings."));
  });
});

describe("ChangePasswordDialog", () => {
  function fill(current: string, next: string, again = next) {
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: current } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: next } });
    fireEvent.change(screen.getByLabelText("New password, again"), { target: { value: again } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  }

  it("checks length and the repeat before asking the server", () => {
    const api = fakeApi();
    render(<ChangePasswordDialog api={api} open onOpenChange={() => {}} />);
    fill("old", "short");
    expect(screen.getByRole("alert").textContent).toMatch(/10 characters/);
    fill("old", "long-enough-1", "long-enough-2");
    expect(screen.getByRole("alert").textContent).toMatch(/don't match/);
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("says a wrong current password without signing you out", async () => {
    const api = fakeApi({ changePassword: vi.fn().mockRejectedValue(new ApiError(422, null)) });
    render(<ChangePasswordDialog api={api} open onOpenChange={() => {}} />);
    fill("wrong", "long-enough-1");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/current password is not right/));
    expect(useEditorStore.getState().user).not.toBeNull();
  });

  it("shows nothing of its own on a 401: the session-ended dialog is the message", async () => {
    // I2, but the 422 case above must keep working: a wrong password is not
    // an expired session.
    const api = fakeApi({ changePassword: vi.fn().mockRejectedValue(new ApiError(401, null)) });
    render(<ChangePasswordDialog api={api} open onOpenChange={() => {}} />);
    fill("old-one", "long-enough-1");
    await waitFor(() => expect(api.changePassword).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears the one-time prompt once changed", async () => {
    useEditorStore.getState().setUser({ ...me, mustChangePassword: true });
    const onOpenChange = vi.fn();
    render(<ChangePasswordDialog api={fakeApi()} open onOpenChange={onOpenChange} />);
    fill("old-one", "long-enough-1");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(useEditorStore.getState().user?.mustChangePassword).toBe(false);
  });
});

describe("PasswordBanner", () => {
  it("asks someone on a one-time password to set their own", () => {
    useEditorStore.getState().setUser({ ...me, mustChangePassword: true });
    render(<PasswordBanner api={fakeApi()} />);
    expect(screen.getByRole("status").textContent).toMatch(/one-time password/);
  });

  it("stays quiet otherwise", () => {
    render(<PasswordBanner api={fakeApi()} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("AccountMenu", () => {
  it("signs out as a choice, not as an expiry", async () => {
    const api = fakeApi();
    render(<AccountMenu api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(useEditorStore.getState().sessionEnd).toBe("signed-out"));
    expect(api.logout).toHaveBeenCalled();
  });
});

describe("OfflineBanner", () => {
  it("appears while the server cannot be reached", async () => {
    render(<OfflineBanner api={fakeApi({ health: vi.fn().mockResolvedValue(false) })} pollMs={60_000} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("is absent while it can", async () => {
    const health = vi.fn().mockResolvedValue(true);
    render(<OfflineBanner api={fakeApi({ health })} pollMs={60_000} />);
    await act(async () => { await Promise.resolve(); });
    expect(health).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
