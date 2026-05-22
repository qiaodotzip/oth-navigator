# Verification gaps

> Anything in this file is **not safe to ship** without a phone call or on-site visit.
>
> Sources tried (cross-cutting): OTH Hub Guide PDF (`images/othhubguide2020.pdf`),
> PA Festive Mall Directory (https://www.pa.gov.sg/our-network/our-tampines-hub/festive-mall-directory/),
> PA Hub Info page (https://www.pa.gov.sg/our-network/our-tampines-hub/hub-info/),
> Wikipedia (Our_Tampines_Hub, Tampines_Regional_Library), HDB Tampines Branch page
> (returned 404), NLB Tampines Regional Library page (returned blank), ServiceSG
> centre finder (connection refused), Singapore Red Cross locations page (404).

## Failed sources

- **PA Tenants Directory List PDF** (`https://www.pa.gov.sg/files/Our%20Network/Our%20Tampines%20Hub/OTH%20Tenants%20Directory%20List.pdf`) — HTTP 404. The PA-hosted Festive Mall Directory web page (cached as of 29 April 2026 per the page banner) was used as a substitute and turned out to be a superior, structured source.
- **tampines-hub.com/shops** — socket connection dropped on every attempt. The site appears to be a community-run aggregator; could not retrieve.
- **HDB Tampines Branch page** (`hdb.gov.sg/.../tampines-branch`) — HTTP 404. HDB may have moved the canonical URL.
- **NLB Tampines Regional Library pages** — three URL variants all returned blank content; the NLB site likely requires JavaScript rendering not supported by the fetcher.
- **myactivesg.com** ActiveSG sport centre page for OTH — 404 on both URL variants tried.
- **PA Hub Info page** — loaded but is high-level marketing copy with no facility directory.

## Per-entry gaps

### L1

- **Public Service Centre (PSC)** — missing: complete list of the 13 agency counters (only ServiceSG Centre, e2i and Family Nexus surfaced via PA directory). The PDF mentions "13 key agencies" but does not enumerate them.
- **Public Service Centre — accessibility** — missing: wheelchair access, queue-system accessibility, audio-induction loops. Tried: PDF, PA hub-info page, PA directory. None publish accessibility statements.
- **ServiceSG Centre** — missing: opening hours (PSC umbrella hours apply, but ServiceSG nationally posts per-centre hours that we could not retrieve due to ECONNREFUSED on `servicesg.gov.sg/find-a-centre`).
- **e2i** — missing: opening hours, accessibility.
- **Family Nexus** — missing: opening hours, exact services offered at OTH branch, accessibility.
- **Hawker Centre (Kopitiam)** — missing: per-stall hours, list of stalls. Only the unit range `#01-31 to #01-73` and "40+ stalls, 800 seats" are confirmed.
- **Festive Walk / Festive Plaza / Central Plaza** — missing: precise floor-plan coordinates and lift/ramp access points. Floor-plans in the PDF (pages 32-33) are diagrammatic only.
- **Town Square accessibility** — missing: wheelchair seating block, lift access from L1 thoroughfare to the seating bowl.
- **Arena @ OTH accessibility** — missing: accessibility of locker/shower facilities, step-free entry to courts.
- **Gate 1** — missing: opening hours, capacity, accessibility, exact L1 position.
- **South Arrival Plaza & North Arrival Plaza** — missing: explicit accessibility provisions (kerb cut-outs, wheelchair-accessible taxi guarantee).
- **L1 Festive Mall retail accessibility** — missing across the board: no published accessibility data for any L1 retail/F&B tenant (7-Eleven, McDonald's, Starbucks, Sushiro, Valu$, Old Chang Kee, etc.). Tried: PA directory. Tenants do not publish per-unit accessibility.
- **L1 Festive Mall hours** — missing: per-tenant operating hours. PA directory does not list hours; PDF page 31 only covers hub-level facilities.
- **AXS Station / SAM Kiosk** — missing: confirmation these are accessible 24/7 (likely yes, but unverified).

### L2

- **Tampines Regional Library** — missing: explicit lift / wheelchair / accessible toilet locations, holiday-eve hours confirmation (PDF says "closes 5pm" on Christmas Eve etc., but year-on-year may shift). Tried: NLB site (blank), Wikipedia (gives unit number only).
- **HDB Tampines Branch (#02-82)** — missing: opening hours, services (sales / resale / rental / building plan submission), accessibility. Tried: HDB branch page (404).
- **Singapore Red Cross @ OTH (#02-06)** — missing: opening hours, public-facing services (training? donation centre? volunteer recruitment?), accessibility. Tried: Singapore Red Cross locations page (404).
- **Q&M Dental (#02-89)** — missing: opening hours, accepting walk-ins?, accessibility.
- **Team Sports Hall** — missing: published opening hours by sport, spectator-side accessibility (1,800 seats; wheelchair-space allocation not published).
- **Festive Arts Theatre** — missing: wheelchair seating row, hearing-loop availability, ticketing-counter location on L2.
- **Our Tampines Gallery** — missing: explicit opening hours (tied to library, but no separate statement).
- **Sky Terrace** — missing: lift route from L1 to L2 Sky Terrace, opening hours (open-air terrace; likely matches hub hours but unverified).
- **Rock Wall Climbing (Sky Terrace)** — missing: operator name (BFF Climb at #02-81 looks like a candidate but cannot be confirmed as the Sky Terrace rock wall operator), opening hours, booking link, safety/age restrictions.
- **Visitor Centre** — missing: opening hours, staffing hours.
- **Pedestrian Overhead Bridge** — missing: confirmation that the bridge is actually built and open (PDF uses "will feature" — pre-2020 future tense). Needs a 2026 on-site or news verification.
- **L2 enrichment centres** (BFF Climb, Cristofori Music, Heguru, Achievers Arts) — missing: opening hours, age groups, accessibility.
- **L2 D'Penyetz (#02-90/91)** — missing: opening hours, accessibility.

## Major absences worth flagging

- **No polyclinic at OTH.** The closest is the Tampines Polyclinic, which is a separate SingHealth building **not inside OTH**. Inside OTH, on L3 (not in scope here but worth noting for the demo): Tampines Family Medicine Clinic (managed by Changi General Hospital) and Community Health Centre — not a polyclinic.
- **NTUC FairPrice is on B1, not L1.** The PA Festive Mall Directory places `NTUC Fairprice` at `#B1-01`. Wikipedia and the PDF both describe Festive Mall as "anchored by a supermarket", which matches.
- **24/7 Fitness gym is on L3 (#03-03/04), not B1.** The PA directory listed it under B1 services but the unit prefix `#03-` reveals it is actually on L3. This is a directory categorisation quirk; treat the unit number as authoritative.
- **Jolly Jungle is on L3 (#03-02), entered via the Library on L2.** Worth noting if the demo picks indoor playgrounds.
