import { describe, expect, it } from "vitest";
import type { Service } from "@/data/types";
import type { AdaptedService, RetrieveJourneyResponse } from "@/data/retrieval";
import { resolveLocal, planToJourney, planFromJourneyStops } from "./resolveIntent";

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

  it("gives a non-routable local match a low-confidence human (ServiceSG) plan", () => {
    const r = resolveLocal("elderly active ageing", services);
    // Non-routable physical services don't dead-end in a local "Start in App"
    // card — they point at the ServiceSG counter as a soft local guess. The
    // rich answer comes from the chatbot's journey (rendered via the poller).
    expect(r.plan.kind).toBe("human");
    expect(r.confidence).toBeLessThan(0.7);
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

function adapted(over: Partial<AdaptedService> & { id: string }): AdaptedService {
  return {
    id: over.id,
    nameEn: over.nameEn ?? over.id,
    nameZh: over.nameZh ?? over.id,
    providerName: "A",
    category: "government",
    routable: true,
    displayFloor: over.displayFloor ?? "L1",
    floorId: over.floorId,
    roomId: over.roomId,
    accessibility: { liftAccess: true, stepFreeRoute: true },
    sourceUrl: "https://x",
    iconKey: "info",
    relevanceScore: 1,
    justification: null,
    locationType: over.locationType ?? "Physical_OTH",
    othLocation: "",
    operatingHours: over.operatingHours ?? {},
    contact: { phone: null, email: null, website: null },
    requiredDocuments: over.requiredDocuments ?? [],
    richDescription: "",
  };
}

function okJourney(
  stops: RetrieveJourneyResponse["stops"],
  over: Partial<RetrieveJourneyResponse> = {},
): RetrieveJourneyResponse {
  return { summary: null, confidenceLow: false, stops, ...over };
}

describe("planFromJourneyStops", () => {
  it("maps a single physical stop to a destination, carrying docs + reason", () => {
    const plan = planFromJourneyStops(
      okJourney([
        {
          service: adapted({
            id: "HDB-001",
            nameEn: "HDB Scheme",
            floorId: "L2",
            roomId: "L2-room-hdb-office",
            displayFloor: "L2",
            requiredDocuments: [{ name: "NRIC", required_if: null, notes: null }],
          }),
          reason: "Mortgage help",
        },
      ]),
    );
    expect(plan.kind).toBe("destination");
    if (plan.kind === "destination") {
      expect(plan.stop.serviceId).toBe("HDB-001");
      expect(plan.stop.roomId).toBe("L2-room-hdb-office");
      expect(plan.stop.requiredDocuments?.[0].name).toBe("NRIC");
      expect(plan.stop.reason?.en).toBe("Mortgage help");
    }
  });

  it("maps a single Digital_Hotline stop to an offsite Plan", () => {
    const plan = planFromJourneyStops(
      okJourney([{ service: adapted({ id: "CPF-001", locationType: "Digital_Hotline" }), reason: "Apply online." }]),
    );
    expect(plan.kind).toBe("offsite");
  });

  it("builds a multi-stop journey (order, per-stop reasons, title)", () => {
    const plan = planFromJourneyStops(
      okJourney(
        [
          {
            service: adapted({ id: "HDB-001", nameEn: "HDB", floorId: "L2", roomId: "L2-room-hdb-office", displayFloor: "L2" }),
            reason: "Mortgage help",
          },
          {
            service: adapted({ id: "MSF-001", nameEn: "ComCare", floorId: "L1", roomId: "L1-room-psc", displayFloor: "L1" }),
            reason: "Daily expenses",
          },
        ],
        { summary: "Your plan" },
      ),
    );
    expect(plan.kind).toBe("journey");
    if (plan.kind === "journey") {
      expect(plan.stops.map(s => s.serviceId)).toEqual(["HDB-001", "MSF-001"]);
      expect(plan.stops[0].reason?.en).toBe("Mortgage help");
      expect(plan.title?.en).toBe("Your plan");
    }
  });
});
