# Design & build journal

This folder is the **paper trail of how OTH Navigator was built** — feature by feature,
designed and implemented while pair-programming with an AI coding assistant.

Each major feature went through the same loop:

1. **Brainstorm** the idea (what problem, for whom, what's the simplest thing that works).
2. Write a **spec** in [`specs/`](specs/) — the *what and why*: the design, the data
   shapes, the trade-offs considered, the things explicitly left out.
3. Write an **implementation plan** in [`plans/`](plans/) — the *how*: an ordered,
   checkable list of steps to build it, often with the exact files and test cases.
4. **Execute** the plan, ticking off steps and adjusting as reality pushed back.

So a good way to read any feature is **spec first (why it looks like this), then plan
(how it got built).** The plans are detailed and long — they were working documents, not
polished prose — so skim the headers.

> Dates in filenames are when each doc was written, so the folder doubles as a rough
> timeline of the build.

---

## Feature map — spec ↔ plan

| Feature | Spec (the *what & why*) | Plan (the *how*) |
|---|---|---|
| **2.5D map & navigation core** — the base app: traced floors, the guide agent, waypoint routing, the senior-friendly shell | [`specs/2026-05-22-oth-2_5d-navigation-design.md`](specs/2026-05-22-oth-2_5d-navigation-design.md) | [`plans/2026-05-22-oth-2_5d-navigation.md`](plans/2026-05-22-oth-2_5d-navigation.md) |
| **Service catalog** — the stub backend + the service data model | [`specs/2026-05-23-oth-service-catalog-stub-design.md`](specs/2026-05-23-oth-service-catalog-stub-design.md) | [`plans/2026-05-23-service-catalog-stub.md`](plans/2026-05-23-service-catalog-stub.md) |
| **Live enrichment layer** — counter loads / real-data overlay | [`specs/2026-05-26-live-enrichment-layer-design.md`](specs/2026-05-26-live-enrichment-layer-design.md) | [`plans/2026-05-23-real-data-enrichment.md`](plans/2026-05-23-real-data-enrichment.md) |
| **Intent-first navigation** — resolve "why you came" → the right service | [`specs/2026-05-26-oth-intent-first-navigation-design.md`](specs/2026-05-26-oth-intent-first-navigation-design.md) | [`plans/2026-05-26-intent-first-navigation-phase1.md`](plans/2026-05-26-intent-first-navigation-phase1.md) |
| **Time-aware crowd routing** — route flips with the time-of-day crowd | [`specs/2026-05-29-time-aware-crowd-routing-design.md`](specs/2026-05-29-time-aware-crowd-routing-design.md) | [`plans/2026-05-29-time-aware-crowd-routing.md`](plans/2026-05-29-time-aware-crowd-routing.md) |

## Plans without a standalone spec

Smaller or later additions that went straight to a plan:

- [`plans/2026-05-26-real-counter-data-besttime.md`](plans/2026-05-26-real-counter-data-besttime.md) — pulling **real foot-traffic** from the BestTime API (off by default; the app ships with modeled curves).
- [`plans/2026-05-26-offsite-services-plan.md`](plans/2026-05-26-offsite-services-plan.md) — handling services that live **outside** OTH ("Start in App" hand-off).
- [`plans/2026-05-26-fragmentation-dashboard-plan.md`](plans/2026-05-26-fragmentation-dashboard-plan.md) — the **ops analytics dashboard** side-quest (visitor flow / counter loads).
- [`plans/2026-09-05-presence-and-locks.md`](plans/2026-09-05-presence-and-locks.md) — **who else is in the editor** and what they are holding; the client half of §10 of the map-model spec.

---

## OTH production phase (2026-09 onwards)

After the hackathon, OTH engaged us to take the map forward as a production web
application. That work starts from a new model and new authoring tooling; the
hackathon floor data is superseded.

| Feature | Spec | Plan |
|---|---|---|
| **Map model & editor** — the four-layer model, hosted multi-user editor, Blender round trip, publish pipeline | [`specs/2026-09-04-oth-map-model-design.md`](specs/2026-09-04-oth-map-model-design.md) | 1. [`plans/2026-09-04-map-model-foundation.md`](plans/2026-09-04-map-model-foundation.md)<br>2. [`plans/2026-09-04-map-model-server.md`](plans/2026-09-04-map-model-server.md)<br>3. [`plans/2026-09-04-map-model-editor.md`](plans/2026-09-04-map-model-editor.md)<br>4. [`plans/2026-09-04-dressing-and-round-trip.md`](plans/2026-09-04-dressing-and-round-trip.md) |
| **Editor usability** — floorplan underlay, scale calibration, guided per-level flow, direct manipulation | [`specs/2026-09-05-editor-usability-design.md`](specs/2026-09-05-editor-usability-design.md) | A. [`plans/2026-09-05-floorplan-underlay.md`](plans/2026-09-05-floorplan-underlay.md)<br>B. [`plans/2026-09-05-usable-authoring.md`](plans/2026-09-05-usable-authoring.md) |
| **Pathways & space kinds** — drawn pathway network replaces room adjacency; room/area/detail split | [`specs/2026-09-05-pathways-and-space-kinds-design.md`](specs/2026-09-05-pathways-and-space-kinds-design.md) | [`plans/2026-09-05-pathways-and-space-kinds.md`](plans/2026-09-05-pathways-and-space-kinds.md) |
| **Details & the dressing round trip** — a drawn detail polygon briefs, anchors and checks a modelled mesh | [`specs/2026-09-05-details-and-dressing-design.md`](specs/2026-09-05-details-and-dressing-design.md) | [`plans/2026-09-05-details-and-dressing.md`](plans/2026-09-05-details-and-dressing.md) |
| **Survey labelling** — footage → tenant catalogue + adjacency graph, with evidence, before any floorplan exists | [`specs/2026-09-05-survey-labelling-design.md`](specs/2026-09-05-survey-labelling-design.md) | [`plans/2026-09-05-survey-labelling.md`](plans/2026-09-05-survey-labelling.md) |
| **Workspace overhaul** — one app organised by floor: Floors home, Survey · Review · Build workspaces, team accounts, deploy | [`specs/2026-09-27-workspace-overhaul-design.md`](specs/2026-09-27-workspace-overhaul-design.md) | 1. [`plans/2026-09-27-workspace-foundation.md`](plans/2026-09-27-workspace-foundation.md)<br>2–4. Survey & Review, Build, Deploy — to follow |
