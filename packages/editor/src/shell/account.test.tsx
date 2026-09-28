import type { ValidationReport } from "@oth/model";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { fakeApi, sampleModel } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { AccountMenu } from "./AccountMenu";
import { OfflineBanner } from "./OfflineBanner";
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

  it("closes the list once you follow a link to the fix", async () => {
    window.history.pushState({}, "", "/floors");
    useEditorStore.getState().setReport({
      ok: false, errorCount: 1, warningCount: 0,
      issues: [{ severity: "error", code: "entrance.offFloor", message: "Entrance \"Gate 1\" stands on a wall.", entityType: "entrance", entityId: "e1", levelId: "oth-L1" }],
    });
    render(<PublishButton api={fakeApi()} />);
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    fireEvent.click(await screen.findByRole("link", { name: /Gate 1/ }));
    expect(window.location.pathname + window.location.search).toBe("/floors/L1/build?step=entrances");
    await waitFor(() => expect(screen.queryByRole("link", { name: /Gate 1/ })).toBeNull());
  });

  it("does not spring the list open by itself when something blocks again", async () => {
    const blocked: ValidationReport = {
      ok: false, errorCount: 1, warningCount: 0,
      issues: [{ severity: "error", code: "entrance.offFloor", message: "Entrance \"Gate 1\" stands on a wall.", entityType: "entrance", entityId: "e1", levelId: "oth-L1" }],
    };
    useEditorStore.getState().setReport(blocked);
    render(<PublishButton api={fakeApi()} />);
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    await screen.findByRole("link", { name: /Gate 1/ });
    // Fixed elsewhere while the list is open, then blocked again later.
    act(() => useEditorStore.getState().setReport({ ok: true, errorCount: 0, warningCount: 0, issues: [] }));
    act(() => useEditorStore.getState().setReport(blocked));
    expect(screen.queryByRole("link", { name: /Gate 1/ })).toBeNull();
  });

  it("publishes when nothing blocks it, and says so without the raw version id", async () => {
    useEditorStore.getState().setReport({ ok: true, errorCount: 0, warningCount: 2, issues: [] });
    const api = fakeApi({ publish: vi.fn().mockResolvedValue({ version: "2026-09-04T09-07-35-019Z", warningCount: 2 }) });
    render(<PublishButton api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(useToasts.getState().toasts[0]?.message).toBe("Published with 2 warnings. This is now the latest version of the map."),
    );
  });

  it("says a clean publish plainly, and one warning in the singular", async () => {
    useEditorStore.getState().setReport({ ok: true, errorCount: 0, warningCount: 0, issues: [] });
    const publish = vi.fn()
      .mockResolvedValueOnce({ version: "2026-09-04T09-07-35-019Z", warningCount: 0 })
      .mockResolvedValueOnce({ version: "2026-09-05T09-07-35-019Z", warningCount: 1 });
    render(<PublishButton api={fakeApi({ publish })} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(useToasts.getState().toasts[0]?.message).toBe("Published. This is now the latest version of the map."));
    await waitFor(() => expect(screen.getByRole("button", { name: "Publish" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(useToasts.getState().toasts[1]?.message).toBe("Published with 1 warning. This is now the latest version of the map."),
    );
  });
});

describe("AccountMenu", () => {
  it("shows the name only, not the hidden @team.oth.local email", async () => {
    render(<AccountMenu api={fakeApi()} />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(await screen.findByText("Stef Chan")).toBeTruthy();
    expect(screen.queryByText(me.email)).toBeNull();
  });

  it("closes once you choose Team, rather than staying open over the Team page", async () => {
    window.history.pushState({}, "", "/floors");
    render(<AccountMenu api={fakeApi()} />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(await screen.findByRole("link", { name: "Team" }));
    expect(window.location.pathname).toBe("/team");
    await waitFor(() => expect(screen.queryByText("Stef Chan")).toBeNull());
    expect(screen.queryByRole("link", { name: "Team" })).toBeNull();
  });

  it("does not spring open by itself after the session ends with it open and you sign back in", async () => {
    render(<AccountMenu api={fakeApi()} />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    await screen.findByRole("link", { name: "Team" });
    act(() => useEditorStore.getState().endSession("expired"));
    act(() => useEditorStore.getState().setUser(me));
    expect(screen.queryByRole("link", { name: "Team" })).toBeNull();
  });

  it("signs out as a choice, not as an expiry", async () => {
    const api = fakeApi();
    render(<AccountMenu api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(useEditorStore.getState().sessionEnd).toBe("signed-out"));
    expect(api.logout).toHaveBeenCalled();
  });

  it("ends the session before the sign-out request settles, so a poll mid-flight can't show it as expired", async () => {
    // Carried forward from Plan 1: signing out the other way round left a gap
    // where the store still had a user, and a 401 landing in that gap read as
    // an expired session rather than the sign-out that was already underway.
    let resolveLogout!: () => void;
    const logout = vi.fn(() => new Promise<void>(res => { resolveLogout = res; }));
    render(<AccountMenu api={fakeApi({ logout })} />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(useEditorStore.getState().sessionEnd).toBe("signed-out");
    expect(useEditorStore.getState().user).toBeNull();

    resolveLogout();
    await waitFor(() => expect(logout).toHaveBeenCalled());
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
