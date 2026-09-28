import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { TokenNotices } from "./TokenNotices";

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
});

describe("TokenNotices", () => {
  it("tells you once about a token made in your name, and stays until dismissed, with Revoke", async () => {
    const api = fakeApi({
      claimTokenNotices: vi.fn().mockResolvedValue([{ id: "tok_1", name: "Wei's laptop", createdAt: "2026-10-03T12:00:00Z" }]),
    });
    useEditorStore.getState().setUser({ id: "u_wei", email: "wei@oth.local", displayName: "Wei Kang" });
    render(<TokenNotices api={api} />);
    await waitFor(() =>
      expect(useToasts.getState().toasts[0]?.message).toBe("A Claude Code token, Wei's laptop, was made in your name on 3 Oct."),
    );
    const shown = useToasts.getState().toasts[0]!;
    expect(shown.durationMs).toBeNull();
    await shown.action!.run();
    expect(api.revokeToken).toHaveBeenCalledWith("tok_1");
  });

  it("asks nothing while you are signed out", () => {
    const api = fakeApi();
    render(<TokenNotices api={api} />);
    expect(api.claimTokenNotices).not.toHaveBeenCalled();
  });
});
