import { describe, expect, it } from "vitest";
import type { Service } from "@/data/types";
import { resolveLocal, planToJourney } from "./resolveIntent";

function svc(over: Partial<Service> & { id: string }): Service {
  return {
    id: over.id,
    nameEn: over.nameEn ?? over.id,
    nameZh: over.nameZh ?? over.id,
    providerName: "P",
    category: "government",
    routable: over.routable ?? true,
    displayFloor: over.displayFloor ?? "L1",
    floorId: over.floorId,
    roomId: over.roomId,
    accessibility: { liftAccess: true, stepFreeRoute: true },
    sourceUrl: "https://x",
    iconKey: "info",
  };
}

const services: Service[] = [
  svc({ id: "servicesg", nameEn: "ServiceSG Centre", routable: true, floorId: "L1", roomId: "L1-room-psc", displayFloor: "L1" }),
  svc({ id: "library", nameEn: "Library", routable: true, floorId: "L2", roomId: "L2-room-library", displayFloor: "L2" }),
  svc({ id: "active-ageing", nameEn: "Active Ageing", routable: false, displayFloor: "L4" }),
];

describe("resolveLocal", () => {
  it("maps a passport intent to a routable destination Plan", () => {
    const { plan } = resolveLocal("I need to renew my passport", services);
    expect(plan.kind).toBe("destination");
    if (plan.kind === "destination") expect(plan.stop.serviceId).toBe("servicesg");
  });

  it("maps a non-routable service to an offsite (Start in App) Plan", () => {
    const { plan } = resolveLocal("elderly active ageing", services);
    expect(plan.kind).toBe("offsite");
  });

  it("falls back to a human Plan (ServiceSG) on no match", () => {
    const { plan } = resolveLocal("asdfghjkl nonsense", services);
    expect(plan.kind).toBe("human");
    if (plan.kind === "human") expect(plan.stop.serviceId).toBe("servicesg");
  });

  it("planToJourney numbers stops in order", () => {
    const j = planToJourney({
      kind: "journey",
      stops: [
        { serviceId: "servicesg", name: { en: "A", zh: "A" } },
        { serviceId: "library", name: { en: "B", zh: "B" } },
      ],
    });
    expect(j.stops.map(s => s.order)).toEqual([0, 1]);
    expect(j.stops[1].serviceId).toBe("library");
  });
});
