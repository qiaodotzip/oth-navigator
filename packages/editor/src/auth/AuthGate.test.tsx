import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Api } from "../api/client";
import { useEditorStore } from "../state/store";
import { AuthGate } from "./AuthGate";

const ada = { id: "u1", email: "ada@oth.local", displayName: "Ada" };

function fakeApi(overrides: Partial<Record<keyof Api, unknown>> = {}) {
  return {
    me: vi.fn().mockResolvedValue(ada),
    people: vi.fn().mockResolvedValue([{ id: "u1", displayName: "Ada" }]),
    login: vi.fn().mockResolvedValue(ada),
    ...overrides,
  } as unknown as Api;
}

/** Picks Ada from the sign-in dropdown and submits. */
async function signInAsAda() {
  const select = await screen.findByLabelText(/who are you/i);
  fireEvent.change(select, { target: { value: "u1" } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

beforeEach(() => {
  useEditorStore.getState().reset();
});

describe("AuthGate", () => {
  it("shows the tool to someone already signed in", async () => {
    render(<AuthGate api={fakeApi()}><p>the survey</p></AuthGate>);
    await waitFor(() => expect(screen.getByText("the survey")).toBeTruthy());
    expect(useEditorStore.getState().user).toEqual(ada);
  });

  it("asks someone signed out to sign in, rather than showing the tool empty", async () => {
    // A signed-out survey used to say the server was probably not running.
    const api = fakeApi({ me: vi.fn().mockRejectedValue(new ApiError(401, null)) });
    render(<AuthGate api={api}><p>the survey</p></AuthGate>);
    await waitFor(() => expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy());
    expect(screen.queryByText("the survey")).toBeNull();
  });

  it("goes straight to the tool that was asked for once signed in", async () => {
    const api = fakeApi({ me: vi.fn().mockRejectedValue(new ApiError(401, null)) });
    render(<AuthGate api={api}><p>the survey</p></AuthGate>);
    await waitFor(() => screen.getByRole("button", { name: /sign in/i }));
    await signInAsAda();
    await waitFor(() => expect(screen.getByText("the survey")).toBeTruthy());
  });

  it("returns to sign-in when the session is dropped mid-use", async () => {
    render(<AuthGate api={fakeApi()}><p>the survey</p></AuthGate>);
    await waitFor(() => screen.getByText("the survey"));
    useEditorStore.getState().setUser(null);
    await waitFor(() => expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy());
  });

  it("keeps the page when a session expires, and asks for a sign-in over it", async () => {
    render(<AuthGate api={fakeApi()}><p>the survey</p></AuthGate>);
    await waitFor(() => screen.getByText("the survey"));
    act(() => useEditorStore.getState().endSession("expired"));
    expect(screen.getByText("the survey")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: /session ended/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    await signInAsAda();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("the survey")).toBeTruthy();
  });

  it("shows the sign-in screen, not the dialog, after signing out on purpose", async () => {
    render(<AuthGate api={fakeApi()}><p>the survey</p></AuthGate>);
    await waitFor(() => screen.getByText("the survey"));
    act(() => useEditorStore.getState().endSession("signed-out"));
    expect(screen.queryByText("the survey")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeTruthy();
  });
});
