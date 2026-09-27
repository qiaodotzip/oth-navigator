import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { useEditorStore } from "../state/store";
import { fakeApi, sampleModel, sampleTeam } from "../testing/fakeApi";
import { inviteMessage } from "./inviteMessage";
import { TeamPage } from "./TeamPage";

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setUser({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" });
  useEditorStore.getState().setModel(sampleModel);
  useEditorStore.getState().setTeam(sampleTeam);
});

describe("TeamPage", () => {
  it("lists the team with the floors each owns", () => {
    render(<TeamPage api={fakeApi()} />);
    const wei = screen.getByRole("row", { name: /Wei Kang/ });
    expect(within(wei).getByText("L2")).toBeTruthy();
  });

  it("invites a teammate and shows their one-time password once", async () => {
    const api = fakeApi({
      inviteUser: vi.fn().mockResolvedValue({ user: { id: "u_new", email: "aisha@oth.local", displayName: "Aisha" }, password: "otp-123" }),
    });
    render(<TeamPage api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Invite a teammate" }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Aisha" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "aisha@oth.local" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    expect(await screen.findByText("otp-123")).toBeTruthy();
    expect(api.listUsers).toHaveBeenCalled();
  });

  it("forgets the password once its dialog is closed", async () => {
    const api = fakeApi({
      inviteUser: vi.fn().mockResolvedValue({ user: { id: "u_new", email: "aisha@oth.local", displayName: "Aisha" }, password: "otp-123" }),
    });
    render(<TeamPage api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Invite a teammate" }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Aisha" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "aisha@oth.local" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    await screen.findByText("otp-123");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByText("otp-123")).toBeNull());
  });

  it("says plainly when the email is already on the team", async () => {
    const api = fakeApi({ inviteUser: vi.fn().mockRejectedValue(new ApiError(409, null)) });
    render(<TeamPage api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Invite a teammate" }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Wei" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "wei@oth.local" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already on the team/);
  });

  it("shows no error of its own when an invite 401s: the session-ended dialog is the message", async () => {
    const api = fakeApi({ inviteUser: vi.fn().mockRejectedValue(new ApiError(401, null)) });
    render(<TeamPage api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Invite a teammate" }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Aisha" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "aisha@oth.local" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    await waitFor(() => expect(api.inviteUser).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows no toast when a reset 401s: the session-ended dialog is the message", async () => {
    const api = fakeApi({ resetUserPassword: vi.fn().mockRejectedValue(new ApiError(401, null)) });
    render(<TeamPage api={api} />);
    fireEvent.click(within(screen.getByRole("row", { name: /Wei Kang/ })).getByRole("button", { name: "Reset password" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reset Wei Kang's password" }));
    await waitFor(() => expect(api.resetUserPassword).toHaveBeenCalled());
    expect(screen.queryByText(/couldn't reset/i)).toBeNull();
  });

  it("asks before resetting someone's password, then shows the new one", async () => {
    const api = fakeApi({
      resetUserPassword: vi.fn().mockResolvedValue({ user: sampleTeam[1], password: "fresh-456" }),
    });
    render(<TeamPage api={api} />);
    fireEvent.click(within(screen.getByRole("row", { name: /Wei Kang/ })).getByRole("button", { name: "Reset password" }));
    expect(api.resetUserPassword).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Reset Wei Kang's password" }));
    expect(await screen.findByText("fresh-456")).toBeTruthy();
  });
});

describe("inviteMessage", () => {
  it("has everything someone needs to sign in, and nothing else", () => {
    const text = inviteMessage("invite", "https://map.example", "aisha@oth.local", "otp-123");
    expect(text).toContain("https://map.example");
    expect(text).toContain("aisha@oth.local");
    expect(text).toContain("otp-123");
    expect(text).toMatch(/set your own password/i);
  });
});
