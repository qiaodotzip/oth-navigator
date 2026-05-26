import { describe, expect, it } from "vitest";
import type { Service } from "@/data/types";
import type { AdaptedService, RetrieveJourneyResponse } from "@/data/retrieval";
import { resolveLocal, planToJourney, resolveIntent } from "./resolveIntent";

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

  it("defers a non-routable local match to the backend (low-confidence human fallback)", () => {
    const r = resolveLocal("elderly active ageing", services);
    // Non-routable physical services no longer dead-end in a local "Start in
    // App" card — they get a low confidence so resolveIntent falls back to the
    // backend, with a ServiceSG ("human") plan only if the backend is down.
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

describe("resolveIntent (two-tier)", () => {
  it("uses the local result and skips the backend when confident", async () => {
    let called = false;
    const fetchJourney = async (): Promise<RetrieveJourneyResponse> => {
      called = true;
      return okJourney([]);
    };
    const plan = await resolveIntent("library", services, [], undefined, fetchJourney);
    expect(plan.kind).toBe("destination");
    expect(called).toBe(false);
  });

  it("defers a non-routable local match to the backend (single physical stop → destination)", async () => {
    const fetchJourney = async (): Promise<RetrieveJourneyResponse> =>
      okJourney([
        {
          service: adapted({ id: "MSF-001", nameEn: "ComCare", floorId: "L1", roomId: "L1-room-psc", displayFloor: "L1" }),
          reason: "Speak to a social worker.",
        },
      ]);
    // "elderly active ageing" matches the non-routable active-ageing locally;
    // it must NOT short-circuit to a local card — the backend result wins.
    const plan = await resolveIntent("elderly active ageing", services, [], undefined, fetchJourney);
    expect(plan.kind).toBe("destination");
    if (plan.kind === "destination") expect(plan.stop.serviceId).toBe("MSF-001");
  });

  it("builds a multi-stop journey from multiple backend stops (carrying reasons + order)", async () => {
    const fetchJourney = async (): Promise<RetrieveJourneyResponse> =>
      okJourney([
        {
          service: adapted({ id: "HDB-001", nameEn: "HDB", floorId: "L2", roomId: "L2-room-hdb-office", displayFloor: "L2" }),
          reason: "Mortgage help",
        },
        {
          service: adapted({ id: "MSF-001", nameEn: "ComCare", floorId: "L1", roomId: "L1-room-psc", displayFloor: "L1" }),
          reason: "Daily expenses",
        },
      ]);
    const plan = await resolveIntent("zxcvbnm qwerty unknown", services, [], undefined, fetchJourney);
    expect(plan.kind).toBe("journey");
    if (plan.kind === "journey") {
      expect(plan.stops.map(s => s.serviceId)).toEqual(["HDB-001", "MSF-001"]);
      expect(plan.stops[0].reason?.en).toBe("Mortgage help");
    }
  });

  it("maps a single Digital_Hotline backend stop to an offsite Plan", async () => {
    const fetchJourney = async (): Promise<RetrieveJourneyResponse> =>
      okJourney([{ service: adapted({ id: "CPF-001", locationType: "Digital_Hotline" }), reason: "Apply online." }]);
    const plan = await resolveIntent("zxcvbnm qwerty unknown", services, [], undefined, fetchJourney);
    expect(plan.kind).toBe("offsite");
  });

  it("gracefully falls back to the local plan when the backend errors", async () => {
    const fetchJourney = async (): Promise<RetrieveJourneyResponse> => {
      throw new Error("backend down");
    };
    const plan = await resolveIntent("zxcvbnm qwerty unknown", services, [], undefined, fetchJourney);
    expect(plan.kind).toBe("human");
  });

  it("returns the local plan when the backend signals low confidence", async () => {
    const fetchJourney = async (): Promise<RetrieveJourneyResponse> =>
      okJourney([], { confidenceLow: true });
    const plan = await resolveIntent("zxcvbnm qwerty unknown", services, [], undefined, fetchJourney);
    expect(plan.kind).toBe("human");
  });
});
