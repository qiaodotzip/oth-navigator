/**
 * Shared mock cast + report data for the Service Fragmentation Lens.
 * Persona stats/reviews are MOCK (match the planned pipeline shapes — see
 * docs/design-and-plans/plans/2026-05-26-fragmentation-dashboard-plan.md). Persona
 * `stops` use REAL routable service ids so the dashboard's map replay works.
 */

export type Mobility = "high" | "moderate" | "low";

export type Stop = { serviceId: string; label: string; floor: string; note?: string };

export type Persona = {
  id: string;
  name: string;
  emoji: string;
  tint: string; // tailwind gradient classes for the avatar
  age: number;
  archetype: string;
  mobility: Mobility;
  langFirst: string;
  intent: string;
  stops: Stop[];
  effort: number;
  walkMetres: number;
  floorChanges: number;
  waitMinutes: number;
  tripsOut: number;
  wallClockMin: number;
  review: string;
};

export const PERSONAS: Persona[] = [
  {
    id: "tan",
    name: "Madam Tan",
    emoji: "👵",
    tint: "from-rose-400 to-orange-300",
    age: 72,
    archetype: "Retiree · Mandarin-first",
    mobility: "low",
    langFirst: "中文",
    intent: "I want to see the doctor, then renew my IC downstairs.",
    stops: [
      { serviceId: "family-medicine-clinic", label: "Family Medicine Clinic", floor: "L3", note: "2 lifts up" },
      { serviceId: "servicesg", label: "ServiceSG (IC)", floor: "L1", note: "18 min queue" },
    ],
    effort: 97,
    walkMetres: 412,
    floorChanges: 2,
    waitMinutes: 24,
    tripsOut: 0,
    wallClockMin: 96,
    review: "Going all the way up to Level 3 tired me out, and the lifts were hard to find. By ServiceSG I just wanted to sit.",
  },
  {
    id: "raju",
    name: "Mr Raju",
    emoji: "🧑🏽",
    tint: "from-sky-400 to-indigo-300",
    age: 45,
    archetype: "Working caregiver · English",
    mobility: "moderate",
    langFirst: "English",
    intent: "Sort my father's HDB rental and ask about a caregiving grant on my lunch break.",
    stops: [
      { serviceId: "hdb", label: "HDB Branch", floor: "L2" },
      { serviceId: "servicesg", label: "ServiceSG (AIC grant)", floor: "L1", note: "hotline → in person" },
    ],
    effort: 41,
    walkMetres: 196,
    floorChanges: 1,
    waitMinutes: 9,
    tripsOut: 0,
    wallClockMin: 44,
    review: "Not bad — but the caregiving grant turned out to be just a hotline. I queued in person to be handed a phone number.",
  },
  {
    id: "lim",
    name: "Auntie Lim",
    emoji: "👩🏻",
    tint: "from-emerald-400 to-teal-300",
    age: 68,
    archetype: "Senior · digital-shy",
    mobility: "moderate",
    langFirst: "中文",
    intent: "Join a community activity and borrow a few books.",
    stops: [
      { serviceId: "community-centre", label: "Tampines CC", floor: "L3" },
      { serviceId: "library", label: "Regional Library", floor: "L2" },
    ],
    effort: 48,
    walkMetres: 233,
    floorChanges: 2,
    waitMinutes: 4,
    tripsOut: 0,
    wallClockMin: 51,
    review: "Lovely once I arrived, but I had no idea the community rooms were all the way up on Level 3.",
  },
  {
    id: "siti",
    name: "Siti",
    emoji: "🧕",
    tint: "from-fuchsia-400 to-pink-300",
    age: 31,
    archetype: "Young parent · Malay-first",
    mobility: "high",
    langFirst: "Melayu",
    intent: "Apply for ComCare help and check in with Family Nexus about my newborn.",
    stops: [
      { serviceId: "servicesg", label: "ServiceSG (ComCare)", floor: "L1" },
      { serviceId: "family-nexus", label: "Family Nexus", floor: "L1" },
    ],
    effort: 33,
    walkMetres: 168,
    floorChanges: 0,
    waitMinutes: 11,
    tripsOut: 0,
    wallClockMin: 38,
    review: "Smoothest of the lot — both were on Level 1 and close together. This is how it should feel everywhere.",
  },
];

export type ServiceRow = { name: string; floorLabel: string; avgEffort: number; flag?: string };
export const SERVICES: ServiceRow[] = [
  { name: "Family Service Centre", floorLabel: "Off-site", avgEffort: 86, flag: "Outside OTH" },
  { name: "Family Medicine Clinic", floorLabel: "L3", avgEffort: 64, flag: "2 lift hops up" },
  { name: "Tampines CC", floorLabel: "L3", avgEffort: 52 },
  { name: "HDB Branch", floorLabel: "L2", avgEffort: 33 },
  { name: "ServiceSG", floorLabel: "L1", avgEffort: 28 },
];

export type Rec = {
  id: string;
  severity: "high" | "med" | "low";
  service: string;
  action: string;
  evidence: string;
  affected: string[];
  effort: string; // implementation effort, for the report
};
export const RECS: Rec[] = [
  {
    id: "r1",
    severity: "high",
    service: "Family Service Centre",
    action: "Place a Family Service Centre kiosk or roving helper inside OTH to take intake and fill forms — so residents don't have to leave the building.",
    evidence: "Off-site · 2 of 3 affected residents had to bus out and back (avg 27-min detour).",
    affected: ["tan", "siti"],
    effort: "Medium — partner agreement + a staffed counter",
  },
  {
    id: "r2",
    severity: "med",
    service: "Family Medicine Clinic",
    action: "Add lift-priority wayfinding from the L1 arrival hall to the L3 health cluster, with seating along the way.",
    evidence: "L3, 2 lift hops from the entrance — low-mobility residents average 34 effort just to reach it.",
    affected: ["tan", "lim"],
    effort: "Low — signage + benches",
  },
  {
    id: "r3",
    severity: "med",
    service: "ServiceSG",
    action: "Empower the ServiceSG counter to complete hotline-only transactions on the spot instead of redirecting to a phone line.",
    evidence: "AIC & ComCare route here as 'in-person help' but can only hand out a number.",
    affected: ["raju"],
    effort: "Medium — staff training + system access",
  },
];

export function moodFor(effort: number) {
  if (effort > 70) return { face: "😣", label: "Worn out", tone: "text-rose-600" };
  if (effort > 45) return { face: "😐", label: "It was okay", tone: "text-amber-600" };
  return { face: "🙂", label: "Felt easy", tone: "text-emerald-600" };
}

export function Avatar({ p, size = "h-12 w-12 text-2xl" }: { p: Persona; size?: string }) {
  return (
    <span className={`grid ${size} flex-shrink-0 place-items-center rounded-full bg-gradient-to-br ${p.tint} shadow-inner`}>
      {p.emoji}
    </span>
  );
}
