import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApi } from "../api/client";
import { useEditorStore } from "../state/store";
import { useToasts } from "../ui/toast";
import { PublishButton } from "./PublishButton";

const REPORT_OK = { issues: [], errorCount: 0, warningCount: 0, ok: true };

function unauthorizedFetch() {
  return vi.fn(async () =>
    new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
  );
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
  useEditorStore.getState().setUser({ id: "u1", email: "ada@oth.local", displayName: "Ada" });
  useEditorStore.getState().setReport(REPORT_OK);
});

describe("PublishButton", () => {
  // I2: a direct write's 401 must end the session, not read as a network
  // problem — the api's onUnauthorized hook is exactly how main.tsx wires it.
  it("ends the session on a 401 from Publish, with no 'check your connection' toast", async () => {
    const api = createApi({
      fetchImpl: unauthorizedFetch(),
      onUnauthorized: () => {
        if (useEditorStore.getState().user) useEditorStore.getState().endSession("expired");
      },
    });
    render(<PublishButton api={api} />);

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(useEditorStore.getState().sessionEnd).toBe("expired"));
    expect(useEditorStore.getState().user).toBeNull();
    expect(useToasts.getState().toasts.some(t => /check your connection/i.test(t.message))).toBe(false);
  });
});
