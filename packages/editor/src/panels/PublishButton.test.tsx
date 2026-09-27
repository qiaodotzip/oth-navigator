import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Api } from "../api/client";
import { useEditorStore } from "../state/store";
import { PublishButton } from "./PublishButton";

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setReport({ issues: [], errorCount: 0, warningCount: 0, ok: true });
});

describe("the old editor's PublishButton", () => {
  it("leaves an expired session to the sign-in dialog instead of showing a raw 401", async () => {
    const publish = vi.fn(async () => { throw new ApiError(401, null); });
    render(<PublishButton api={{ publish } as unknown as Api} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(publish).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(useEditorStore.getState().status).toBeNull();
  });
});
