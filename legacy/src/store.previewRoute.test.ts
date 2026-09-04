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

  it("shows the route on the map in orbit view, tagged with the demo kind", () => {
    useStore.getState().previewRoute(fakeVariant());
    const s = useStore.getState();
    expect(s.activeRoute?.variant.serviceId).toBe("hdb"); // route drawn
    expect(s.routePreview).toBe("crowd"); // default kind
    expect(s.cameraFollow).toBe(false); // stays in orbit/map view
    expect(s.inspectMode).toBe(true); // orbit controls on
  });

  it("records the requested preview kind", () => {
    useStore.getState().previewRoute(fakeVariant(), "access");
    expect(useStore.getState().routePreview).toBe("access");
  });

  it("startRoute clears the preview flag (real navigation)", () => {
    useStore.getState().previewRoute(fakeVariant());
    useStore.getState().startRoute(fakeVariant());
    const s = useStore.getState();
    expect(s.routePreview).toBeNull();
    expect(s.cameraFollow).toBe(true);
  });

  it("endRoute clears both the route and the preview flag", () => {
    useStore.getState().previewRoute(fakeVariant());
    useStore.getState().endRoute();
    const s = useStore.getState();
    expect(s.activeRoute).toBeNull();
    expect(s.routePreview).toBeNull();
  });
});
