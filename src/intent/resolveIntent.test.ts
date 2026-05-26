import { describe, expect, it } from "vitest";
import type { Service } from "@/data/types";
import type { AdaptedService, RetrieveResponse } from "@/data/retrieval";
import { resolveLocal, planToJourney, planFromRetrieval, resolveIntent } from "./resolveIntent";

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

describe("planFromRetrieval", () => {
  it("maps a top physical result to a destination, carrying documents", () => {
    const resp: RetrieveResponse = {
      services: [
        adapted({
          id: "HDB-001",
          nameEn: "HDB Scheme",
          floorId: "L2",
          roomId: "L2-room-hdb-office",
          displayFloor: "L2",
          requiredDocuments: [{ name: "NRIC", required_if: null, notes: null }],
        }),
      ],
      confidenceLow: false,
      decomposition: [],
    };
    const plan = planFromRetrieval(resp);
    expect(plan.kind).toBe("destination");
    if (plan.kind === "destination") {
      expect(plan.stop.roomId).toBe("L2-room-hdb-office");
      expect(plan.stop.requiredDocuments?.[0].name).toBe("NRIC");
    }
  });

  it("maps a Digital_Hotline top result to an offsite Plan", () => {
    const resp: RetrieveResponse = {
      services: [adapted({ id: "CPF-001", locationType: "Digital_Hotline" })],
      confidenceLow: false,
      decomposition: [],
    };
    expect(planFromRetrieval(resp).kind).toBe("offsite");
  });
});

describe("resolveIntent (two-tier)", () => {
  it("uses the local result and skips the backend when confident", async () => {
    let called = false;
    const retrieve = async (): Promise<RetrieveResponse> => {
      called = true;
      return { services: [], confidenceLow: true, decomposition: [] };
    };
    const plan = await resolveIntent("library", services, [], undefined, retrieve);
    expect(plan.kind).toBe("destination");
    expect(called).toBe(false);
  });

  it("defers a non-routable local match to the backend and uses its routable result", async () => {
    const retrieve = async (): Promise<RetrieveResponse> => ({
      services: [
        adapted({ id: "MSF-001", nameEn: "ComCare", floorId: "L1", roomId: "L1-room-psc", displayFloor: "L1" }),
      ],
      confidenceLow: false,
      decomposition: [],
    });
    // "elderly active ageing" matches the non-routable active-ageing locally;
    // it must NOT short-circuit to a local card — the backend's routable result wins.
    const plan = await resolveIntent("elderly active ageing", services, [], undefined, retrieve);
    expect(plan.kind).toBe("destination");
    if (plan.kind === "destination") expect(plan.stop.serviceId).toBe("MSF-001");
  });

  it("falls back to the backend when local is not confident", async () => {
    const retrieve = async (): Promise<RetrieveResponse> => ({
      services: [
        adapted({ id: "HDB-001", nameEn: "HDB", floorId: "L2", roomId: "L2-room-hdb-office", displayFloor: "L2" }),
      ],
      confidenceLow: false,
      decomposition: [],
    });
    const plan = await resolveIntent("zxcvbnm qwerty unknown", services, [], undefined, retrieve);
    expect(plan.kind).toBe("destination");
    if (plan.kind === "destination") expect(plan.stop.serviceId).toBe("HDB-001");
  });

  it("gracefully falls back to the local plan when the backend errors", async () => {
    const retrieve = async (): Promise<RetrieveResponse> => {
      throw new Error("backend down");
    };
    const plan = await resolveIntent("zxcvbnm qwerty unknown", services, [], undefined, retrieve);
    expect(plan.kind).toBe("human");
  });

  it("returns the local plan when the backend signals low confidence", async () => {
    const retrieve = async (): Promise<RetrieveResponse> => ({
      services: [],
      confidenceLow: true,
      decomposition: [],
    });
    const plan = await resolveIntent("zxcvbnm qwerty unknown", services, [], undefined, retrieve);
    expect(plan.kind).toBe("human");
  });
});
