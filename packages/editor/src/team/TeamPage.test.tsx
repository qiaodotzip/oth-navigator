import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { useEditorStore } from "../state/store";
import { fakeApi, sampleModel, sampleTeam } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { TeamPage } from "./TeamPage";

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
  useEditorStore.getState().setUser({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" });
  useEditorStore.getState().setModel(sampleModel);
  useEditorStore.getState().setTeam(sampleTeam);
});

describe("TeamPage", () => {
  it("lists the team by name, with the floors each owns, and no email column", () => {
    render(<TeamPage api={fakeApi()} />);
    const wei = screen.getByRole("row", { name: /Wei Kang/ });
    expect(within(wei).getByText("L2")).toBeTruthy();
    expect(screen.queryByText("wei@oth.local")).toBeNull();
    expect(screen.queryByRole("button", { name: /reset password/i })).toBeNull();
  });

  it("adds a teammate by name and refreshes the list", async () => {
    const api = fakeApi({
      inviteUser: vi.fn().mockResolvedValue({ user: { id: "u_new", displayName: "Aisha" } }),
    });
    render(<TeamPage api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Add teammate" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Aisha" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add teammate" }));
    await waitFor(() =>
      expect(useToasts.getState().toasts[0]?.message).toBe("Aisha can now sign in by picking their name."),
    );
    expect(api.listUsers).toHaveBeenCalled();
  });

  it("says plainly when the name is already on the team", async () => {
    const api = fakeApi({
      inviteUser: vi.fn().mockRejectedValue(new ApiError(409, { error: "Someone called Wei Kang is already on the team." })),
    });
    render(<TeamPage api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Add teammate" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Wei Kang" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add teammate" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Someone called Wei Kang is already on the team.");
  });

  it("shows no error of its own when adding a teammate 401s: the session-ended dialog is the message", async () => {
    const api = fakeApi({ inviteUser: vi.fn().mockRejectedValue(new ApiError(401, null)) });
    render(<TeamPage api={api} />);
    fireEvent.click(screen.getByRole("button", { name: "Add teammate" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Aisha" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add teammate" }));
    await waitFor(() => expect(api.inviteUser).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
