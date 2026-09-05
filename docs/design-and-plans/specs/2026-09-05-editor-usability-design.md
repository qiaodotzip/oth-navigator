# Editor Usability — design

> **Status:** approved 2026-09-05.
> **Scope:** make the map editor usable by non-technical teammates — floorplan
> underlay and scale calibration, a guided per-level flow, and direct
> manipulation of geometry and placements.

---

## 1. Context

The editor from
[`2026-09-04-oth-map-model-design.md`](2026-09-04-oth-map-model-design.md) is
complete and correct, and unusable. Opening it shows a blank canvas, a toolbar of
five nouns in no particular order, and nine identical warnings. A teammate's
first reaction was, accurately, "what's happening and where do I start?"

Four separate problems are tangled in that first impression:

1. **The canvas never frames its content.** `fitViewport` is written and tested
   and never called, so the initial viewport is `{originX: 0, originY: 0}` and
   geometry at y = 0…30 m renders at screen y = 0…−120 — entirely above the
   visible area. The map looks empty even when rooms exist.
2. **There is nothing to trace over.** Footprints must come from somewhere. With
   no floorplan underlay, the only option is drawing freehand into a void.
3. **The toolbar names things instead of sequencing them.** `Select · Draw room ·
   Doorway · Entrance · Portal` says what exists, never what to do first, and the
   order matters — a doorway needs two rooms, a portal needs somewhere to land.
4. **Validation output is noise, not signal.** Nine `level.portals.none`
   warnings, one per storey, crowd out anything actionable.

### What is actually going to be traced

OTH is the *client* for its own floorplans, so vector CAD is unlikely. The
underlay will be some mix of: a rough plan the team draws themselves, an image
stitched from the site walkthrough footage, and the 2020 hub guide. The repo
already holds `images/1st-Storey_Updated_300DPI-3000x2121.jpg` and its
second-storey equivalent — outdated in content but properly drawn, and therefore
the best *scale* reference currently available.

---

## 2. Goals

- A teammate who has never seen the editor can log in and know what to do next,
  without being told.
- A floorplan image can be uploaded, scaled against a known real dimension, and
  positioned — and every teammate sees the same one.
- Rooms can be drawn, reshaped, and corrected without leaving the canvas.
- Validation reads as progress rather than a wall of warnings.

## 3. Non-goals

- **PDF rendering in the browser.** Deferred; PNG/JPEG only for now. The team
  converts the hub guide once.
- **Correcting non-uniform scale.** An image stitched from photos will not have a
  single consistent scale. Fixing that properly means rubber-sheeting against
  control points, which is real work and not proposed here. §9 records the
  mitigation.
- **Underlay rotation.** One scale and one offset per level, no rotation.
- **Presence and lock indicators.** Parked deliberately.
- **A linear wizard.** Guidance must not stop someone jumping back to fix a wall
  three steps later.

---

## 4. The checklist is the sidebar

The central move: **the validation report becomes the data source for a per-level
checklist** rather than a flat list.

```
L1   ● Add floorplan          hub-guide-L1.jpg
     ● Set the scale          0.071 m/px
     ● Trace rooms            3 rooms
     ○ Connect them           2 rooms unreachable   →
     ○ Mark entrances         none yet              →
     ○ Lifts and stairs       none serving L1       →
```

Six steps, each deriving its status from the model and the report:

| Step | Done when | Owns these issue codes |
|---|---|---|
| Add floorplan | the level has an image | — |
| Set the scale | that image has `metresPerPixel` | — |
| Trace rooms | the level has at least one room | `room.footprint.*`, `room.name.missing` |
| Connect them | no unreachable rooms on this level | `room.unreachable`, `doorway.*` |
| Mark entrances | the building has at least one entrance | `building.entrances.none`, `entrance.*` |
| Lifts and stairs | a portal endpoint serves this level | `level.portals.none`, `portal.*` |

So `Level "L1" has no lift, stair or escalator endpoint` stops being one of nine
identical warnings and becomes the status of step 6 on L1. Each step shows a
count, its own issues inline, and a button that activates the relevant tool.

**The checklist guides; it does not gate.** Every tool stays reachable from the
toolbar at all times. Steps are a suggested order, not a lock.

`levelChecklist(model, levelId, image, report)` is a pure function with its own
tests. The React panel renders what it returns and holds no logic of its own.

---

## 5. Floorplan underlay

### Storage

One image per level, server-side. Local-only storage would mean each teammate
traces a different picture and the geometry silently disagrees — the exact class
of error this project exists to eliminate.

```
levelImage   id, levelId, filename, storagePath, checksum,
             widthPx, heightPx, sizeBytes,
             metresPerPixel (null until calibrated),
             offsetX, offsetY, opacity,
             uploadedBy + audit columns
```

Bytes go in the existing content-addressed store, which already handles
deduplication and serving. Uploading a new image for a level soft-deletes the
previous one in the same transaction, so at most one is live per level.

### Validation on upload

Mirrors `.glb` ingest: an unreadable or oversized file is a 422, never a 500.
Upload confirms the bytes really are a PNG or JPEG and reads the dimensions by
parsing the header directly — the PNG `IHDR` chunk, or the JPEG `SOF` marker.
That is roughly forty lines, needs no new dependency, and is a pure function with
its own tests.

Budget: 20 MB, which comfortably fits a 300 DPI storey plan.

### Never published

Level images are authoring aids and do not enter the published bundle. The
visitor app renders the model, not the drawing it was traced from.

---

## 6. Calibration and alignment

Two steps, both direct manipulation on the canvas.

**Scale** — click two points on something whose real length is known (a corridor
width, a grid spacing, the scale bar), then type the metres.
`calibrationFromMeasurement` already exists and is tested; this is the interface
it never had. The hackathon guessed its scale in a comment and every polygon
inherited the error.

**Position** — drag the underlay so it sits correctly against the building
origin, with the level below ghosted underneath for reference. This matters more
than it looks: levels only stack meaningfully if their images agree on where the
origin is, and eyeballing that is precisely what broke before.

---

## 7. Direct manipulation

### Drawing

Keep the interaction the team already liked — click points, close the shape — and
fix everything around it:

- a rubber-band line from the last point to the cursor
- visible dots on placed vertices
- the snap target highlighted, so you can see what you are about to snap to
- **click the first vertex to close**, as well as double-click
- `Backspace` removes the last point, `Esc` cancels
- a live hint: what you are drawing, how many points, how to finish

### Vertex handles

Selecting a room shows a draggable dot on every vertex. Drag to move, snapped;
double-click an edge to insert a vertex; select one and press `Delete` to remove
it, refusing below three. Saves once on drag end through the existing
optimistic-locked path, not on every mouse move.

### Placements

Selecting a placement gives numeric X/Y/Z, rotation and scale fields, plus
drag-to-move in plan view.

---

## 8. Viewport framing

`fitViewport` runs when a model loads and when the level changes, so the canvas
always frames what exists. When a level has an underlay, frame the underlay;
otherwise frame the rooms; if there is neither, centre the origin.

---

## 9. Risks and limitations

| Risk | Mitigation |
|---|---|
| A stitched image has non-uniform scale, so a single `metresPerPixel` is locally wrong | Calibrate against the region that matters most; `verification` records that the geometry is approximate. Rubber-sheeting is available later without a schema change, since calibration already lives on the image row. |
| The rough plan is inaccurate, and inaccurate geometry gets published | The publish gate already blocks structurally invalid models, and `verification.status` distinguishes `unverified` from `onsite`. Being approximate is visible rather than silent. |
| Someone recalibrates after tracing, invalidating existing footprints | Calibration changes do not move geometry — footprints are stored in metres, not pixels. Re-calibrating moves the *image*, not the rooms, and the mismatch is visible immediately. |
| Large images make the canvas sluggish | 20 MB cap, and the underlay is a single `<image>` element the browser scales; no per-frame work. |

---

## 10. Testing

- **Pure functions carry the weight**: `levelChecklist` for every step and status
  combination, `readImageSize` against real PNG and JPEG headers plus malformed
  input, calibration and viewport maths (already covered).
- **Server**: upload validation, the one-image-per-level replacement, and that
  level images never reach a published bundle.
- **Components**: that the checklist reflects the model, that drawing closes on a
  first-vertex click, that a vertex drag issues exactly one save, and that the
  canvas frames content on load.

---

## 11. Implementation order

Two plans, so the thing that unblocks tracing lands first rather than last.

**Plan A — you cannot trace without these.** Viewport framing fix, the
`levelImage` entity and its upload path, image header parsing, underlay
rendering, calibration and positioning.

**Plan B — usable authoring.** The checklist sidebar, the improved drawing
interaction, vertex handles, placement transforms.
