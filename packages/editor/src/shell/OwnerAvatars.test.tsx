import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { sampleTeam } from "../testing/fakeApi";
import { OwnerAvatars } from "./OwnerAvatars";

beforeEach(() => useEditorStore.getState().reset());

describe("OwnerAvatars", () => {
  it("names an owner who is on the team", () => {
    useEditorStore.getState().setTeam(sampleTeam);
    render(<OwnerAvatars ids={["u_sc"]} />);
    expect(screen.getByRole("img", { name: "Stef Chan" }).textContent).toBe("SC");
  });

  it("shows an owner as a glyph, not initials, while the team is still loading", () => {
    render(<OwnerAvatars ids={["u_sc"]} />);
    const owner = screen.getByRole("img", { name: "Owner – name not loaded" });
    // "TM" read as a real teammate; a glyph does not.
    expect(owner.textContent).toBe("");
  });

  it("says the same when the team failed to load", () => {
    useEditorStore.getState().setTeamLoadError();
    render(<OwnerAvatars ids={["u_sc"]} />);
    expect(screen.getByRole("img", { name: "Owner – name not loaded" })).toBeTruthy();
  });

  it("calls someone no longer on the team a former teammate, once the team has loaded", () => {
    useEditorStore.getState().setTeam([]);
    render(<OwnerAvatars ids={["u_gone"]} />);
    expect(screen.getByRole("img", { name: "Former teammate" })).toBeTruthy();
  });
});
