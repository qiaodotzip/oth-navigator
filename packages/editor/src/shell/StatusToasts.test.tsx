import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { useToasts } from "../ui/toast";
import { looksLikeError, StatusToasts } from "./StatusToasts";

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
});

describe("StatusToasts", () => {
  it("turns a status message into a toast and clears it", () => {
    render(<StatusToasts />);
    act(() => useEditorStore.getState().setStatus("Scale set to 0.2100 m per pixel."));
    expect(useToasts.getState().toasts[0]).toMatchObject({ message: "Scale set to 0.2100 m per pixel.", tone: "info" });
    expect(useEditorStore.getState().status).toBeNull();
  });

  it("shows a failure as an error", () => {
    render(<StatusToasts />);
    act(() => useEditorStore.getState().setStatus("api error 422"));
    expect(useToasts.getState().toasts[0]!.tone).toBe("error");
  });
});

describe("looksLikeError", () => {
  it("recognises the ways the old panels report failure", () => {
    expect(looksLikeError("Can't reach the server. Check your connection and reload the page.")).toBe(true);
    expect(looksLikeError("The server refused to load the map (HTTP 500).")).toBe(true);
    expect(looksLikeError("New lift placed.")).toBe(false);
  });
});
