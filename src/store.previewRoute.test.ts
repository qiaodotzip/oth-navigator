import { describe, expect, it, beforeEach } from "vitest";
import { useStore } from "./store";
import type { RouteVariant } from "@/data/types";

function fakeVariant(): RouteVariant {
  return {
    serviceId: "hdb",
    profile: "stepFree",
    steps: [
      { floorId: "L1", point: [10, 10], decisionPoint: false, segmentKey: "start" },
      { floorId: "L1", point: [20, 10], decisionPoint: true, segmentKey: "lift" },
    ],
  };
}

describe("previewRoute", () => {
  beforeEach(() => {
    useStore.getState().endRoute();
  });

  it("shows the route on the map in orbit view (no GPS follow, no nav UI flag)", () => {
    useStore.getState().previewRoute(fakeVariant());
    const s = useStore.getState();
    expect(s.activeRoute?.variant.serviceId).toBe("hdb"); // route drawn
    expect(s.routePreview).toBe(true); // preview, not navigation
    expect(s.cameraFollow).toBe(false); // stays in orbit/map view
    expect(s.inspectMode).toBe(true); // orbit controls on
  });

  it("startRoute clears the preview flag (real navigation)", () => {
    useStore.getState().previewRoute(fakeVariant());
    useStore.getState().startRoute(fakeVariant());
    const s = useStore.getState();
    expect(s.routePreview).toBe(false);
    expect(s.cameraFollow).toBe(true);
  });

  it("endRoute clears both the route and the preview flag", () => {
    useStore.getState().previewRoute(fakeVariant());
    useStore.getState().endRoute();
    const s = useStore.getState();
    expect(s.activeRoute).toBeNull();
    expect(s.routePreview).toBe(false);
  });
});
