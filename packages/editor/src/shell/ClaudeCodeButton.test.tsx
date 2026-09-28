import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiToken } from "../api/client";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { ClaudeCodeButton } from "./ClaudeCodeButton";

const me = { id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" };
const SECRET = `oth_pat_${"s".repeat(43)}`;

/** One of mine, live until 1 Jan 2099 and never used, unless a test says otherwise. */
const token = (over: Partial<ApiToken> = {}): ApiToken => ({
  id: "tok_1", name: "Laptop", ownerId: "u_sc", ownerName: "Stef Chan", mayPublish: false,
  createdAt: "2026-09-01T12:00:00Z", lastUsedAt: null, expiresAt: "2099-01-01T12:00:00Z", ...over,
});
const weis = token({ id: "tok_w", name: "Desktop", ownerId: "u_wei", ownerName: "Wei Kang" });
const expired = token({ id: "tok_x", name: "Old laptop", expiresAt: "2020-01-01T12:00:00Z" });

const listed = (tokens: ApiToken[]) => vi.fn().mockResolvedValue({ tokens, mayPublishByDefault: false });

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setUser(me);
  window.history.pushState({}, "", "/floors");
});

const button = () => screen.getByRole("button", { name: "Claude Code" });

async function openPanel() {
  fireEvent.click(button());
  return screen.findByRole("dialog");
}

describe("ClaudeCodeButton", () => {
  it("shows no dot while you have no live token of your own", async () => {
    // Wei's token is his, and mine has run out.
    const listTokens = listed([weis, expired]);
    render(<ClaudeCodeButton api={fakeApi({ listTokens })} />);
    await waitFor(() => expect(listTokens).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(button()).not.toHaveAccessibleDescription();
    expect(button().querySelector("[data-dot]")).toBeNull();
  });

  it("shows a dot, said in words too, once you have a live token", async () => {
    render(<ClaudeCodeButton api={fakeApi({ listTokens: listed([token()]) })} />);
    await waitFor(() => expect(button()).toHaveAccessibleDescription("You have a live token."));
    expect(button().querySelector("[data-dot]")).not.toBeNull();
  });

  it("loads your tokens once for the dot, then again each time the panel opens", async () => {
    const listTokens = listed([]);
    render(<ClaudeCodeButton api={fakeApi({ listTokens })} />);
    await waitFor(() => expect(listTokens).toHaveBeenCalledTimes(1));
    await openPanel();
    await waitFor(() => expect(listTokens).toHaveBeenCalledTimes(2));
  });

  it("gives the three steps to connect, what to ask, and where its work lands", async () => {
    render(<ClaudeCodeButton api={fakeApi()} />);
    const panel = await openPanel();
    const steps = within(within(panel).getByRole("list", { name: "Steps" })).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent("Create a token.");
    expect(steps[0]).toHaveTextContent(
      "Leave May publish off unless Claude should publish without you. It still can't publish while the map has errors.",
    );
    expect(within(steps[0]!).getByRole("button", { name: "Create token" })).toBeTruthy();
    expect(steps[1]).toHaveTextContent("Copy the command and paste it into a terminal.");
    expect(steps[1]).toHaveTextContent("Copy command");
    expect(steps[2]).toHaveTextContent("Start Claude Code and run /mcp.");
    expect(steps[2]).toHaveTextContent("You should see oth connected.");
    expect(within(steps[2]!).getByText("/mcp").tagName).toBe("CODE");

    expect(within(panel).getByText(/Tag the frames in the Gate 4 walkthrough/)).toBeTruthy();
    expect(within(panel).getByText(/Which L1 rooms have no place yet\?/)).toBeTruthy();
    expect(within(panel).getByText("Its places and tags arrive as proposals in Review.")).toBeTruthy();
    expect(within(panel).getByText("claude mcp remove oth").tagName).toBe("CODE");
    expect(within(panel).getByText("claude mcp remove oth").parentElement).toHaveTextContent(
      "Replacing a token? Run claude mcp remove oth first.",
    );
    // No tokens of yours yet: nothing to list, and nothing to revoke from here.
    expect(within(panel).queryByRole("table")).toBeNull();
  });

  it("makes a token with the Team page's dialog, then shows it and the dot", async () => {
    const made = token({ name: "Home PC" });
    const listTokens = vi.fn()
      .mockResolvedValueOnce({ tokens: [], mayPublishByDefault: false })
      .mockResolvedValueOnce({ tokens: [], mayPublishByDefault: false })
      .mockResolvedValue({ tokens: [made], mayPublishByDefault: false });
    const createToken = vi.fn().mockResolvedValue({ token: made, secret: SECRET });
    render(<ClaudeCodeButton api={fakeApi({ listTokens, createToken })} />);
    const panel = await openPanel();
    const create = within(panel).getByRole("button", { name: "Create token" });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);

    const dialog = await screen.findByRole("dialog", { name: "Create a Claude Code token" });
    // The panel steps aside for the dialog rather than sitting under it.
    await waitFor(() => expect(screen.queryByRole("list", { name: "Steps" })).toBeNull());
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Home PC" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create token" }));
    expect(await within(dialog).findByLabelText("Command to connect Claude Code")).toBeTruthy();
    expect(createToken).toHaveBeenCalledWith("Home PC", false);
    await waitFor(() => expect(listTokens).toHaveBeenCalledTimes(3));

    // Done brings you back to the steps, with step 3 still to do and the new token listed.
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Create a Claude Code token" })).toBeNull());
    const back = await screen.findByRole("dialog");
    expect(within(back).getByRole("list", { name: "Steps" })).toBeTruthy();
    expect(within(back).getByRole("row", { name: "Home PC" })).toBeTruthy();
    expect(button()).toHaveAccessibleDescription("You have a live token.");
    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  it("lists your own live tokens: the name, when last used and the expiry, and sends you to Team to revoke", async () => {
    const desktop = token({ id: "tok_2", name: "Desktop", lastUsedAt: new Date(Date.now() - 5 * 60_000).toISOString() });
    render(<ClaudeCodeButton api={fakeApi({ listTokens: listed([token(), desktop, weis, expired]) })} />);
    const panel = await openPanel();
    const table = await within(panel).findByRole("table", { name: "Your tokens" });
    const laptop = within(table).getByRole("row", { name: "Laptop" });
    expect(within(laptop).getByText("Never")).toBeTruthy();
    expect(within(laptop).getByText("1 Jan")).toBeTruthy();
    expect(within(within(table).getByRole("row", { name: "Desktop" })).getByText("5 minutes ago")).toBeTruthy();
    // Only mine, and only live ones: not Wei's Desktop, not my expired laptop.
    expect(within(table).getAllByRole("row")).toHaveLength(3); // header + two
    expect(within(table).queryByText("Old laptop")).toBeNull();
    expect(within(panel).queryByRole("button", { name: /revoke/i })).toBeNull();
    expect(within(panel).getByRole("link", { name: "Team → Claude Code" }).getAttribute("href")).toBe("/team#claude-code");
  });

  it("closes and goes to the Claude Code section of the Team page", async () => {
    const section = document.createElement("h2");
    section.id = "claude-code";
    section.scrollIntoView = vi.fn();
    document.body.append(section);
    render(<ClaudeCodeButton api={fakeApi({ listTokens: listed([token()]) })} />);
    const panel = await openPanel();
    fireEvent.click(await within(panel).findByRole("link", { name: "Team → Claude Code" }));
    expect(window.location.pathname).toBe("/team");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(section.scrollIntoView).toHaveBeenCalled());
    section.remove();
  });

  it("says so in one line when your tokens can't be loaded, and still gives the steps", async () => {
    render(<ClaudeCodeButton api={fakeApi({ listTokens: vi.fn().mockRejectedValue(new ApiError(500, null)) })} />);
    const panel = await openPanel();
    expect((await within(panel).findByRole("alert")).textContent).toBe("Couldn't load your tokens. Check your connection and try again.");
    expect(within(panel).getByRole("list", { name: "Steps" })).toBeTruthy();
  });

  it("leaves a 401 to the session-ended dialog", async () => {
    const listTokens = vi.fn().mockRejectedValue(new ApiError(401, null));
    render(<ClaudeCodeButton api={fakeApi({ listTokens })} />);
    const panel = await openPanel();
    await waitFor(() => expect(listTokens).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(within(panel).queryByRole("alert")).toBeNull();
  });

  it("does not spring open by itself after the session ends with it open and you sign back in", async () => {
    render(<ClaudeCodeButton api={fakeApi()} />);
    await openPanel();
    act(() => useEditorStore.getState().endSession("expired"));
    act(() => useEditorStore.getState().setUser(me));
    await act(async () => {});
    expect(screen.queryByRole("list", { name: "Steps" })).toBeNull();
  });
});
