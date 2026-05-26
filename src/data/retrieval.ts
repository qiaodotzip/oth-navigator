/**
 * Adapter between Team Bolo Bao's retrieval backend (POST /api/retrieve) and
 * this app's Service shape + map routing.
 *
 * The backend returns rich government-service records but NO spatial data
 * (`oth_location` is free text). We own the service_id → {floor, room} mapping
 * here. Rooms that aren't traced yet fall back to the ServiceSG anchor on L1,
 * so routing always resolves; once you trace a room and add its polygon, the
 * map auto-routes there with no code change.
 */
import type { FloorId, Floor, Service, ServiceCategory } from "./types";

// ---------- backend contract (mirror of src/retrieve.py) ----------

export type BackendService = {
  service_id: string;
  service_name: string;
  agency: string;
  location_type: "Physical_OTH" | "Digital_Hotline";
  rich_description: string;
  eligibility: {
    citizenship: string[];
    age_min: number | null;
    age_max: number | null;
    income_ceiling_monthly_sgd: number | null;
    employment_status: string[] | null;
    other_criteria: string[];
  };
  required_documents: { name: string; required_if: string | null; notes: string | null }[];
  oth_location: string;
  operating_hours: Record<string, string>;
  contact: { phone: string | null; email: string | null; website: string | null };
  walk_in_accepted: boolean;
  appointment_required: boolean;
  typical_processing_time: string;
  last_updated: string;
  source_url: string;
};

export type RetrievalResult = {
  services: {
    service: BackendService;
    relevance_score: number;
    rerank_justification: string | null;
  }[];
  confidence_low: boolean;
  query_decomposition: string[];
  debug_info?: Record<string, unknown>;
};

export type UserContext = {
  citizenship?: "citizen" | "PR" | "foreigner";
  age?: number;
};

/**
 * The 23 backend service ids + names (from CHATBOT_INTEGRATION.md). These are
 * the canonical ids shared with the backend team — use them when naming
 * entrances so the frontend and backend agree.
 */
export const BACKEND_SERVICE_CATALOG: { id: string; name: string }[] = [
  { id: "MSF-001", name: "ComCare Short-to-Medium-Term Assistance" },
  { id: "MSF-002", name: "ComCare Long-Term Assistance" },
  { id: "MSF-003", name: "ComCare Interim Assistance" },
  { id: "MSF-007", name: "Tampines Family Service Centre" },
  { id: "MSF-008", name: "Baby Bonus Scheme" },
  { id: "HDB-001", name: "HDB Financial Assistance Scheme" },
  { id: "HDB-002", name: "Fresh Start Housing Scheme" },
  { id: "HDB-003", name: "Public Rental Scheme" },
  { id: "HDB-004", name: "Lease Buyback Scheme" },
  { id: "HDB-005", name: "Enhanced CPF Housing Grant" },
  { id: "HDB-006", name: "Silver Housing Bonus" },
  { id: "WSG-001", name: "Career Matching Services" },
  { id: "WSG-002", name: "Career Conversion Programme" },
  { id: "WSG-003", name: "Mid-Career Pathways Programme" },
  { id: "WSG-004", name: "Career Trial" },
  { id: "SSG-001", name: "SkillsFuture Credit" },
  { id: "SSG-002", name: "Workfare Skills Support" },
  { id: "FAMNEX-001", name: "Family Nexus @ OTH" },
  { id: "AIC-001", name: "AIC Care Connect" },
  { id: "AIC-002", name: "Home Caregiving Grant" },
  { id: "SSGC-001", name: "ServiceSG Centre @ OTH" },
  { id: "CPF-001", name: "Workfare Income Supplement" },
  { id: "CPF-002", name: "Silver Support Scheme" },
];

// ---------- service_id → location mapping ----------

// The ServiceSG counter on L1 — the anchor for any service we can't place yet,
// and the in-person help point for all Digital_Hotline services.
const SERVICESG_ANCHOR = { floorId: "L1" as FloorId, roomId: "L1-room-psc", iconKey: "info" };

type Loc = { floorId: FloorId; roomId: string; iconKey: string };

/**
 * Where each backend service sits in our model. roomIds marked STUB don't have
 * a polygon yet — `resolveLocation` falls back to the ServiceSG anchor until you
 * trace them (see docs plan). Many backend services share one physical counter.
 */
export const SERVICE_LOCATION_MAP: Record<string, Loc> = {
  // ServiceSG anchor (L1) — exists.
  "SSGC-001": { floorId: "L1", roomId: "L1-room-psc", iconKey: "info" },

  // ComCare / Social Service Office is one of the agency counters hosted within
  // the ServiceSG / PSC cluster at L1 #01-21 (no standalone SSO unit in OTH) —
  // confirmed against the floor map — so it routes to ServiceSG.
  "MSF-001": { floorId: "L1", roomId: "L1-room-psc", iconKey: "info" },
  "MSF-002": { floorId: "L1", roomId: "L1-room-psc", iconKey: "info" },
  "MSF-003": { floorId: "L1", roomId: "L1-room-psc", iconKey: "info" },

  // Tampines Family Service Centre (L1) — STUB room.
  "MSF-007": { floorId: "L1", roomId: "L1-room-tfsc", iconKey: "info" },

  // Family Nexus @ L1, near Gate 10 — STUB room.
  "FAMNEX-001": { floorId: "L1", roomId: "L1-room-family-nexus", iconKey: "hospital" },

  // HDB Tampines Branch. Backend says Level 3; we model it on L2 for now
  // (L2-room-hdb-office exists). Switch to L3 once that floor is added.
  "HDB-001": { floorId: "L2", roomId: "L2-room-hdb-office", iconKey: "receipt" },
  "HDB-002": { floorId: "L2", roomId: "L2-room-hdb-office", iconKey: "receipt" },
  "HDB-003": { floorId: "L2", roomId: "L2-room-hdb-office", iconKey: "receipt" },
  "HDB-004": { floorId: "L2", roomId: "L2-room-hdb-office", iconKey: "receipt" },
  "HDB-005": { floorId: "L2", roomId: "L2-room-hdb-office", iconKey: "receipt" },
  "HDB-006": { floorId: "L2", roomId: "L2-room-hdb-office", iconKey: "receipt" },

  // WSG / SkillsFuture career services at OTH are delivered through e2i, which
  // shares the ServiceSG / PSC counter at L1 #01-21 (no separate "Careers
  // Connect" unit exists per the PA directory) — so they route to ServiceSG.
  "WSG-001": { floorId: "L1", roomId: "L1-room-psc", iconKey: "info" },
  "WSG-002": { floorId: "L1", roomId: "L1-room-psc", iconKey: "info" },
  "WSG-003": { floorId: "L1", roomId: "L1-room-psc", iconKey: "info" },
  "WSG-004": { floorId: "L1", roomId: "L1-room-psc", iconKey: "info" },
  "SSG-001": { floorId: "L1", roomId: "L1-room-psc", iconKey: "info" },
  "SSG-002": { floorId: "L1", roomId: "L1-room-psc", iconKey: "info" },

  // Digital_Hotline services — no OTH counter; helped in person at ServiceSG.
  "AIC-001": { floorId: "L1", roomId: "L1-room-psc", iconKey: "hospital" },
  "AIC-002": { floorId: "L1", roomId: "L1-room-psc", iconKey: "hospital" },
  "CPF-001": { floorId: "L1", roomId: "L1-room-psc", iconKey: "receipt" },
  "CPF-002": { floorId: "L1", roomId: "L1-room-psc", iconKey: "receipt" },
  "MSF-008": { floorId: "L1", roomId: "L1-room-psc", iconKey: "hospital" },
};

function categoryFor(svc: BackendService): ServiceCategory {
  const id = svc.service_id;
  if (id.startsWith("AIC") || id.startsWith("FAMNEX")) return "healthcare";
  if (id === "MSF-007") return "community";
  return "government";
}

function resolveLocation(svc: BackendService, floors: Floor[]): Loc {
  const intended = SERVICE_LOCATION_MAP[svc.service_id];
  // Digital_Hotline always anchors at ServiceSG for in-person help.
  const base = svc.location_type === "Digital_Hotline" ? SERVICESG_ANCHOR : (intended ?? SERVICESG_ANCHOR);
  const floor = floors.find(f => f.id === base.floorId);
  const roomExists = !!floor?.polygons.some(p => p.id === base.roomId);
  if (roomExists) return base;
  // Room not traced yet → fall back to the ServiceSG anchor so routing resolves.
  return { ...SERVICESG_ANCHOR, iconKey: base.iconKey };
}

/** A retrieval result mapped into our app, ready for tiles + routing. */
export type AdaptedService = Service & {
  relevanceScore: number;
  justification: string | null;
  locationType: BackendService["location_type"];
  othLocation: string;
  operatingHours: Record<string, string>;
  contact: BackendService["contact"];
  requiredDocuments: BackendService["required_documents"];
  richDescription: string;
};

export function adaptService(
  svc: BackendService,
  floors: Floor[],
  relevanceScore = 1,
  justification: string | null = null,
): AdaptedService {
  const loc = resolveLocation(svc, floors);
  const digital = svc.location_type === "Digital_Hotline";
  return {
    id: svc.service_id,
    nameEn: svc.service_name,
    nameZh: svc.service_name, // backend has no Chinese name; reuse English
    providerName: svc.agency,
    category: categoryFor(svc),
    routable: true, // resolveLocation always lands on a real room (ServiceSG fallback)
    displayFloor: loc.floorId,
    floorId: loc.floorId,
    roomId: loc.roomId,
    accessibility: {
      liftAccess: true,
      stepFreeRoute: true,
      notes: digital
        ? "Online service — get in-person help at ServiceSG Centre (Level 1)."
        : undefined,
    },
    sourceUrl: svc.source_url,
    iconKey: loc.iconKey,
    relevanceScore,
    justification,
    locationType: svc.location_type,
    othLocation: svc.oth_location,
    operatingHours: svc.operating_hours,
    contact: svc.contact,
    requiredDocuments: svc.required_documents,
    richDescription: svc.rich_description,
  };
}

// ---------- the retrieval client ----------

// Where the retrieval backend lives. Set VITE_RETRIEVAL_API (e.g.
// http://127.0.0.1:8000) or proxy /api/retrieve to it in vite.config.
const RETRIEVAL_BASE =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_RETRIEVAL_API ?? "";

export type RetrieveResponse = {
  services: AdaptedService[];
  confidenceLow: boolean;
  decomposition: string[];
};

export async function retrieveServices(
  query: string,
  floors: Floor[],
  ctx?: UserContext,
  topK = 3,
): Promise<RetrieveResponse> {
  const res = await fetch(`${RETRIEVAL_BASE}/api/retrieve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      citizenship: ctx?.citizenship ?? null,
      age: ctx?.age ?? null,
      top_k: topK,
    }),
  });
  if (!res.ok) throw new Error(`retrieve ${res.status}`);
  const data = (await res.json()) as RetrievalResult;
  return {
    services: data.services.map(r =>
      adaptService(r.service, floors, r.relevance_score, r.rerank_justification),
    ),
    confidenceLow: data.confidence_low,
    decomposition: data.query_decomposition,
  };
}

// ---------- journey (step-by-step itinerary) ----------
// POST /api/journey → an ordered multi-stop plan (one stop per distinct counter)
// with a per-stop `reason`. Backend mock today (see main.py); same contract the
// real LLM-ordered endpoint will fill.

type BackendJourneyResult = {
  summary: string | null;
  confidence_low: boolean;
  stops: { service: BackendService; reason: string; relevance_score: number }[];
};

export type JourneyStopResolved = { service: AdaptedService; reason: string };
export type RetrieveJourneyResponse = {
  summary: string | null;
  confidenceLow: boolean;
  stops: JourneyStopResolved[];
};

export async function retrieveJourney(
  query: string,
  floors: Floor[],
  ctx?: UserContext,
  maxStops = 3,
): Promise<RetrieveJourneyResponse> {
  const res = await fetch(`${RETRIEVAL_BASE}/api/journey`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      citizenship: ctx?.citizenship ?? null,
      age: ctx?.age ?? null,
      max_stops: maxStops,
    }),
  });
  if (!res.ok) throw new Error(`journey ${res.status}`);
  const data = (await res.json()) as BackendJourneyResult;
  return {
    summary: data.summary,
    confidenceLow: data.confidence_low,
    stops: data.stops.map(s => ({
      service: adaptService(s.service, floors, s.relevance_score),
      reason: s.reason,
    })),
  };
}
