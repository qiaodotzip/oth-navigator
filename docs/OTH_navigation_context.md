# One Tampines Hub Indoor Navigation — Technical Context Summary

> Carryover document from a prior conversation. This summarizes the technical
> options discussed for building indoor navigation in One Tampines Hub (OTH),
> contextualized for a Tampines hackathon project focused on fragmented
> services navigation.

---

## Project context

**Problem statement (high level):** services at One Tampines Hub are
fragmented across many providers. Some can be handled online; many require
visiting a specific physical office to book or transact. Users (especially
elderly, disabled, or unfamiliar visitors) struggle to know *where to go*
inside the building once they arrive.

**The team's intended solution:**
1. Web search + data retrieval to collate a database of OTH services
2. LLM layer to answer "where do I go for X" type questions
3. Physical navigation layer — directs users to the specific area inside OTH
   and how to get there, ideally with accessibility-aware routing
   (wheelchair-only, step-free, etc.)

**The user's role:** the physical navigation layer.

**Constraints:** minimize physical modeling, minimize on-site photo capture.
Prefer to leverage existing services and data sources.

---

## Why this is genuinely hard (and why it's a real opportunity)

Most major indoor venues in Singapore are *poorly* covered by existing map
providers. Google Maps relies on user-contributed 360 photos and venue-
submitted data, which clusters at entrances and main atriums and falls off
in corridors, upper floors, and back-of-house. Apple Maps Indoor and Mapbox
Indoor cover even less. For OTH specifically, you can find some indoor 360
imagery on Google Maps but it's incomplete and not navigable as a routable
graph.

This means: there's no off-the-shelf "indoor Google Maps" you can just plug
into. You'll need to construct your own spatial representation, but you can
keep it minimal if your goal is navigation guidance rather than full 3D
reconstruction.

---

## The key reframe

The instinct toward "build a 3D model" is natural but probably oversized for
the actual job. The user doesn't need a navigable 3D world — they need to
know *which way to go next*.

Two distinct product approaches were discussed:

**Approach A — Spatial reconstruction.** Build an actual navigable 3D model
of OTH (mesh + navigation graph), then route users through it. Harder, more
infrastructure, more impressive demo if pulled off.

**Approach B — Spatial reasoning.** Accept that the data is sparse. Use an
LLM agent to reason verbally about navigation given whatever data you have
(floor plans, signage, photos, sparse 360s) plus the user's current photo
or stated location. Way more tractable, ships faster, scales better.

For a hackathon with the team's stated scope (LLM + service database +
navigation guidance), **Approach B is the obvious fit.** The 3D model, if
included, is a *visual aid* for the navigation answer, not the navigation
engine itself.

---

## Technical options for the 3D / map layer (lightest to heaviest)

### Option 1 — No 3D model. 2D floor plans only.

OTH has publicly available floor plans (look at the People's Association
site, OTH's own marketing materials, planning approval documents, and
Tampines Town Council pages). For each level, you have a 2D top-down map
showing where rooms and services are located.

This is genuinely enough for navigation in many cases:
- Highlight the user's destination on the floor plan
- Mark the nearest lift / staircase / accessible entrance
- Add a small "you are here" marker if you know the user's starting point
- Show level transitions as a small floor-selector

Pros: lightest weight, zero modeling, ships in hours.
Cons: less wow factor than 3D.

### Option 2 — Extruded floor plans (2.5D)

Take the same 2D floor plans, extrude each room/space into simple blocks at
correct heights. Render in three.js or React Three Fiber. You get a
stylized "diorama" view of each floor without modeling individual buildings.

Tools:
- Trace floor plans in SVG, extrude with three.js `ExtrudeGeometry`
- Or use Blender briefly to extrude polygons and export as glTF

Pros: visually richer than 2D, still light. Same source data (floor plans).
Cons: not photorealistic, but stylized fits your hackathon aesthetic.

### Option 3 — Mapbox-style polygon massing model

For the *exterior* and surrounding context only. Mapbox GL JS with 3D
buildings enabled gives you OTH and the surrounding Tampines area as
extruded polygons automatically, from OpenStreetMap data. The building's
external footprint and approximate height are already in OSM. Zero modeling
required for the exterior shell.

Useful if your demo wants to start with "here's OTH from outside" and zoom
into the building. Not useful for the interior — Mapbox doesn't know what's
inside.

Pros: free, fast, looks polished. Same approach the hackathon winner used.
Cons: only gives you the exterior. Interior still needs separate handling.

### Option 4 — Google Photorealistic 3D Tiles

Real photogrammetric meshes of cities including Singapore. Render in your
own three.js / Cesium scene via Google's API.

Pros: looks impressive, accurate exterior.
Cons: slower to load, can't see inside the building, may not show OTH's
distinctive details well at the resolution you need. Overkill for this
project.

### Option 5 — Hand-modeled low-poly OTH

Spend 2-4 hours in Blender building a stylized low-poly version of OTH
using floor plans + Google Street View as reference. Owned, clean, fully
controllable.

Pros: maximum control, can include interior shells.
Cons: time-expensive. Probably not worth it for a hackathon.

### Option 6 — Photogrammetry from on-site capture (skipped per constraints)

Polycam / Luma AI walkthrough. Not pursued because the user wants to
minimize physical modeling and photo capture.

---

## Recommended stack for this hackathon project

Given the constraints (minimize physical capture, want accessibility-aware
routing, focus on directing users to specific areas, LLM does the
intelligence), the recommended approach is:

**Core navigation: spatial reasoning via LLM, not spatial reconstruction.**

1. Build a database of OTH services with associated metadata:
   - Service name, provider, what it handles
   - Location: floor, zone, room number, nearest landmark
   - Accessibility: step-free access, wheelchair-accessible, near lift
   - Hours, online vs in-person options
   - Source URL for verification

2. Source floor plans for OTH (the publicly available ones) and either:
   - Render them as 2D images with overlaid annotations (Option 1)
   - Extrude them into 2.5D polygons for a stylized diorama view (Option 2)

3. When the user asks "where do I go for [service]," the LLM:
   - Looks up the service in the database
   - Identifies the destination (floor, zone, landmark)
   - Considers user constraints (wheelchair, mobility, with stroller, etc.)
   - Produces a natural-language route ("Enter through the main entrance.
     Take the lift on your right to level 3. Walk straight until you see
     the community library; the service center is the second door on the
     left.")
   - Highlights the destination on the floor plan view

4. **Optional polish (do last if at all):** allow the user to photograph
   their current surroundings; vision model identifies signage and
   landmarks to ground the user's current position more precisely.

This delivers the *navigation guidance* the user needs without requiring
a full 3D model. The 2D or 2.5D floor plan visualization is the visual
anchor; the LLM does the routing logic.

---

## Accessibility routing — concrete approach

You don't need a full pathfinding graph to do useful accessibility routing.
Tag each destination and route segment in your database with:

- `requires_stairs: bool`
- `lift_access: bool`
- `step_free_entrance: bool`
- `accessible_restroom_nearby: bool`
- `nearest_disabled_parking: location`

When the user selects "wheelchair / step-free routing," the LLM filters
which routes to suggest. You're not solving a graph problem; you're
filtering metadata before producing the natural-language directions.

This is achievable in the hackathon timeline and is a real, demoable
accessibility feature — strong differentiator for judges.

---

## Stack recommendation

- **Frontend:** Next.js + Tailwind + a 2D/2.5D floor plan viewer
  (either a static image overlay with hotspots, or three.js / R3F for an
  extruded floor plan diorama).
- **Data:** JSON file of services + floor plan annotations. No real
  database needed for a hackathon.
- **LLM:** GPT-4 or similar for the navigation reasoning. Vision model
  (GPT-4o, Claude with vision, Gemini) for optional photo-based
  localization.
- **Floor plans:** sourced from public materials; trace them as SVG
  polygons for the 2.5D version.

---

## Demo arc to aim for

A clean 2-3 minute demo flow:

1. User says: "I need to renew my passport / book a sports facility / see
   a doctor / [other OTH service]."
2. System looks up the relevant service in the database, identifies the
   exact location.
3. User toggles accessibility constraints (wheelchair-only,
   stroller-friendly, etc.).
4. System produces:
   - Natural-language route from main entrance to destination
   - Visual highlight on the floor plan (2D or 2.5D)
   - Notes on lift access, accessible entrances, distance/time estimate
5. Optional: user takes a photo at a decision point; system updates the
   route based on actual signage visible in the photo.

The wow moment: someone with a wheelchair gets a different, valid route
than someone without — demonstrably more useful than the existing OTH
website or Google Maps for indoor navigation.

---

## What to skip

- Full 3D reconstruction of OTH interior
- On-site photogrammetry or panorama capture
- Custom pathfinding algorithms (A*, Dijkstra) on real graphs — the LLM
  produces routes in natural language, no graph needed
- Generative image fill of unmapped corridors (was discussed and rejected
  due to the "confidently wrong navigation" problem — generated content
  could mislead users in physical space)
- Mobile app — desktop or mobile web for the demo is enough

---

## Open questions for the new chat to address

- How is the team sourcing the OTH services database? Manual collation or
  scraped from OTH website + partner sites?
- How many services need to be covered for the demo to feel real? (5-10
  high-impact ones is probably enough — passport, library, sports facility
  booking, doctor, community programs, etc.)
- Is there an existing OTH floor plan PDF the team has access to? That's
  the single most important input.
- Will the LLM have access to live data (current hours, available
  appointments) or static metadata only? Static is fine for the hackathon.
- How long is the hackathon, and what's the team composition?
