# Implementation Plan — Service Fragmentation Dashboard (DEFERRED)

**Status:** designed & approved 2026-05-26 (brainstorm). Build after the off-site
foundation + effort-aware planner (see `2026-05-26-offsite-services-plan.md`),
which this sits on top of.

The grassroots-facing product: simulate diverse Singaporean resident personas
attempting service journeys, measure the friction, and turn it into **actionable
recommendations** for the Tampines community (kiosks, helpers, signage, etc.).
This is **pieces 2–4** of the larger vision; piece 1 (off-site + planner) is the
foundation it consumes.

---

## Approved architecture decisions
1. **Pre-gen cast, live sim.** A fixed, LLM-authored persona cast lives in JSON
   (offline). The dashboard runs them through the **deterministic**
   `simulateJourney()` live. Reproducible — no live-LLM risk in the hot path.
2. **Reviews: baked LLM, keyed to the deterministic breakdown** — so a persona's
   "how it felt" never contradicts its numbers.
3. **Recommendations: hybrid** — deterministic rules detect + rank friction
   patterns (the evidence); the LLM phrases each into grassroots-friendly wording.

---

## Pipeline

### 1. Persona cast — `public/data/personas.json` (offline, LLM-authored)
```ts
type Persona = {
  id: string;
  name: string;            // e.g. "Madam Tan"
  archetype: string;       // e.g. "elderly-low-mobility-mandarin"
  traits: {
    age: number;
    mobility: "high" | "moderate" | "low";
    languageFirst: "en" | "zh" | "ms" | "ta";
    techComfort: "low" | "med" | "high";
  };
  intent: string;          // free-text need, in their voice
  serviceIds: string[];    // resolved via the intent resolver, baked
  review?: { en: string; zh: string };  // baked, grounded in the breakdown (step 3)
};
```

### 2. Run (live, deterministic)
Per persona: `serviceIds → simulateJourney(startTime, loadSnapshot) → breakdown`
(reuses the planner from the off-site plan). Fixed `startTime` + load snapshot ⇒
reproducible.

### 3. Reviews (baked LLM, grounded)
Offline, feed each persona + its breakdown to the LLM → first-person review.
Stored back on the persona so the demo is offline-safe and consistent.

### 4. Fragmentation report — aggregate the breakdowns three ways
- **per persona/archetype:** effort, walkMetres, floorChanges, waitMinutes,
  tripsOut, feasible?
- **per service:** avg effort-to-reach, forcedReturnRate, off-site / unmodelled
  flags, queueExposure.
- **per intent:** stop count, crossFloor count, offSite count, total effort.
Plus headline friction flags.

### 5. Recommendation engine (hybrid)
Rules scan the aggregated report; each rule emits
`{ ruleId, severity, evidence (the numbers), affectedPersonas, actionTemplate }`.
The LLM rewrites `actionTemplate` into grassroots wording using the evidence.

**Starter rule catalog** (extend freely):
| Trigger | actionTemplate seed |
|---|---|
| `offsite && forcedReturnRate > 0.3` | bring service into OTH — kiosk / assisted-form helper |
| `inOthUnmodelled && high floorChanges` | add signage / concierge to that floor |
| high `queueExposure` for low-mobility personas | seating + queue-number system at the service |
| high avg effort across personas | relocate service nearer an entrance / lift |

---

## Dashboard UI — OPEN (visual; design with the visual companion)
Route (e.g. `/#dashboard`). Sections envisioned: persona roster, a "Run
simulation" action, per-persona journey replay on the existing 3D map, the
fragmentation report (charts/tables), and the ranked recommendations with their
evidence. **Lay this out separately** — it's the only visual piece.

---

## Data needed (beyond piece 1)
- `personas.json` (cast + baked reviews).
- per-service `dwellMinutes` + operating hours (shared with the planner).
- Recommendation rule definitions (code) + the LLM phrasing prompt.

## Test / verify
- `simulateJourney` breakdowns are deterministic for a fixed start time + load.
- Each rule fires only when its trigger condition holds against a known report.
- Report aggregates match hand-computed totals for a small fixture cast.
- LLM phrasing is the only non-deterministic part and is **out of the test path**
  (tests assert on rule firing + evidence, not wording).
