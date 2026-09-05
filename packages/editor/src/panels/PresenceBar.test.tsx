import { parseModel } from "@oth/model";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { PresenceBar } from "./PresenceBar";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
});

const me = { id: "user_me", email: "me@example.com", displayName: "Stef" };

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setUser(me);
  useEditorStore.getState().setModel(model);
});

describe("PresenceBar", () => {
  it("shows nothing when I am the only one here", () => {
    // A chip reading "just you" is noise; silence is the right answer.
    useEditorStore.getState().setPresence([
      { userId: "user_me", displayName: "Stef", levelId: "oth-L1" },
    ]);
    const { container } = render(<PresenceBar />);
    expect(container.textContent).toBe("");
  });

  it("names everyone else who is here, and not me", () => {
    useEditorStore.getState().setPresence([
      { userId: "user_me", displayName: "Stef", levelId: "oth-L1" },
      { userId: "user_wei", displayName: "Wei", levelId: "oth-L2" },
    ]);
    render(<PresenceBar />);
    expect(screen.getByText(/Wei/)).toBeTruthy();
    expect(screen.queryByText(/Stef/)).toBeNull();
  });

  it("says which floor they are on, by its code not its id", () => {
    useEditorStore.getState().setPresence([
      { userId: "user_wei", displayName: "Wei", levelId: "oth-L2" },
    ]);
    render(<PresenceBar />);
    expect(screen.getByTestId("presence-user_wei").textContent).toContain("L2");
  });

  it("copes with someone who is on no level yet", () => {
    useEditorStore.getState().setPresence([
      { userId: "user_wei", displayName: "Wei", levelId: null },
    ]);
    render(<PresenceBar />);
    expect(screen.getByTestId("presence-user_wei")).toBeTruthy();
  });

  it("falls back to the level id if the model does not know it", () => {
    useEditorStore.getState().setPresence([
      { userId: "user_wei", displayName: "Wei", levelId: "oth-L9" },
    ]);
    render(<PresenceBar />);
    expect(screen.getByTestId("presence-user_wei").textContent).toContain("oth-L9");
  });
});
