# OTH Indoor Map — Project Plan & Delivery Proposal

> **Prepared for:** Our Tampines Hub (OTH)
> **Prepared by:** [TEAM NAME — TBD] — the team that placed 5th at the Tampines AI JOM Hackathon 2026
> **Date:** 4 September 2026
> **Status:** Draft for OTH review. Dates marked *(to confirm)* are proposals, not commitments.
>
> **Scope note:** This document covers the **indoor map and wayfinding** product only.
> The AI service-concierge and service-retrieval layers demonstrated at the hackathon
> are **out of scope** at OTH's direction. Nothing in this plan depends on them.

---

## How to read this document

Anything stated as fact is derived from work already done or from OTH's own published
materials. Anything the team still has to decide, or that OTH has to supply, is written as
`[TBD — owner]` so it is impossible to mistake a placeholder for a commitment. There are
deliberately a lot of them; filling them in is the next working session, not a formality.

**Contents**

1. [Timeline & tasks](#1-timeline--tasks)
2. [Project scope by phase](#2-project-scope-by-phase)
3. [Budget & resources](#3-budget--resources)
4. [Posters & QR codes](#4-posters--qr-codes)
5. [User Acceptance Testing questionnaire — 9 September](#5-user-acceptance-testing--9-september)
6. [Requests to OTH](#6-requests-to-oth)
7. [Risks](#7-risks)
8. [Open decisions](#8-open-decisions)

---

## 0. Where the project stands today

An honest baseline, so the timeline below is readable.

| Component | State | Notes |
|---|---|---|
| Map data model (`packages/model`) | **Built** | Schema, geometry predicates, validation rules, navigation-grid baking, bundle builder. Pure TypeScript, heavily tested. |
| Backend (`packages/server`) | **Built** | Hono API, Postgres, invite-only auth, per-entity locking, presence, `.glb` asset ingest, publish pipeline with a validation gate. |
| Shared renderer (`packages/renderer`) | **Partial** | Coordinate mapping, room meshes, level grouping. |
| Authoring editor (`packages/editor`) | **In progress** | Plan-view drawing, scale calibration, snapping. Target complete late September. |
| Visitor app (`packages/viewer`) | **Not started** | Phase 2. This is the thing the public will use. |
| Authored floor data | **None yet** | Zero of 8 storeys authored in the production model. **Blocked on OTH floor plans.** |
| Hackathon prototype (`legacy/`) | **Runnable** | Levels 1–2. Data traced from outdated public plans and known to be inaccurate. Kept as reference and as the Phase 1 test article. |

**The single most important fact in this document:** the production map cannot begin until
OTH supplies current floor plans. Every date in Phase 2 and Phase 3 moves day-for-day with
that delivery. See [§6.1](#61-signed-release-of-floor-plans--critical-path).

---

## 1. Timeline & tasks

Working assumption: **6-person team**, five-day weeks, Singapore public holidays observed.
Dates are proposals for OTH to confirm.

### 1.1 Milestone summary

| Milestone | Date | Confidence |
|---|---|---|
| UAT questionnaire finalised | Mon 7 Sep 2026 | Committed |
| **UAT Session 1 — public testing at OTH** | **Wed 9 Sep 2026** | Committed *(pending OTH site access)* |
| UAT Sessions 2–3 | Wed 16 Sep, Sat 19 Sep *(to confirm)* | Proposed |
| Floor plans received from OTH | **Fri 25 Sep 2026** *(to confirm)* | **Critical path — OTH dependency** |
| UAT findings report delivered to OTH | Wed 30 Sep 2026 | Proposed |
| Phase 1 close | Wed 30 Sep 2026 | Proposed |
| UAT round 2 — production map | Wed 25 Nov 2026 | Proposed |
| All 8 storeys authored & validated | Fri 27 Nov 2026 | Proposed |
| Phase 2 close | Sat 28 Nov 2026 | Proposed |
| Soft launch (staff + 3 pilot posters) | Tue 8 Dec 2026 | Proposed |
| **Public launch** | **Tue 15 Dec 2026** | Proposed |
| Handover complete | Fri 18 Dec 2026 | Proposed |

### 1.2 Phase 1 — Pilot & validation (4 – 30 Sep 2026)

| # | Task | Owner | Start | End | Depends on | Status |
|---|---|---|---|---|---|---|
| 1.1 | Submit floor-plan request + signed release to OTH | Project Lead | 4 Sep | 4 Sep | — | **Do first** |
| 1.2 | Confirm 9 Sep site access, testing zone, lanyards | Project Lead | 4 Sep | 8 Sep | OTH | Blocked on OTH |
| 1.3 | Finalise UAT questionnaire + facilitator script (EN/中文) | UX Research | 4 Sep | 7 Sep | — | In progress |
| 1.4 | Translate questionnaire to Mandarin; native-speaker review | `[TBD — owner]` | 5 Sep | 7 Sep | 1.3 | Not started |
| 1.5 | Print questionnaires, consent forms, observer tally sheets | `[TBD — owner]` | 8 Sep | 8 Sep | 1.3, 1.4 | Not started |
| 1.6 | Harden prototype for public use (stability, offline fallback, disable demo-only artefacts) | Lead Engineer | 4 Sep | 8 Sep | — | Not started |
| 1.7 | Provision test devices — 4 loaner phones, chargers, powerbanks, hotspot | `[TBD — owner]` | 5 Sep | 8 Sep | — | Not started |
| 1.8 | Dry run: full session with 2 internal testers | Whole team | 8 Sep | 8 Sep | 1.5, 1.6, 1.7 | Not started |
| 1.9 | **UAT Session 1 at OTH** | Whole team | **9 Sep** | **9 Sep** | 1.2, 1.8 | Not started |
| 1.10 | On-site accuracy sweep — photograph and measure L1/L2 rooms, record unit numbers | 2× Map Author | 9 Sep | 9 Sep | 1.2 | Concurrent with 1.9 |
| 1.11 | Same-day debrief and defect triage | Whole team | 9 Sep | 9 Sep | 1.9 | Not started |
| 1.12 | UAT Sessions 2–3 *(weekday + weekend mix)* | Whole team | 16 Sep | 19 Sep | 1.11 | Proposed |
| 1.13 | Complete authoring editor | Lead Eng, Viewer Eng | 4 Sep | 26 Sep | — | In progress |
| 1.14 | Poster + QR design v1; submit for OTH brand review | `[TBD — owner]` | 15 Sep | 26 Sep | — | Not started |
| 1.15 | Analyse UAT results; findings report + requirements delta | UX Research | 21 Sep | 30 Sep | 1.12 | Not started |
| 1.16 | Ingest floor plans; calibrate scale; confirm CAD layer structure | Lead Engineer | 25 Sep | 30 Sep | **1.1 / OTH** | Blocked on OTH |

### 1.3 Phase 2 — Production map build (1 Oct – 28 Nov 2026)

| # | Task | Owner | Start | End | Depends on |
|---|---|---|---|---|---|
| 2.1 | Import CAD; calibrate reference underlays, all 8 levels | Lead Engineer | 1 Oct | 9 Oct | 1.16 |
| 2.2 | Author structure — L1, L2 (highest traffic, most agency counters) | 2× Map Author | 6 Oct | 16 Oct | 2.1 |
| 2.3 | Author structure — L3, L4, L5 | 2× Map Author | 13 Oct | 30 Oct | 2.1 |
| 2.4 | Author structure — L6, L7, L8 | 2× Map Author | 27 Oct | 13 Nov | 2.1 |
| 2.5 | Author navigation layer — doorways, entrances, portals, nav hints | 2× Map Author | rolling, per level | 20 Nov | 2.2–2.4 |
| 2.6 | Tenant/service catalogue; CSV import; bind to rooms | Map Author B | 13 Oct | 20 Nov | 2.2, OTH tenancy schedule |
| 2.7 | On-site verification pass 1 — L1–L4 | 3× team | 26 Oct | 30 Oct | 2.2, 2.3 |
| 2.8 | On-site verification pass 2 — L5–L8 + corrections | 3× team | 16 Nov | 20 Nov | 2.4 |
| 2.9 | Model ~20 hero landmarks (Blender/Rhino round trip) | 3D Artist | 20 Oct | 20 Nov | 2.2 |
| 2.10 | Build visitor app (`packages/viewer`) | Viewer Engineer | 1 Oct | 20 Nov | — |
| 2.11 | Step-free routing + accessibility QA | Viewer Eng, UX Research | 3 Nov | 20 Nov | 2.5, 2.10 |
| 2.12 | Internal publish; validation gate green on all 8 levels | Lead Engineer | 23 Nov | 27 Nov | 2.5, 2.6 |
| 2.13 | **UAT round 2 — production map with real visitors** | Whole team | 25 Nov | 25 Nov | 2.10, 2.12 |
| 2.14 | Fix round-2 findings | Whole team | 26 Nov | 28 Nov | 2.13 |

### 1.4 Phase 3 — Launch & handover (1 – 18 Dec 2026)

| # | Task | Owner | Start | End | Depends on |
|---|---|---|---|---|---|
| 3.1 | Production hosting, domain, TLS, monitoring, uptime alerting | Lead Engineer | 1 Dec | 4 Dec | 2.12 |
| 3.2 | Privacy-respecting usage analytics (per-poster scan counts, no personal data) | Lead Engineer | 1 Dec | 4 Dec | 3.1 |
| 3.3 | Final poster artwork; print; OTH placement approval | `[TBD — owner]` | 1 Dec | 7 Dec | 1.14, OTH |
| 3.4 | Install posters at agreed locations | `[TBD — owner]` + OTH | 7 Dec | 8 Dec | 3.3 |
| 3.5 | **Soft launch** — OTH staff + 3 pilot poster locations | Whole team | 8 Dec | 12 Dec | 3.1, 3.4 |
| 3.6 | **Public launch** — full poster network live | Whole team | 15 Dec | 15 Dec | 3.5 |
| 3.7 | Handover pack — operations runbook, editor training, escalation path | Project Lead | 15 Dec | 18 Dec | 3.6 |
| 3.8 | Agree maintenance & update model with OTH | Project Lead | 15 Dec | 18 Dec | — |

---

## 2. Project scope by phase

### Phase 1 — Pilot & validation

**Runs:** 4 – 30 September 2026

#### Description

Phase 1 does **not** ship the production map. It exists to answer two questions before we
commit two months of authoring effort to eight storeys:

1. **Does the wayfinding experience actually work for OTH's visitors** — particularly
   elderly and mobility-limited visitors, who are the hardest and most important users?
2. **How wrong is our current understanding of the building**, and what specifically has
   to be corrected?

The test article is the **hackathon prototype covering Levels 1 and 2**. Its floor data was
traced from outdated public plans and is known to be inaccurate — which is precisely why
putting it in front of visitors inside the actual building is useful. Every place a tester
says "that's not where that is" is a correction we would otherwise discover in November.

We are explicit with OTH and with testers that this is a prototype under evaluation, not a
service being launched.

**In scope:** Levels 1–2 · destination search and selection · route display · cross-floor
routing via lift and escalator · step-free route option · English and Mandarin interface ·
mobile web on the tester's own phone or a loaner device.

**Out of scope:** Levels 3–8 · AI concierge and service retrieval · live crowd or queue
data · 3D hero landmarks · production hosting · any public advertising of the app.

#### Testing

| | |
|---|---|
| **Method** | Moderated, task-based usability testing conducted in-situ at OTH, plus an unmoderated intercept variant for visitors who will only give us two minutes. |
| **Participants** | Target **n = 24** across three sessions. Quota: ≥10 aged 60+ · ≥3 using a mobility aid · ≥8 Mandarin-first · ≥6 first-time or infrequent OTH visitors. |
| **Sessions** | Wed 9 Sep (committed) · Wed 16 Sep *(to confirm)* · Sat 19 Sep *(to confirm — a weekend date deliberately, to reach families and working adults a Wednesday misses)* |
| **Tasks** | Three, in [§5.3](#53-tasks). Same-floor destination · cross-floor destination · step-free constraint. |
| **Measures** | Unassisted task completion · time on task · number of assists · Single Ease Question per task · SUS-lite · self-reported confidence · accessibility-specific items. |
| **Pass criteria** | ≥70% unassisted completion among participants aged 60+ · median SEQ ≥5 of 7 · SUS ≥68 · zero participants who could not complete any task. |
| **Concurrent** | A two-person accuracy sweep photographs every L1/L2 room, records unit numbers against the tenancy schedule, and measures at least two known dimensions per floor for scale calibration. |
| **Ethics** | Verbal consent recorded on the form. No names, no contact details, no photographs of participants. Age captured as a band. Participants may stop at any time. |

#### Plan

1. **4–8 Sep — Prepare.** Finalise and translate the questionnaire; print materials; harden
   the prototype so a crash cannot end a session; provision loaner devices; run a full
   internal dry run on 8 Sep.
2. **9 Sep — Session 1.** Two facilitators running participants, one observer/scribe, two on
   the accuracy sweep, one floating for recruitment and OTH liaison. Debrief and triage the
   same afternoon while it is fresh.
3. **16 & 19 Sep — Sessions 2–3.** Same protocol, different visitor mix. Fold in protocol
   fixes from Session 1.
4. **21–30 Sep — Analyse and decide.** Findings report to OTH, and a requirements delta that
   feeds Phase 2 directly.
5. **Throughout — Unblock Phase 2.** Chase floor plans, finish the editor, get poster artwork
   through OTH brand review.

#### Phase 1 exit criteria

- [ ] ≥24 participants tested across ≥2 sessions
- [ ] Findings report delivered to OTH
- [ ] Floor plans received, or an agreed fallback (see [§7](#7-risks))
- [ ] Authoring editor complete and usable by non-technical team members
- [ ] Poster and QR design approved by OTH brand

---

### Phase 2 — Production map build

**Runs:** 1 October – 28 November 2026

#### Description

Build the real thing: all eight storeys of Our Tampines Hub, accurate enough for a public
service to route people through, plus the visitor-facing app that consumes it.

The map is authored in four layers, of which only the first two affect routing:

| Layer | Contents | Load-bearing for routing? |
|---|---|---|
| **Structure** | Room footprints and heights on a single building datum | **Yes** |
| **Navigation** | Walkable surface, doorways, entrances, lifts/escalators/stairs | **Yes** |
| **Dressing** | ~20 hand-modelled hero landmarks (`.glb`) placed by transform | **No** |
| **Semantics** | Tenants and services bound to room IDs | Search only |

Keeping the 3D dressing layer deliberately inert is the safety property that lets a
non-engineer contribute detailed models: a badly-made mesh can look wrong, but it cannot
break a route.

Every room and tenant carries a **verification status** — `unverified`, `photo`, `onsite` or
`cad` — with evidence and an author. This is a direct response to how the hackathon data went
wrong: the plans were outdated and nothing recorded that fact. Staleness will be visible
rather than silent.

**In scope:** all 8 storeys, structure + navigation + semantics · ~20 hero landmarks · the
visitor app · step-free routing · English and Mandarin · two on-site verification passes ·
publish pipeline with a validation gate that refuses to ship an invalid map.

**Out of scope:** live queue or crowd data · outdoor navigation to the hub · BLE or Wi-Fi
indoor positioning · native mobile apps · self-service editing by OTH staff.

#### Testing

| | |
|---|---|
| **Automated** | The model package carries the bulk of the test suite: geometry predicates, every validation rule with a passing and a failing case, navigation-grid baking, and bundle determinism (same model in, byte-identical bundle out). Server integration tests run against embedded Postgres — no Docker. |
| **The publish gate** | Publishing runs the full validator as a **gate**. A self-intersecting footprint, a doorway pointing at a non-existent room, a portal endpoint outside its room, a tenant bound to a missing room, or **any walkable room unreachable from a building entrance** blocks the publish outright. Warnings — an unnamed room, an unverified tenant, an asset escaping its anchor room — are surfaced but never block. |
| **On-site verification** | Two full passes. Pass 1 covers L1–L4 in late October; pass 2 covers L5–L8 and re-checks pass-1 corrections in mid-November. Target: **zero rooms at `unverified` on L1–L2, and no tenant at `unverified` anywhere** by 27 Nov. |
| **Accessibility QA** | Every service reachable step-free must have a step-free route genuinely different from the default route, and the app must say so honestly when one does not exist. Interface checked against WCAG 2.1 AA. |
| **Performance** | Cold load under 3 s on a mid-range Android phone over hub Wi-Fi; sustained 30 fps while a route is displayed. Navigation grids are baked at publish time at 0.25 m resolution so phones never rasterise eight floors. Asset budgets enforced server-side: 5 MB and 150k triangles per asset, 25 MB of dressing per level. |
| **UAT round 2** | 25 Nov, same protocol as Phase 1, against the production map. Pass criteria raised: ≥85% unassisted completion among 60+ participants. |

#### Plan

1. **1–9 Oct — Foundation.** Import CAD, calibrate every level against a known dimension,
   confirm layer structure with whoever drew the plans.
2. **6 Oct – 13 Nov — Author, floor by floor.** Two map authors working concurrently; levels
   are independent, so the work parallelises. L1–L2 first because they carry the agency
   counters and the most visitor traffic. The navigation layer follows each level's structure
   immediately, so problems surface while the floor is still fresh.
3. **13 Oct – 20 Nov — Semantics.** Tenant catalogue imported from OTH's tenancy schedule,
   bound to rooms, verified against on-site photographs.
4. **20 Oct – 20 Nov — Landmarks.** ~20 hero assets so visitors can recognise where they are.
   Everything else renders procedurally.
5. **1 Oct – 20 Nov — Visitor app**, built in parallel against published test bundles.
6. **23–28 Nov — Publish, test, fix.**

#### Phase 2 exit criteria

- [ ] All 8 levels published through the validation gate with zero errors
- [ ] Zero `unverified` rooms on L1–L2; zero `unverified` tenants building-wide
- [ ] Step-free route exists and is correct for every step-free-reachable service
- [ ] UAT round 2 pass criteria met
- [ ] Cold load < 3 s on the reference device

---

### Phase 3 — Launch & handover

**Runs:** 1 – 18 December 2026

#### Description

Take the map public, make it discoverable inside the building, and hand OTH something they
can operate rather than something they depend on us to babysit.

Discoverability is the whole game here. A wayfinding map nobody knows exists helps nobody,
which is what the poster and QR network in [§4](#4-posters--qr-codes) is for.

**In scope:** production hosting with monitoring · privacy-respecting usage analytics ·
poster network installed across L1–L2 · soft launch then public launch · operations runbook
and editor training for OTH · an agreed maintenance model.

**Out of scope:** paid marketing · permanent physical signage integrated into OTH's existing
wayfinding hardware · multi-venue expansion.

#### Testing

| | |
|---|---|
| **Pre-launch** | Full regression against the published bundle. Every QR test-scanned from 0.5 m, 1.5 m and 3 m on both iOS and Android, **in the actual lighting at the actual location** — not in the office. |
| **Soft launch (8–12 Dec)** | 3 pilot poster locations plus OTH staff. Watch scan-to-session conversion, session length, and the drop-off point of anyone who abandons mid-route. |
| **Launch monitoring** | Uptime alerting, error-rate alerting, and a weekly report to OTH for the first month. |
| **Success measures** | *(targets to agree with OTH — `[TBD — OTH + Project Lead]`)* Scans per poster per week · scan-to-completed-route conversion · % of sessions ending in an arrival rather than an abandon · qualitative feedback via an in-app link. |

#### Plan

1. **1–4 Dec — Infrastructure.** Domain, TLS, monitoring, analytics.
2. **1–8 Dec — Posters.** Final artwork, print, OTH placement approval, installation.
3. **8–12 Dec — Soft launch.** Staff and three pilot locations. Fix what surfaces.
4. **15 Dec — Public launch.** Full poster network live.
5. **15–18 Dec — Handover.** Runbook, training, escalation path, maintenance agreement.

#### Phase 3 exit criteria

- [ ] Map live on production domain with monitoring and alerting
- [ ] All approved posters installed and test-scanned in situ
- [ ] OTH staff trained on the editor and the publish flow
- [ ] Operations runbook delivered
- [ ] Maintenance and update model agreed in writing

---

## 3. Budget & resources

Two separate things: **what the team needs** (§3.1–3.4) and **what we are asking OTH to
provide** (§3.5). Rates are placeholders — they are a commercial conversation, not an
engineering one.

### 3.1 People

Six people. Effort in **person-days**; rate `[TBD — Project Lead]`.

| Role | Responsibility | P1 | P2 | P3 | Total |
|---|---|---:|---:|---:|---:|
| **Project Lead** | OTH liaison, scheduling, requests, handover | 8 | 20 | 10 | **38** |
| **Lead Engineer** | Model, server, publish pipeline, CAD import, infrastructure | 10 | 38 | 10 | **58** |
| **Viewer Engineer** | Visitor app, renderer, routing UI, accessibility | 6 | 38 | 8 | **52** |
| **Map Author A** | Structure + navigation authoring, verification | 6 | 38 | 3 | **47** |
| **Map Author B** | Structure + navigation authoring, semantics/tenants | 6 | 38 | 3 | **47** |
| **3D Artist** | ~20 hero landmarks via the Blender/Rhino round trip | 3 | 24 | 2 | **29** |
| **Totals** | | **39** | **196** | **36** | **271** |

> UX research is shared across the Project Lead and Viewer Engineer rather than being a
> seventh head. If OTH would prefer a dedicated researcher for the UAT rounds, that is
> roughly **+12 person-days** across Phases 1 and 2.

**Estimated people cost:** 271 person-days × `[TBD — day rate]` = `[TBD]`

### 3.2 Infrastructure — running costs

No new vendors beyond what the build already uses.

| Item | Purpose | Phase 1–2 | Phase 3 onward |
|---|---|---|---|
| Railway — Hobby plan | Editor + API + Postgres during the build | ~US$5–10 / mo | — |
| Railway — Pro plan | Production hosting, better limits and support | — | ~US$20–40 / mo |
| Railway volume | `.glb` assets and published bundles | included | included |
| Postgres | Editing database (source of truth) | included | included |
| Domain | Public URL behind the QR codes | `[TBD — who owns it]` | ~S$60 / yr |
| CDN / TLS (Cloudflare free tier) | Bundle delivery, certificate | S$0 | S$0 |
| Uptime + error monitoring | Alerting after launch | S$0 (free tier) | S$0–20 / mo |
| **Estimated total** | | **~S$15–20 / mo** | **~S$40–90 / mo** |

Deliberately modest. Published bundles are static and content-addressed, so if OTH later
wants them on their own object storage or CDN, that is a configuration change rather than a
rebuild.

> **Decision needed:** does the app live on an OTH-owned domain (e.g. a subdomain of
> `ourtampineshub.sg`) or one we own? This affects the QR codes, which are expensive to
> change once printed and mounted. `[TBD — OTH]`

### 3.3 Equipment & consumables

| Item | Qty | Purpose | Est. cost | Who buys |
|---|---:|---|---|---|
| Loaner Android phones (mid-range) | 4 | UAT sessions; also the performance reference device | `[TBD]` — or borrow from team | Team |
| Powerbanks + charging cables | 4 | Full-day on-site sessions | ~S$120 | Team |
| Mobile hotspot / data SIM | 1 | Do not depend on hub Wi-Fi during UAT | ~S$30 / mo | Team |
| **Laser distance measure** | 2 | Scale calibration and on-site verification. The single cheapest accuracy win available. | ~S$120 each | Team |
| Clipboards and pens | 6 sets | UAT sessions | ~S$80 | Team |
| Printed questionnaires + consent forms | ~60 | 3 sessions | ~S$40 | Team |
| Measuring tape (5 m) | 2 | Cross-check laser readings | ~S$20 | Team |
| Camera or good phone camera | 2 | Photo verification evidence | existing | Team |

### 3.4 Poster production

| Item | Qty | Spec | Est. cost | Who pays |
|---|---:|---|---|---|
| A1 posters, indoor-mounted | 8 | Full colour, 300 DPI, matte laminate | `[TBD]` | `[TBD — OTH or team]` |
| A2 posters | 6 | Same, for tighter locations | `[TBD]` | `[TBD — OTH or team]` |
| Mounting — frames, standees or adhesive | 14 | Must match OTH's existing fixtures | `[TBD]` | `[TBD — OTH]` |
| Design and artwork | — | In-house | included in people cost | Team |
| **Print total** | | | `[TBD — quote needed]` | |

> Poster printing and mounting is the most likely line for OTH to absorb directly, since they
> will have an existing print vendor and existing fixtures. Flagged as a decision.

### 3.5 What we are asking OTH to provide (in kind)

None of these cost OTH money; all of them cost the project time if they are late.

| Item | Why it is needed | Needed by | Impact if late |
|---|---|---|---|
| **Floor plans, DWG/DXF, all 8 storeys, current revision** | The entire Phase 2 build | **25 Sep** | **Day-for-day slip on launch** |
| Signed release permitting our use of those plans | Legal basis for the above | 25 Sep | Blocks the above |
| Fire-safety / egress drawings | Ground truth on stairs, lifts, exits — the routing backbone | 25 Sep | Navigation layer authored on guesswork |
| Current tenancy schedule | Tenant names, unit numbers, operating hours | 13 Oct | Semantics layer stalls |
| Site access + lanyards for 6 people | UAT sessions and two verification passes | **8 Sep** | **Blocks 9 Sep UAT** |
| Approval to test with the public on site | UAT sessions | **8 Sep** | **Blocks 9 Sep UAT** |
| Confirmed testing dates beyond 9 Sep | Sessions 2–3 and UAT round 2 | 12 Sep | Smaller sample, weaker findings |
| Poster placement approval + fixtures | Discoverability at launch | 1 Dec | A map launches that nobody finds |
| Permission to photograph interiors | Verification evidence | 8 Sep | Verification degrades to `unverified` |
| A named OTH point of contact | Unblocking everything above | **immediately** | Everything above drifts |
| Guest Wi-Fi credentials | On-site work | 8 Sep | Mitigated by our own hotspot |
| Telegram bot setup / channel access | Coordination and notifications — see [§6.2](#62-telegram-bots) | 8 Sep | Manual coordination |

### 3.6 Budget summary

| Line | Estimate |
|---|---|
| People — 271 person-days | `[TBD — rate × 271]` |
| Infrastructure, Sep–Dec 2026 | ~S$100 total |
| Infrastructure, ongoing from 2027 | ~S$40–90 / mo |
| Equipment & consumables | ~S$700 |
| Poster print & mounting | `[TBD — quote]`, proposed for OTH to absorb |
| **Total** | `[TBD]` |

---

## 4. Posters & QR codes

**Purpose:** advertise that the map exists. A wayfinding tool nobody knows about helps
nobody, and OTH visitors have no reason to expect one.

### 4.1 QR code design specification

These are not aesthetic preferences. Each one is a failure mode we are avoiding.

| Property | Requirement | Why |
|---|---|---|
| **Error correction** | Level M (15%) minimum; Level H (30%) if a logo is overlaid | Survives scuffs, glare and partial obstruction on a wall in a busy hub |
| **Minimum printed size** | QR width ≥ (intended scan distance ÷ 10). **1.5 m → ≥15 cm. 3 m → ≥30 cm.** | The most common reason a poster QR fails is that it was designed at desk-viewing size |
| **Quiet zone** | 4 modules of clear space on all sides, no exceptions | Scanners fail without it, and designers routinely crop it away |
| **Contrast** | Dark code on light background, ≥4.5:1. **Never light-on-dark.** | A meaningful share of scanners cannot read inverted codes |
| **Artwork format** | Vector (SVG or EPS) into the print file, 300 DPI output | Raster QR codes soften at print size and lose module edges |
| **Mounting height** | Code centre at 1.2–1.4 m | Reachable and scannable seated, including from a wheelchair |
| **Placement** | Away from direct downlights and glass reflections | Glare defeats a phone camera before the code does |
| **Redundancy** | Printed short URL directly beneath the code, ≥18 pt | Someone will always fail to scan; give them a way through |

### 4.2 URL scheme

Every poster carries a **distinct location code**:

```
https://[DOMAIN — TBD]/m/<location-code>

  L1 Public Service Centre  →  /m/l1-psc
  L2 Library entrance       →  /m/l2-library
  L1 Gate 1 main entrance   →  /m/l1-gate1
```

Two reasons this matters more than one shared URL:

1. **"You are here" for free.** The code tells the app where the visitor is standing, so the
   first screen is a route from *here*, not a request to state their location — the single
   biggest source of friction for an elderly first-time user.
2. **Per-poster analytics.** We learn which locations actually earn scans and which are
   decorative, which directly informs where permanent signage should go later.

Codes are static — no dynamic redirect service, no third-party dependency, nothing to expire.

### 4.3 Poster content

Deliberately sparse. A visitor reads a poster in about two seconds while walking.

1. **Headline** — the offer, not the technology. *"Lost in the Hub? Scan to find your way."* /
   *"迷路了吗？扫码带您找到目的地。"* Bilingual, equal weight.
2. **The QR code** — the largest element on the poster.
3. **Three-word proof** — "Free · No app · English & 中文".
4. **The short URL** in readable type beneath the code.
5. **A step-free indicator** — a small wheelchair icon with "step-free routes available". The
   single most valuable thing to advertise to the visitors who need it most.
6. **OTH branding** per OTH's guidelines. `[TBD — OTH brand review]`

Deliberately **not** on the poster: a floor plan (it competes with the QR and dates
instantly), a feature list, or a screenshot.

### 4.4 Proposed poster locations

Fourteen locations, prioritised by a simple principle: **dwell time beats footfall.** A person
waiting is far more likely to scan than a person walking. Waiting areas first, entrances
second, decision points third.

#### Tier 1 — waiting areas (highest conversion, install first)

| # | Location | Level | Why here |
|---|---|---|---|
| 1 | Public Service Centre / ServiceSG waiting area | L1 | Highest intent density in the building — people already looking for somewhere specific, seated with nothing to do |
| 2 | HDB Branch Office waiting area | L2 | Same pattern, and a destination people struggle to find |
| 3 | Community Health Centre / Family Medicine Clinic waiting area | L1 | Long waits, high proportion of elderly visitors |
| 4 | Festive Arts Theatre foyer | L1 | Pre-show crowds standing still |

#### Tier 2 — entrances (awareness, high volume)

| # | Location | Level | Why here |
|---|---|---|---|
| 5 | Main entrance — Town Square side | L1 | Primary arrival point |
| 6 | MRT-side entrance / Tampines MRT link | L1 | Highest-volume arrival for non-drivers |
| 7 | Bus stop entrance | L1 | Arrivals who have not been before |
| 8 | Carpark lift lobby (B1 → L1) | B1 | Drivers arrive disoriented and underground |

#### Tier 3 — decision points (in-journey rescue)

| # | Location | Level | Why here |
|---|---|---|---|
| 9 | Lift lobby A | L1 | The moment of "which floor?" |
| 10 | Lift lobby B | L1 | As above |
| 11 | Escalator landing L1 → L2 | L2 | Arriving on an unfamiliar floor |
| 12 | Central Plaza / Town Square | L1 | The building's crossroads |

#### Tier 4 — destination anchors

| # | Location | Level | Why here |
|---|---|---|---|
| 13 | Tampines Regional Library entrance | L2 | Very high footfall; also serves people heading elsewhere afterwards |
| 14 | Round Market & Food Centre entrance | L1 | Highest sustained footfall in the hub |

> **Recommended soft-launch three (8 Dec):** #1 PSC/ServiceSG, #5 Main entrance, #13 Library.
> One from each of the top three tiers, so the soft launch measures the *pattern* and not just
> one location.

### 4.5 Visualization

A floor-plan visualization with all fourteen locations pinned and colour-coded by tier
accompanies this document. It uses the OTH 1st and 2nd storey site plans as the base.

**Still to do:** `[TBD — owner]` photograph each of the fourteen proposed locations on the next
site visit (9 Sep works — the team is already on site) and produce a photo mockup of the poster
in situ for each. Photographic mockups are what get placement *approved*; a floor-plan diagram
is what gets locations *agreed*. We need both, in that order.

---

## 5. User Acceptance Testing — 9 September

Ready to run as written. Translate, print, go.

### 5.1 Session logistics

| | |
|---|---|
| **Date** | Wednesday 9 September 2026 |
| **Time** | `[TBD — propose 10:00–16:00, to confirm with OTH]` |
| **Location** | `[TBD — OTH to designate a testing zone. Requested: near the Public Service Centre on L1, with seating]` |
| **Team on site** | 2 facilitators · 1 observer/scribe · 2 on the accuracy sweep · 1 floating for recruitment and OTH liaison |
| **Target** | 8–10 participants on the day; 24 across all sessions |
| **Session length** | 12–15 minutes per participant |
| **Incentive** | `[TBD — a small token, e.g. a S$5 voucher. Requires OTH approval]` |

### 5.2 Consent script

> "Hello, we're a team building a map to help people find their way around Our Tampines Hub.
> Could we borrow ten minutes of your time to try it and tell us what you think?
>
> There are no right or wrong answers — we're testing the map, not you. If something is
> confusing, that's exactly what we need to hear.
>
> We won't record your name or take your photograph. We'll note your age range and what you
> found easy or difficult. You can stop at any time.
>
> Is that alright?"

**中文：**

> "您好，我们是一个团队，正在制作一个帮助大家在淡滨尼天地找路的地图。可以占用您十分钟的时间试用一下，
> 并告诉我们您的想法吗？
>
> 没有对错之分 —— 我们测试的是地图，不是您。如果有任何让您困惑的地方，那正是我们需要知道的。
>
> 我们不会记录您的姓名，也不会拍照。我们只会记下您的年龄范围，以及您觉得容易或困难的地方。
> 您随时可以停止。
>
> 这样可以吗？"

☐ Verbal consent given · Participant ID: `P___` · Facilitator: `______` · Time: `______`

---

### Section A — About you *(关于您)*

**A1. Which age group are you in?** *(您属于哪个年龄段？)*
☐ Under 30 ☐ 30–44 ☐ 45–59 ☐ 60–74 ☐ 75+ ☐ Prefer not to say

**A2. Which language are you most comfortable in?** *(您最习惯使用哪种语言？)*
☐ English ☐ 中文 Mandarin ☐ Bahasa Melayu ☐ தமிழ் Tamil ☐ Other: ______

**A3. How often do you come to Our Tampines Hub?** *(您多久来一次淡滨尼天地？)*
☐ First time ☐ A few times a year ☐ Monthly ☐ Weekly ☐ Almost daily

**A4. Do you ever have difficulty finding places inside the Hub?**
*(您在天地内找地方时会遇到困难吗？)*
☐ Never ☐ Sometimes ☐ Often ☐ Every time

**A5. Do you use any of the following?** *(您有使用以下任何一项吗？)* — *tick all that apply*
☐ Wheelchair ☐ Walking stick or frame ☐ Pram or stroller
☐ I avoid stairs and escalators ☐ Reading glasses ☐ None of these

**A6. How comfortable are you using a smartphone?** *(您使用智能手机的熟练程度？)*
☐ Very comfortable ☐ Comfortable ☐ Not very ☐ I need help ☐ I don't use one

---

### 5.3 Tasks

> **Facilitator:** hand the participant the phone with the map already open at the home screen.
> Read the task aloud. Then stop talking. Do not point, do not hint. If they are genuinely
> stuck for 30 seconds, offer one hint and record it as an assist. After two assists, mark the
> task failed and move on kindly.

#### Task 1 — Same-floor destination

> *"You've come to the Hub today to renew a document at ServiceSG. Please use the map to find
> where ServiceSG is, and show me how you would walk there."*
>
> *"您今天来天地是要在 ServiceSG 更新一份证件。请用这个地图找到 ServiceSG 在哪里，并告诉我您会怎么走过去。"*

| | |
|---|---|
| Completed without help? | ☐ Yes ☐ Yes, with hints ☐ No |
| Time taken | ______ seconds |
| Number of hints given | ______ |
| Wrong turns / dead ends | ______ |
| **How easy was that?** *(刚才那个任务容易吗？)* | Very difficult 1 ☐ 2 ☐ 3 ☐ 4 ☐ 5 ☐ 6 ☐ 7 ☐ Very easy |
| What they said / did *(verbatim where possible)* | ________________________________ |

#### Task 2 — Cross-floor destination

> *"Now you'd like to borrow a book. Show me how you would get to the library from here."*
>
> *"现在您想借一本书。请告诉我您会怎么从这里去图书馆。"*

| | |
|---|---|
| Completed without help? | ☐ Yes ☐ Yes, with hints ☐ No |
| Time taken | ______ seconds |
| Hints given | ______ |
| **Did they understand they had to change floors?** | ☐ Immediately ☐ After looking ☐ Not until told |
| **How easy was that?** | Very difficult 1 ☐ 2 ☐ 3 ☐ 4 ☐ 5 ☐ 6 ☐ 7 ☐ Very easy |
| What they said / did | ________________________________ |

#### Task 3 — Step-free constraint

> *"Imagine today you cannot use stairs or escalators at all — only lifts. Show me how you
> would get to the HDB office."*
>
> *"假设您今天完全不能走楼梯或搭扶梯，只能坐电梯。请告诉我您会怎么去建屋局办事处。"*

| | |
|---|---|
| Completed without help? | ☐ Yes ☐ Yes, with hints ☐ No |
| Time taken | ______ seconds |
| Hints given | ______ |
| **Did they find the step-free option unprompted?** | ☐ Yes ☐ No — had to be told it existed |
| **Was the step-free route visibly different from the normal one?** | ☐ Yes ☐ No ☐ Couldn't tell |
| **How easy was that?** | Very difficult 1 ☐ 2 ☐ 3 ☐ 4 ☐ 5 ☐ 6 ☐ 7 ☐ Very easy |
| What they said / did | ________________________________ |

---

### Section B — Overall *(整体感受)*

*1 = Strongly disagree · 5 = Strongly agree · (1 = 非常不同意 · 5 = 非常同意)*

| | 1 | 2 | 3 | 4 | 5 |
|---|:-:|:-:|:-:|:-:|:-:|
| **B1.** I would use this map the next time I come to the Hub. *(下次我来天地会使用这个地图。)* | ☐ | ☐ | ☐ | ☐ | ☐ |
| **B2.** The map was easy to use. *(这个地图很容易使用。)* | ☐ | ☐ | ☐ | ☐ | ☐ |
| **B3.** I felt confident I was being sent to the right place. *(我有信心它把我指到正确的地方。)* | ☐ | ☐ | ☐ | ☐ | ☐ |
| **B4.** I could read everything on the screen comfortably. *(屏幕上的字我都看得清楚。)* | ☐ | ☐ | ☐ | ☐ | ☐ |
| **B5.** I would need someone to help me use this. *(我需要别人帮忙才能使用。)* **[reverse-scored]** | ☐ | ☐ | ☐ | ☐ | ☐ |
| **B6.** This would make me more likely to come to the Hub for things I need. *(这会让我更愿意来天地办事。)* | ☐ | ☐ | ☐ | ☐ | ☐ |

**B7. Would you have found this by yourself?** *(您自己会发现这个地图吗？)*
*Facilitator: show the draft poster.* "If you saw this poster in the Hub, would you scan it?"
☐ Yes, definitely ☐ Probably ☐ Probably not ☐ No — Why? ____________________

---

### Section C — In your own words *(请用您自己的话)*

**C1. What was the most confusing part?** *(哪个部分最让您困惑？)*

______________________________________________________________________

**C2. Was anything missing that you expected to find?** *(有没有您以为会有、但找不到的东西？)*

______________________________________________________________________

**C3. If you could change one thing, what would it be?** *(如果可以改一件事，您会改什么？)*

______________________________________________________________________

**C4. Was anything on the map wrong — somewhere shown in the wrong place?**
*(地图上有没有错的地方 —— 有什么被标错位置了吗？)*

______________________________________________________________________

> **Facilitator: C4 is the most valuable question on this form.** The Level 1 and 2 data was
> traced from outdated public plans and we know it is wrong in places. Every correction a
> participant gives us here is one we do not have to discover in November. Probe it. Write down
> exactly what they say, and where they were standing.

---

### 5.4 Observer tally sheet *(one per session, not per participant)*

| Observation | Tally |
|---|---|
| Participant tried to pinch-zoom the map | |
| Participant tried to rotate the map | |
| Participant looked for a "you are here" marker | |
| Participant asked "which floor am I on?" | |
| Participant held the phone at arm's length to read | |
| Participant asked a facilitator for the answer instead of using the map | |
| Participant used voice input | |
| Participant switched language | |
| Participant gave up and looked at physical signage instead | |
| App crashed, froze, or failed to load | |

### 5.5 Analysis plan

| Measure | Source | Target |
|---|---|---|
| Unassisted task completion, participants aged 60+ | Task sections | **≥70%** |
| Unassisted task completion, all participants | Task sections | ≥85% |
| Median Single Ease Question across all tasks | Task sections | **≥5 / 7** |
| SUS-lite composite (B1–B5, reverse-scoring B5) | Section B | **≥68** |
| Participants who completed zero tasks | Task sections | **0** |
| Step-free option found unprompted | Task 3 | ≥60% |
| Poster scan intent (definitely + probably) | B7 | ≥70% |
| Distinct map-accuracy corrections captured | C4 | *count, no target — more is better* |

Findings report to OTH by **30 September**, structured as: what worked · what failed and why ·
map corrections captured · the requirements delta for Phase 2.

---

## 6. Requests to OTH

Each of these has an owner on our side and a date, so nothing sits waiting on ambiguity.

### 6.1 Signed release of floor plans — critical path

| | |
|---|---|
| **What** | Floor plans for **all 8 storeys** of Our Tampines Hub, in **DWG or DXF** (vector CAD) — not PDF, not images. Plus **fire-safety / egress drawings**, and written confirmation of **which drawing revision is current**. |
| **Also needed** | A signed document permitting the team to use these drawings for the purpose of building the map. `[TBD — does OTH have a standard form, or should we draft one?]` |
| **Why vector, not PDF** | Vector CAD imports directly into the editor as room footprints with real dimensions and unit numbers. This is the difference between **generating** 8 storeys and **tracing** 8 storeys by eye — roughly a month of the schedule, and a large difference in accuracy. |
| **Why fire-safety drawings** | They are the authoritative record of stairs, lifts and exits, which are the backbone of the routing graph. They are also usually more current than marketing floor plans. |
| **Needed by** | **25 September 2026** |
| **If late** | Phase 2 slips day-for-day, and so does launch. |
| **If unavailable** | Fallback is tracing from the best available plans plus on-site measurement — approximately **+15 person-days** and materially lower accuracy. We would want that decision made consciously, not by default. |
| **Our owner** | Project Lead |

### 6.2 Telegram bots

| | |
|---|---|
| **What** | Setting up Telegram bots and the associated channel/group access. `[TBD — confirm exact purpose with OTH]` |
| **Our understanding** | Two plausible uses, and we would like OTH to confirm which is meant: **(a)** an internal coordination channel between the team and OTH staff during UAT and the build — alerts when a publish goes out, when the map changes, when something breaks; **(b)** a visitor-facing Telegram entry point into the map. **We recommend (a) for now** — a visitor-facing bot is a second product surface, would need its own scope, and is not part of the map-navigation brief. |
| **Needed by** | 8 September 2026 (in time for UAT coordination) |
| **What we need from OTH** | Whether OTH has an existing bot or channel for us to join, or whether we create one; who administers it; which OTH staff should be members. |
| **Our owner** | Project Lead |

### 6.3 Lanyards and site access

| | |
|---|---|
| **What** | Visitor or contractor lanyards and site access for **6 team members**, covering UAT sessions and two on-site verification passes. |
| **Why** | The team will be approaching members of the public, photographing interiors and taking measurements. Visible, official identification is what makes that appropriate rather than alarming — for the public, for tenants, and for OTH's own security staff. |
| **Also needed** | Written approval to (a) approach and test with the public on site, (b) photograph interiors for verification, (c) take physical measurements in public areas. Plus a briefing note we can show a tenant or security officer who asks what we are doing. |
| **Dates required** | **9 Sep** (committed) · 16 & 19 Sep *(to confirm)* · two full days in late Oct · two full days in mid Nov · 25 Nov · 8–15 Dec for poster installation |
| **Needed by** | **8 September 2026** — this blocks the 9 September UAT |
| **Our owner** | Project Lead |

### 6.4 Testing dates and public participation

| | |
|---|---|
| **Confirmed** | Wednesday 9 September 2026 |
| **Requested** | Wednesday 16 September · **Saturday 19 September** · Wednesday 25 November (UAT round 2) |
| **Why a Saturday** | A Wednesday daytime sample skews retired and elderly. That is genuinely our most important user group, so 9 Sep is well chosen — but it will under-represent working adults, families with prams, and first-time visitors. One weekend date gives a materially different mix and makes the findings defensible. |
| **What we need from OTH** | Confirmation of dates and hours · a designated testing zone with seating, ideally near the Public Service Centre on L1 · whether OTH staff can help recruit participants (an OTH staff member's invitation is far more effective than a stranger's) · approval for a small participant token `[TBD]` · whether OTH wants an observer present. |
| **Target sample** | 24 participants across sessions, with quotas: ≥10 aged 60+ · ≥3 using a mobility aid · ≥8 Mandarin-first · ≥6 first-time or infrequent visitors |
| **Needed by** | 12 September 2026 for the September dates |
| **Our owner** | Project Lead |

### 6.5 Tenancy schedule

| | |
|---|---|
| **What** | Current tenant and service list — name, unit number, level, operating hours, and where applicable the counter or agency. |
| **Why** | It is the source for the semantics layer. Without it we are transcribing from signage and public web pages, which is how the hackathon data went stale. |
| **Needed by** | 13 October 2026 |
| **Our owner** | Map Author B |

### 6.6 Named point of contact

| | |
|---|---|
| **What** | One named person at OTH empowered to unblock the items above, plus a backup. |
| **Why** | Every request in this section has a date attached. Without a single owner on OTH's side they will be chased individually and arrive late individually. |
| **Needed by** | **Immediately** |
| **Our owner** | Project Lead |

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Floor plans arrive late, or only as PDF** | **High** | **High** | Requested on day one with an explicit date. Fallback is tracing plus on-site measurement (+15 person-days, lower accuracy) — but the decision gets made deliberately, and OTH is told what it costs. Laser measures are budgeted regardless. |
| Plans are outdated again, and nothing says so | Medium | High | Every room and tenant carries a verification status with evidence and an author. Publishing warns on anything never checked against the real building. Two on-site verification passes are scheduled, not optional. |
| 9 Sep site access not approved in time | Medium | High | Escalate 5 Sep if unconfirmed. Fallback: run the session in a public area of the hub as ordinary visitors, with a reduced protocol and no photography. |
| Too few participants, or the wrong mix | Medium | Medium | Three sessions rather than one; a weekend date; OTH staff assistance with recruitment; quotas tracked live during each session rather than counted afterwards. |
| Authoring 8 storeys takes longer than estimated | Medium | High | Levels are independent, so the work parallelises across two authors. CAD import is the lever that makes the estimate hold. L1–L2 are authored first, so a slip degrades to a phased launch rather than no launch. |
| 3D dressing assets too heavy for phones | Low | Medium | Budgets enforced server-side on upload: 5 MB and 150k triangles per asset, 25 MB per level. Compression on ingest. The dressing layer is inert, so worst case it is switched off without affecting routing. |
| Posters go up but nobody scans them | Medium | Medium | Per-poster location codes make this measurable within a week. Soft launch tests three locations across three tiers before committing to all fourteen. Waiting areas prioritised over entrances on the dwell-time argument. |
| Map goes stale after handover as tenants change | **High** | **High** | Tenant records carry validity dates, so "this unit changed in March" is expressible. Handover includes editor training and an agreed maintenance model. **This is the biggest long-term risk to the product and needs a written answer before launch, not after.** `[TBD — OTH + Project Lead]` |
| Six-person team not available at the assumed capacity | `[TBD]` | High | Confirm each person's real availability before committing this timeline to OTH. |

---

## 8. Open decisions

Ordered by how soon they block something.

| # | Decision | Owner | Needed by |
|---|---|---|---|
| 1 | Confirm 9 Sep site access, testing zone, lanyards | OTH | **8 Sep** |
| 2 | Confirm what the Telegram bots are for — internal coordination or visitor-facing | OTH | 8 Sep |
| 3 | Confirm the participant incentive, if any | OTH | 8 Sep |
| 4 | Confirm testing dates beyond 9 Sep, including a weekend date | OTH | 12 Sep |
| 5 | Day rate and total commercial envelope | Project Lead + OTH | `[TBD]` |
| 6 | Confirm each team member's real availability | Project Lead | 12 Sep |
| 7 | Floor plans: DWG/DXF, all 8 storeys, current revision, with signed release | OTH | **25 Sep** |
| 8 | Who owns the production domain — OTH or the team | OTH | before QR artwork is final, **26 Sep** |
| 9 | Who pays for poster printing and mounting | OTH | 1 Nov |
| 10 | Product name — "OTH Navigator" is a working title, not a brand | OTH + team | before launch |
| 11 | Maintenance and update model after handover | OTH + Project Lead | before launch |
| 12 | Confirm the proposed 15 Dec launch date | OTH | 30 Sep |

---

## Appendix A — Glossary

| Term | Meaning |
|---|---|
| **OTH** | Our Tampines Hub |
| **UAT** | User Acceptance Testing |
| **DWG / DXF** | Vector CAD drawing formats. Directly importable, unlike PDF. |
| **Structure layer** | Room footprints and heights. Load-bearing for routing. |
| **Navigation layer** | Walkable surface, doorways, entrances, lifts and escalators. Load-bearing for routing. |
| **Dressing layer** | Hand-modelled 3D landmarks. Visual only — cannot affect a route. |
| **Semantics layer** | Tenants and services bound to rooms. Powers search. |
| **Portal** | A vertical connection between levels — lift, escalator or stair. Carries a step-free flag. |
| **Doorway** | An explicit passable segment on a boundary shared by two rooms. |
| **Publish** | Snapshotting the editable model into an immutable, versioned bundle. The visitor app only ever reads a published bundle. |
| **Validation gate** | The check that runs at publish. Errors block; warnings do not. |
| **Verification status** | `unverified` · `photo` · `onsite` · `cad` — how a room or tenant was confirmed against the real building. |
| **Step-free** | A route usable without stairs or escalators. |
| **SEQ** | Single Ease Question — a one-item post-task difficulty rating. |
| **SUS** | System Usability Scale. 68 is the established average; above it is above-average usability. |

## Appendix B — Related documents

| Document | What it is |
|---|---|
| `docs/design-and-plans/specs/2026-09-04-oth-map-model-design.md` | The technical design for the map model, editor and publish pipeline |
| `docs/PRD.md` | The hackathon product requirements — historical context, superseded in scope |
| `research/README.md` | Where every service location in the prototype came from, and what was never verified |
| `README.md` | Repository overview and current build state |
