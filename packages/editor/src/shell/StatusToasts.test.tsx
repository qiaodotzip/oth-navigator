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

  it("classifies all current failure and notice messages correctly", () => {
    // Failure messages from calibration validation (plan/calibration.ts)
    const failures = [
      "the real distance must be greater than zero",
      "draw a line with some length before entering a distance",
      // From PathwayKindsPanel blocking deletion
      '"Covered walkway" is on 3 walkway(s). Change those first, so none is left pointing at a type that is gone.',
      // From placePoint.ts — entrance and portal placement refusals
      "An entrance goes inside an area. Click inside one, or draw the area first.",
      "A lift or stair stops inside an area or room. Click inside one.",
      // From save.ts — server errors
      "The server refused to load the map (HTTP 500). Try reloading the page.",
      "Can't reach the server. Check your connection and reload the page.",
      // Generic error messages
      "api error 422",
    ];
    failures.forEach(msg => {
      expect(looksLikeError(msg)).toBe(true);
    });

    // Success/notice messages (should not match)
    const notices = [
      "Added floorplan.png. Now set the scale.",
      "Scale set to 0.2100 m per pixel.",
      "Uploaded model.glb.",
      "Exported 3 rooms. The context geometry is in the world origin; place it at 0,0 in Blender or Rhino.",
      "Imported 5 of 12 polylines from data.dxf.",
      "Published 42 (3 warnings).",
      "New lift placed. Switch level and click its dashed outline to add its next stop.",
      "Joined the lift or stair already at this spot on another level.",
      "Select a room or detail first.",
    ];
    notices.forEach(msg => {
      expect(looksLikeError(msg)).toBe(false);
    });
  });
});
