import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiToken } from "../api/client";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { ClaudeCode } from "./ClaudeCode";

const SECRET = `oth_pat_${"s".repeat(43)}`;

const tokens: ApiToken[] = [
  { id: "tok_1", name: "Laptop", ownerId: "u_wei", ownerName: "Wei Kang", mayPublish: false, createdAt: "2026-10-03T12:00:00Z", lastUsedAt: null, expiresAt: "2027-01-01T12:00:00Z" },
  { id: "tok_2", name: "Desktop", ownerId: "u_sc", ownerName: "Stef Chan", mayPublish: true, createdAt: "2026-10-04T12:00:00Z", lastUsedAt: new Date(Date.now() - 5 * 60_000).toISOString(), expiresAt: "2027-01-02T12:00:00Z" },
];

const listed = (list: ApiToken[] = tokens) => vi.fn().mockResolvedValue({ tokens: list, mayPublishByDefault: false });

beforeEach(() => {
  useToasts.getState().clear();
});

/** The button waits, disabled, until the list has loaded; a click before that does nothing. */
async function openDialog() {
  const button = await screen.findByRole("button", { name: "Create token" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  return screen.findByRole("dialog");
}

describe("ClaudeCode", () => {
  it("lists everyone's tokens: whose, the name, made, last used and expiry", async () => {
    render(<ClaudeCode api={fakeApi({ listTokens: listed() })} />);
    const wei = await screen.findByRole("row", { name: "Wei Kang: Laptop" });
    expect(within(wei).getByText("3 Oct")).toBeTruthy();
    expect(within(wei).getByText("Never")).toBeTruthy();
    expect(within(wei).getByText("1 Jan")).toBeTruthy();
    const stef = screen.getByRole("row", { name: "Stef Chan: Desktop" });
    expect(within(stef).getByText("5 minutes ago")).toBeTruthy();
    expect(within(stef).getByText("May publish")).toBeTruthy();
  });

  it("says so when there are no tokens yet", async () => {
    render(<ClaudeCode api={fakeApi({ listTokens: listed([]) })} />);
    expect(await screen.findByText("No tokens yet.")).toBeTruthy();
  });

  it("makes a token and shows the command to connect once, with this page's address", async () => {
    const listTokens = listed([]);
    const createToken = vi.fn().mockResolvedValue({ token: tokens[0], secret: SECRET });
    render(<ClaudeCode api={fakeApi({ listTokens, createToken })} />);
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Wei's laptop" } });
    const publish = within(dialog).getByRole("checkbox", { name: "May publish" }) as HTMLInputElement;
    expect(publish.checked).toBe(false);
    // The hint describes the tick rather than lengthening its name.
    expect(publish).toHaveAccessibleDescription(
      "Leave this off unless Claude should publish the map without you. It still can't publish while the map has errors.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Create token" }));

    const command = (await within(dialog).findByLabelText("Command to connect Claude Code")) as HTMLTextAreaElement;
    expect(command.value).toBe(
      `claude mcp add --transport http --scope user oth ${window.location.origin}/mcp --header "Authorization: Bearer ${SECRET}"`,
    );
    expect(createToken).toHaveBeenCalledWith("Wei's laptop", false);
    // Claude Code refuses a second server named oth, so a replacement needs the old one gone first.
    expect(command).toHaveAccessibleDescription("Replacing an old token? Run claude mcp remove oth first.");
    expect(within(dialog).getByText("claude mcp remove oth").tagName).toBe("CODE");
    // Focused and selected, ready to copy; copying itself is still yours to do.
    expect(document.activeElement).toBe(command);
    expect([command.selectionStart, command.selectionEnd]).toEqual([0, command.value.length]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(listTokens).toHaveBeenCalledTimes(2);
  });

  it("can't be closed while the token is being made, so its one showing can't be lost", async () => {
    let answer!: (made: { token: ApiToken; secret: string }) => void;
    const createToken = vi.fn(() => new Promise<{ token: ApiToken; secret: string }>(r => { answer = r; }));
    render(<ClaudeCode api={fakeApi({ listTokens: listed([]), createToken })} />);
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Wei's laptop" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create token" }));
    await waitFor(() => expect(createToken).toHaveBeenCalled());

    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();

    await act(async () => answer({ token: tokens[0]!, secret: SECRET }));
    expect(await within(dialog).findByLabelText("Command to connect Claude Code")).toBeTruthy();
    // Once it is shown, closing is yours again: Escape and × throw it away on purpose.
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("asks for publishing only when it is ticked", async () => {
    const createToken = vi.fn().mockResolvedValue({ token: tokens[1], secret: SECRET });
    render(<ClaudeCode api={fakeApi({ listTokens: listed([]), createToken })} />);
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Nightly" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "May publish" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create token" }));
    await waitFor(() => expect(createToken).toHaveBeenCalledWith("Nightly", true));
  });

  it("copies the command", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // jsdom has no clipboard.
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ClaudeCode api={fakeApi({ listTokens: listed([]), createToken: vi.fn().mockResolvedValue({ token: tokens[0], secret: SECRET }) })} />);
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Wei's laptop" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create token" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "Copy command" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining(SECRET)));
    expect(useToasts.getState().toasts[0]?.message).toBe("Copied. Paste it into a terminal.");
  });

  it("says how to copy it yourself when the browser won't", async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException("Write permission denied.", "NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ClaudeCode api={fakeApi({ listTokens: listed([]), createToken: vi.fn().mockResolvedValue({ token: tokens[0], secret: SECRET }) })} />);
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Laptop" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create token" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "Copy command" }));
    await waitFor(() => expect(useToasts.getState().toasts[0]?.message).toBe(
      "Couldn't copy. Select the command and copy it yourself.",
    ));
    expect(useToasts.getState().toasts[0]?.tone).toBe("error");
    // The command stays on screen to copy by hand.
    expect(within(dialog).getByLabelText("Command to connect Claude Code")).toBeTruthy();
  });

  it("says plainly when you already have five", async () => {
    const createToken = vi.fn().mockRejectedValue(new ApiError(409, {
      error: "You already have 5 Claude Code tokens. Revoke one you no longer use, then make this one.",
    }));
    render(<ClaudeCode api={fakeApi({ listTokens: listed([]), createToken })} />);
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Sixth" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create token" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "You already have 5 Claude Code tokens. Revoke one you no longer use, then make this one.",
    );
  });

  it("revokes anyone's token and refreshes the list", async () => {
    const listTokens = listed();
    const revokeToken = vi.fn().mockResolvedValue(undefined);
    render(<ClaudeCode api={fakeApi({ listTokens, revokeToken })} />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke Stef Chan's Desktop" }));
    await waitFor(() => expect(revokeToken).toHaveBeenCalledWith("tok_2"));
    await waitFor(() => expect(listTokens).toHaveBeenCalledTimes(2));
    expect(useToasts.getState().toasts[0]?.message).toBe("Revoked Stef Chan's Desktop. Claude Code can no longer reach the map with it.");
  });

  it("says it is revoking while it waits, and takes no second click", async () => {
    let done!: () => void;
    const revokeToken = vi.fn(() => new Promise<void>(r => { done = r; }));
    render(<ClaudeCode api={fakeApi({ listTokens: listed(), revokeToken })} />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke Wei Kang's Laptop" }));

    const waiting = await screen.findByRole("button", { name: "Revoking Wei Kang's Laptop…" });
    expect(waiting).toBeDisabled();
    expect(waiting.textContent).toBe("Revoking…");
    fireEvent.click(waiting);
    expect(revokeToken).toHaveBeenCalledTimes(1);

    await act(async () => done());
    expect(await screen.findByRole("button", { name: "Revoke Wei Kang's Laptop" })).toBeEnabled();
  });
});
