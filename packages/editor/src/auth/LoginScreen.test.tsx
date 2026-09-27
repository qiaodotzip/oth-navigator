import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Api } from "../api/client";
import { LoginScreen, signInError } from "./LoginScreen";

const ada = { id: "u_ada", displayName: "Ada" };
const wei = { id: "u_wei", displayName: "Wei" };

beforeEach(() => {
  localStorage.clear();
});

describe("signInError", () => {
  it("shows the server's own message", () => {
    expect(signInError(new ApiError(401, { error: "Pick your name from the list." })))
      .toBe("Pick your name from the list.");
  });

  it("does not blame the connection when the server did answer", () => {
    expect(signInError(new ApiError(500, null))).toContain("500");
  });

  it("does not blame the server's message when it cannot be reached", () => {
    // A stopped server used to read as a rejected sign-in, which sent someone
    // looking for a mistake that was never theirs to make.
    expect(signInError(new TypeError("Failed to fetch"))).toMatch(/reach the server/i);
  });

  it("treats an unrecognised throw as unreachable rather than as a refusal", () => {
    expect(signInError("something odd")).toMatch(/reach the server/i);
  });
});

function fakeApi(overrides: Partial<Record<keyof Api, unknown>> = {}) {
  return {
    people: vi.fn().mockResolvedValue([ada, wei]),
    login: vi.fn().mockResolvedValue(ada),
    ...overrides,
  } as unknown as Api;
}

describe("LoginScreen", () => {
  it("says it's loading before the team arrives", async () => {
    let resolvePeople!: (people: typeof ada[]) => void;
    const api = fakeApi({ people: vi.fn(() => new Promise(res => { resolvePeople = res; })) });
    render(<LoginScreen api={api} onSignedIn={vi.fn()} />);
    expect(screen.getByText(/loading the team/i)).toBeTruthy();
    resolvePeople([ada]);
    await waitFor(() => expect(screen.queryByText(/loading the team/i)).toBeNull());
  });

  it("says so, without mentioning a terminal, when nobody is on the team yet", async () => {
    const api = fakeApi({ people: vi.fn().mockResolvedValue([]) });
    render(<LoginScreen api={api} onSignedIn={vi.fn()} />);
    const message = await screen.findByText(/no one is on the team yet/i);
    expect(message.textContent).not.toMatch(/terminal|command|cli|npm/i);
  });

  it("says the server can't be reached when the team can't be loaded", async () => {
    const api = fakeApi({ people: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    render(<LoginScreen api={api} onSignedIn={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/reach the server/i)).toBeTruthy());
  });

  it("lists everyone by name, with a placeholder and Sign in disabled when nobody is remembered", async () => {
    render(<LoginScreen api={fakeApi()} onSignedIn={vi.fn()} />);
    const select = await screen.findByLabelText(/who are you/i);
    expect(screen.getByRole("option", { name: "Pick your name" })).toBeTruthy();
    expect(select).toHaveValue("");
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDisabled();
  });

  it("enables Sign in once a name is picked", async () => {
    render(<LoginScreen api={fakeApi()} onSignedIn={vi.fn()} />);
    const select = await screen.findByLabelText(/who are you/i);
    fireEvent.change(select, { target: { value: "u_wei" } });
    expect(screen.getByRole("button", { name: /sign in/i })).toBeEnabled();
  });

  it("pre-selects whoever last signed in on this browser", async () => {
    localStorage.setItem("oth-map.last-signed-in-user-id", "u_wei");
    render(<LoginScreen api={fakeApi()} onSignedIn={vi.fn()} />);
    const select = await screen.findByLabelText(/who are you/i);
    expect(select).toHaveValue("u_wei");
    expect(screen.queryByRole("option", { name: "Pick your name" })).toBeNull();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeEnabled();
  });

  it("falls back to the placeholder when the remembered id is no longer on the team", async () => {
    localStorage.setItem("oth-map.last-signed-in-user-id", "u_gone");
    render(<LoginScreen api={fakeApi()} onSignedIn={vi.fn()} />);
    const select = await screen.findByLabelText(/who are you/i);
    expect(select).toHaveValue("");
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDisabled();
  });

  it("signs in with the chosen id and remembers it for next time", async () => {
    const onSignedIn = vi.fn();
    const login = vi.fn().mockResolvedValue(wei);
    render(<LoginScreen api={fakeApi({ login })} onSignedIn={onSignedIn} />);
    const select = await screen.findByLabelText(/who are you/i);
    fireEvent.change(select, { target: { value: "u_wei" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(wei));
    expect(login).toHaveBeenCalledWith("u_wei");
    expect(localStorage.getItem("oth-map.last-signed-in-user-id")).toBe("u_wei");
  });

  it("shows the server's own message when a sign-in is refused", async () => {
    const api = fakeApi({
      login: vi.fn().mockRejectedValue(new ApiError(401, { error: "Pick your name from the list." })),
    });
    render(<LoginScreen api={api} onSignedIn={vi.fn()} />);
    const select = await screen.findByLabelText(/who are you/i);
    fireEvent.change(select, { target: { value: "u_wei" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Pick your name from the list."));
  });
});
