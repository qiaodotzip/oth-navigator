import type { FloorId } from "@/data/types";

export type LocalizedText = { en: string; zh: string };

export type PlanStop = {
  serviceId: string;
  name: LocalizedText;
  floorId?: FloorId;
  roomId?: string;
  /** In OTH but on an unmodelled floor (L4/L5) → we can't draw the indoor route. */
  unmodelledLevel?: number;
  /** The service's own website, for the "do it online" option. */
  website?: string;
  reason?: LocalizedText;
  walkInAccepted?: boolean;
  appointmentRequired?: boolean;
  operatingHours?: Record<string, string>;
  requiredDocuments?: { name: string; note?: string }[];
  accessibility?: { liftAccess: boolean; stepFree: boolean; notes?: string };
};

export type Plan =
  | { kind: "destination"; answer: LocalizedText; stop: PlanStop }
  | { kind: "journey"; title?: LocalizedText; stops: PlanStop[] }
  | { kind: "offsite"; stop: PlanStop; appHandoff: { label: LocalizedText; url?: string } }
  | { kind: "human"; message: LocalizedText; stop: PlanStop }
  // We can't draw an indoor route to this place (upper unmodelled floor L4/L5,
  // basement B1, or a room we haven't traced). Offer: do it online, or walk to
  // the nearest help desk.
  | { kind: "unreachable"; stop: PlanStop };

export type ResolveResult = { plan: Plan; confidence: number };
