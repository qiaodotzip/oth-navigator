import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError, type Api } from "../api/client";
import { LoginScreen, signInError } from "./LoginScreen";

describe("signInError", () => {
  it("says the credentials were wrong when the server says so", () => {
    expect(signInError(new ApiError(401, null))).toMatch(/incorrect/i);
  });

  it("does not blame the credentials when the server cannot be reached", () => {
    // A stopped server used to read as a wrong password, which sent someone to
    // reset a password that was never the problem.
    expect(signInError(new TypeError("Failed to fetch"))).toMatch(/reach the server/i);
  });

  it("names the status for any other refusal, so it can be looked up", () => {
    expect(signInError(new ApiError(500, null))).toContain("500");
  });

  it("treats an unrecognised throw as unreachable rather than as bad credentials", () => {
    expect(signInError("something odd")).toMatch(/reach the server/i);
  });
});

describe("LoginScreen", () => {
  function setup(login: () => Promise<never> | Promise<unknown>) {
    const onSignedIn = vi.fn();
    render(<LoginScreen api={{ login } as unknown as Api} onSignedIn={onSignedIn} />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    return { onSignedIn };
  }

  it("tells you the server is down when it is", async () => {
    setup(() => Promise.reject(new TypeError("Failed to fetch")));
    await waitFor(() => expect(screen.getByText(/reach the server/i)).toBeTruthy());
  });

  it("still tells you when the password really is wrong", async () => {
    setup(() => Promise.reject(new ApiError(401, null)));
    await waitFor(() => expect(screen.getByText(/incorrect/i)).toBeTruthy());
  });

  it("signs in when the server accepts", async () => {
    const { onSignedIn } = setup(() =>
      Promise.resolve({ id: "u1", email: "a@b.com", displayName: "A" }),
    );
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
  });
});
