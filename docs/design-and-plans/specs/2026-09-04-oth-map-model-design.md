# OTH Map Model — design

> **Status:** approved 2026-09-04. Supersedes the hackathon floor format
> (`public/data/floors/L*.json`) entirely.
> **Scope of this spec:** the map model and the tooling that authors it —
> schema, backend, hosted editor, Blender/Rhino round trip, publish pipeline.

---

## 1. Context

After placing 5th at the Tampines AI JOM Hackathon, OTH asked us to take the map
half forward as a **production web application** that OTH will run and real
visitors will use. The building has **8 storeys**.

The hackathon map cannot carry that. Three findings from reading the existing
code drive this design:

1. **There is no 3D model.** `public/data/floors/L*.json` holds 2D point rings
   with a `heightMeters` scalar; `src/world/Floor.tsx` extrudes them at runtime.
   Everything else is `Detail[]` — rects tagged with one of ~35 hardcoded `type`
   strings, dispatched by `src/world/FloorDetails.tsx` to hand-written React
   Three Fiber components in `src/world/details/primitives.tsx` (2,203 lines).
   A grep for `useGLTF`, `GLTFLoader`, `.glb`, `.obj`, `.fbx` returns **nothing**:
   there is no asset pipeline of any kind, and no way for a human-authored mesh
   to enter the app.
2. **The geometry is the routing graph.** `src/routing/pathfinder.ts` derives its
   A* grid from the walkable polygons; `services.json` binds each service to a
   `roomId` that must match a polygon id; `entrances.json` and `waypoints.json`
   carry raw floor-local coordinates. Geometry changes silently change routing.
3. **The authoring tools are single-user and dev-only.** `PolygonEditor.tsx` and
   `DetailEditor.tsx` persist to `localStorage` and `POST /api/save-floor`, which
   writes files on localhost and is hard-disabled in production
   (`server/index.ts:56`). Three or four people cannot use them.

The existing L1/L2 content is also **inaccurate** — it was traced from outdated
floor plans. It is not migrated. Its value to this project is as reference, not
as data.

### What we are keeping

The hackathon's routing engine, A* pathfinder, narration layer and
senior-friendly UI are floor-data-agnostic and genuinely good. They are **out of
scope for this run** but are not being thrown away; the published bundle (§7) is
designed so they — or any other viewer — can consume the new model.

---

## 2. Goals

- A map model that supports **8 storeys** and is accurate enough for a public
  service to route people through.
- **Three to four non-technical teammates author it concurrently**, server-side,
  through a browser. No git, no terminal, no npm.
- A teammate skilled in **Rhino/Blender** can add detail to specific areas
  through a clean round trip, without being able to break routing.
- Visitors can **recognise where they are** — roughly 20 hero landmarks are
  individually modelled; everything else is procedural.
- The production app never renders a half-finished edit.
- Authoring 8 floors is **tracing and placing**, not modelling — and is close to
  automatic if OTH supplies vector CAD.

## 3. Non-goals

Explicitly out of scope for this spec and this build:

- **The visitor-facing app.** No changes to the hackathon viewer, routing engine,
  narration or UI. Deferred to its own project.
- **The photo/video labelling tool.** A different problem with a different UI;
  its own spec. The model schema reserves the fields it will write (§12).
- **Real-time co-editing (CRDT / Figma-style).** Per-entity locking plus presence
  (§10) covers a team of four at a fraction of the cost.
- **Self-serve editing by OTH staff.** Confirmed: only our team maintains the
  map. The editor needs no role hierarchy or approval workflow.
- **Photogrammetry / automated reconstruction.** No LiDAR capture is available;
  we do not attempt metric reconstruction from photographs.

---

## 4. Architecture — four layers

The model is four thin layers. **Each layer has exactly one authoring tool, and
exactly one of them is load-bearing for routing.**

| Layer | Contents | Authored in | Load-bearing? |
|---|---|---|---|
| **Structure** | Room footprints + heights, per level, on a shared building datum | Editor, plan view | Yes — everything |
| **Navigation** | Walkable surface, doorways, portals, nav hints | Editor, derived + corrected | Yes — routing |
| **Dressing** | `.glb` hero assets placed by transform | Blender/Rhino → uploaded → placed in editor | **No** |
| **Semantics** | Tenants, services, counters bound to room ids | Editor / CSV import | Search + POIs |

### Why the dressing layer is deliberately inert

Nothing in routing, collision or reachability reads a `.glb`. This is the central
safety property of the design. A teammate can re-topologise a corridor mesh, get
the scale wrong, or upload a broken export, and the worst outcome is that it
*looks* wrong — the route still works, the room ids still resolve, and the fix is
replacing one file.

The cost is real and should be stated plainly: **genuinely 3D structure cannot be
expressed structurally.** A curved atrium wall, a mezzanine or a split level must
be a dressing asset with a simplified footprint underneath for routing. For OTH
this is a survivable limitation; if it stops being survivable, the escape hatch
is adding footprint holes and multiple footprints per room, not making meshes
load-bearing.

---

## 5. Coordinate system

The hackathon gave every floor its own local frame, flipped Y at render time
(`depth - y` in `Floor.tsx`) and offset by `bounds/2`. Floors did not align with
each other, which is survivable for two floors and not for eight.

**One building origin for all levels.**

- **Plan coordinates** are `(x, y)` in **metres**, `x` east, `y` north, from a
  single building origin. Stored as-is; no flipping, no per-level offsets.
- **Elevation** is a per-level `elevationM` above datum, plus `heightM` for the
  floor-to-floor height. Levels stack correctly by construction.
- **The renderer** maps model `(x, y, elevation)` to three.js `(x, elevation, -y)`
  in one place, in `packages/renderer`. That mapping exists exactly once.
- **Georeference** is stored on the building: `anchorLat`, `anchorLng`, and
  `rotationDeg` (building north vs true north). We do not use it yet. It costs
  three columns now and is expensive to retrofit once geometry exists — it is
  what makes an outdoor-to-indoor GPS handoff at the entrances possible later.

**Levels are data, not a type union.** `FloorId = "L1" | "L2" | "L3"` becomes a
`levels` table with a `code` and an `ordinal`. Adding a basement or a mezzanine
is a row, not a code change.

---

## 6. Entity schema

Postgres is the source of truth. One row per entity — the same granularity that
makes concurrent editing safe (§10).

Common columns on every authored entity: `id` (stable human-readable slug where
sensible, e.g. `L2-room-library`), `version` (int, optimistic locking),
`lockedBy` / `lockedAt` (soft lock), `updatedBy`, `updatedAt`, `deletedAt` (soft
delete — a mis-delete must be recoverable).

### Structure

```
building        id, name, anchorLat, anchorLng, rotationDeg
level           id, buildingId, code, ordinal, nameEn, nameZh,
                elevationM, heightM
room            id, levelId, kind, footprint, holes, heightM, walkable,
                nameEn, nameZh, verification
```

- `room.kind` is one of `room | corridor | atrium | service | outdoor | void`.
- `footprint` is a closed ring of `[x, y]` metres; `holes` is an array of rings
  (atria and voids need them — the hackathon could not express a hole).
- `walkable` marks the room as part of the walkable surface.

### Navigation

```
doorway         id, levelId, roomA, roomB, segment, widthM, stepFree
entrance        id, levelId, roomId, point, nameEn, nameZh, stepFree,
                isPrimary, hours
portal          id, kind, stepFree, nameEn, nameZh
portalEndpoint  id, portalId, levelId, point, roomId
navHint         id, levelId, polyline
```

**Doorways are a new primitive and the most important addition here.** Room
footprints are closed rings; without doorways, adjacent rooms are either mutually
impassable or freely passable through walls. A doorway is an explicit segment on
a shared boundary with a width and a step-free flag. The hackathon approximated
this with loose `entrances.json` points and paid for it in route quality.

**Entrances** are where the building is entered from outside. They are the roots
of the reachability check (§7) and the future handoff point from outdoor GPS
navigation, so they are a first-class entity rather than a flag. The hackathon
had no concept of one.

**Portals** connect levels and carry the accessibility that step-free routing
depends on: a lift portal is `stepFree: true`, an escalator or stair is not. A
portal has two or more endpoints, each on a level and inside a room.

**Nav hints** are an optional hand-authored polyline that forces routing through
a specific path — the escape hatch for cases where the derived surface produces a
technically valid but stupid route.

### Dressing

```
asset           id, filename, storagePath, checksum, sizeBytes,
                triangleCount, bbox, uploadedBy
placement       id, levelId, assetId, roomId, position, rotationDeg, scale
```

Assets are validated on upload (§9) and compressed server-side.
`placement.position` is `[x, y, z]` in model metres and `rotationDeg` is rotation
about the vertical axis only — dressing assets sit upright on a floor, and
restricting to one axis keeps the placement UI simple and the data readable.
`placement.roomId` is an anchor for organisation and visibility culling only — it
has no routing meaning.

### Semantics

```
tenant          id, levelId, roomId, nameEn, nameZh, category, unitNo,
                counters, accessibility, hours, sourceUrl,
                validFrom, validTo, verification
```

`validFrom` / `validTo` exist because tenants change, and a production map that
cannot express "this shop closed in March" goes stale silently.

### Provenance

Every room and tenant carries a `verification` object:

```
verification    status: unverified | photo | onsite | cad
                evidence: [ ...references ]
                verifiedAt, verifiedBy
```

This directly addresses the failure that produced the current inaccurate data:
the plans were outdated and nothing recorded that fact. Publishing (§7) warns on
unverified entities rather than silently shipping them.

---

## 7. Validation and the publish pipeline

**The viewer never reads the editing database.** Editing is continuous and
half-finished by nature; a public service cannot render someone's in-progress
corridor.

`Publish` snapshots the current model into an **immutable, versioned bundle**.
The viewer only ever reads a published version. This also gives rollback, which a
production service needs.

### Publish refuses to ship an invalid model

The validator runs as a gate, not a warning. Errors block; warnings do not.

**Errors** — footprint is self-intersecting, has fewer than 3 points, or has
near-zero area; a doorway references a room that does not exist or is not on its
level; a portal endpoint falls outside its room; a tenant references a missing
room; a walkable room is unreachable from any building entrance; duplicate ids.

**Warnings** — a room with no name; a tenant with `verification.status` of
`unverified`; an asset placement whose bounding box escapes its anchor room; a
level with no portals.

### Bundle format

```
published/<version>/
  manifest.json        version, createdAt, createdBy, notes, checksums
  building.json        origin, georeference, level index
  levels/<code>.json   rooms, doorways, tenants for that level
  nav.json             portals + baked navigation grids
  placements.json      asset placements
  assets/<hash>.glb    content-addressed, deduplicated
```

**The navigation grid is baked at publish time**, at 0.25 m resolution, per
level, from the walkable surface and doorways, and stored as a packed bitmask
(roughly 60 KB per level at OTH's footprint). Eight floors rasterised in the
browser on every load is wasted work on a phone; doing it once at publish is free
and makes the viewer's job trivial.

Bundles are content-addressed and immutable. `published/latest` is a pointer.

---

## 8. The editor

A hosted web app. Teammates open a URL, log in, and edit. It shares the renderer
package with the viewer, so what you author is what visitors see.

**Plan view is the primary authoring surface.** Footprint work in a 2D top-down
view is faster and far more accurate than dragging gizmos in perspective, and it
is what a non-technical teammate can actually do. A live 3D preview sits
alongside it.

Core capabilities:

- **Reference underlay** — upload a floor plan image per level, then **calibrate
  scale by drawing a line along a known dimension and typing the real distance**.
  The hackathon eyeballed its scale (`depthM = 148.47`, with a comment explaining
  the guess). Calibration is the single cheapest accuracy win available.
- **DXF/DWG import** — when OTH supplies vector CAD, import layers directly to
  room footprints with real dimensions and unit numbers. This is the difference
  between tracing 8 floors by eye and generating them.
- **Draw and edit** footprints, doorways and portals; snapping to existing
  vertices and edges; hole cutting.
- **3D placement mode** for dressing assets, with a transform gizmo.
- **Inspector** for the selected entity, including its verification status.
- **Level switcher** with the level below shown ghosted, so vertical alignment is
  visible while working.
- **Validation panel** — the same validator the publish gate runs, live, so
  problems surface while authoring rather than at publish.
- **Presence and locks** — see who else is in the model and what they hold.

---

## 9. The Blender / Rhino round trip

Designed so the modelling teammate never touches load-bearing data and never
needs git.

**Out:** select a region or a room in the editor → *Export context* → a `.glb`
containing the floor slab, surrounding walls and neighbouring rooms as **locked
reference geometry**, correctly scaled in metres, with the origin at a documented
point. They model inside that context in whatever tool they prefer.

**In:** upload one `.glb` of *just the new detail* through the editor. On upload
the server:

1. Validates: at most 5 MB, at most 150k triangles, valid glTF 2.0, finite
   bounding box.
2. Compresses with Draco/meshopt.
3. Content-addresses it by checksum and deduplicates.
4. Registers it as an `asset`, available to place.

Placement is a transform in the editor. Replacing an asset with a new version
touches nothing else in the model — which is what "the parts must be editable"
requires.

Budgets: 5 MB and 150k triangles per asset, 25 MB of dressing per level. Roughly
20 hero assets in total, per the agreed visual target.

---

## 10. Backend, auth, collaboration

**Stack:** Hono on Node (already in the repo), Postgres via Drizzle ORM, deployed
on Railway (hobby plan) with a volume for assets. No new vendors.

**Auth:** invite-only, sign in by picking your name from a public list — no
passwords, decided 2026-09-27 — over httpOnly session cookies. No third-party
OAuth dependency and no configuration burden. Every edit is attributed to a
named person — which matters the first time four people are editing one model
and something moves unexpectedly.

**Concurrency — locking, not CRDTs:**

- **Optimistic locking.** Every entity carries a `version`. Updates send the
  expected version; a mismatch returns `409` with the current state, and the
  editor shows a conflict rather than overwriting.
- **Soft locks.** `lockedBy` / `lockedAt` with a short TTL, refreshed while
  editing, released on navigate-away. Shows "Wei is editing L2 library" and
  prevents most conflicts before they happen — it does not need to be perfect,
  because optimistic locking is the actual correctness guarantee.
- **Presence** over SSE. Hono supports it directly; no WebSocket infrastructure.

**Audit log:** every mutation records entity, action, actor, timestamp, and
before/after. Combined with soft deletes, this makes the model recoverable from
human error, which is the most likely thing to go wrong with four people
authoring concurrently.

---

## 11. Repository layout

npm workspaces — already npm, no new tooling.

```
oth_navigation/
  packages/
    model/      schema, types, validation, bundle build — pure TS, no I/O
    renderer/   shared R3F rendering of a published bundle
    editor/     authoring web app (React + Vite)
    server/     Hono API, Drizzle, auth, assets, publish
    viewer/     placeholder — the visitor app, next project
  legacy/       the hackathon app, kept runnable for reference
  docs/
```

`packages/model` is pure and I/O-free deliberately: it is where the geometry
predicates, validation rules and bundle builder live, it is the package both apps
and the server depend on, and it is the part that must be most heavily tested.

The hackathon app moves to `legacy/` intact. Its floor data is wrong and its
editors are superseded, but its routing and narration code is the starting point
for the viewer project and should stay readable.

---

## 12. Reserved for the labelling tool

The photo/video labelling tool is a separate project, but it writes into this
model, so the schema reserves its landing points now:

- `room.verification.evidence` — references to keyframes that show the room.
- `tenant.verification.evidence` — the photo a tenant record was derived from.
- Adjacency captured from co-visibility ("this shop is next to that shop")
  validates against the derived doorway graph. Two independent sources agreeing
  is a far stronger accuracy position than either alone.

The intended sequence: labelling produces the connectivity graph and tenant
catalogue **without floor plans**; when CAD arrives, the structure layer is
imported or traced and the graph snaps onto it as a correctness check. Nobody is
blocked waiting on OTH.

---

## 13. Testing

- **`packages/model`** — the heart of the test suite. Geometry predicates
  (self-intersection, area, point-in-polygon, ring winding), every validation
  rule with a passing and a failing case, nav grid baking, and bundle determinism
  (same model in, byte-identical bundle out). TDD applies.
- **`packages/server`** — integration tests against **PGlite** (embedded
  Postgres, no Docker, works on Windows). Cover auth, optimistic-lock conflicts,
  asset upload validation and rejection, and the publish gate refusing an invalid
  model.
- **`packages/editor`** — light. Component tests for the calibration maths and
  coordinate conversion; the logic that matters lives in `model`.

Vitest is already in the repo and stays.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| OTH's floor plans are outdated *again*, or arrive as flat PDF | Scale calibration, photo verification and the `verification` field make staleness visible rather than silent. **Ask OTH for DWG/DXF, all 8 storeys, plus fire-safety/egress drawings and the current tenancy schedule, and confirm which revision is current.** |
| Authoring 8 floors is more labour than estimated | Structure is footprints only; DXF import is the lever. Levels are independent, so the work parallelises across the team. |
| Dressing assets too heavy for phones | Upload budgets enforced server-side, per-level cap, compression on ingest. |
| Railway hobby plan limits | Assets are content-addressed and deduplicated; bundles are static and can move to object storage without a schema change. |
| Four people, one model, human error | Soft deletes, audit log and immutable published versions make it recoverable. |

---

## 15. Open questions

None blocking. Two to raise with OTH at the next meeting:

1. Which drawing revision is current, and can we get DWG/DXF rather than PDF?
2. Who hosts the production viewer — us or OTH? Affects the viewer project, not
   this one.
