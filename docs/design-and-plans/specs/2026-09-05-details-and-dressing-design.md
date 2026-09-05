# Details and the Dressing Round Trip — design

> **Status:** draft 2026-09-05.
> **Scope:** a drawn *detail* polygon as the anchor for modelled dressing, and
> the Blender round trip that turns one into a real mesh.
> Extends [`2026-09-05-pathways-and-space-kinds-design.md`](2026-09-05-pathways-and-space-kinds-design.md),
> which named details as a kind of space but did not build them.

---

## 1. Context

The space-kinds work split the building into rooms you arrive at and areas you
cross, and left a third category described but unbuilt:

> **Detail** — stadium seating, planters, market stalls. Not walkable, not a
> destination.

That table called a detail "a dressing asset", which was wrong in a way worth
correcting. A vending machine bank *is* a dressing asset — a mesh someone
models. But before the mesh exists, somebody has to say **where it goes and how
big it is**, and today there is nowhere to record that. The dressing panel can
upload a `.glb` and place it at a point, and nothing in the editor says what
that mesh is supposed to fit inside.

So the modelling teammate has an unanswerable question: *how big should I make
this?* They can export the level as reference geometry, but the level is a
floor plate — it tells them where the walls are, not that the charging point is
2.4 m of wall and 0.6 m deep.

A detail polygon answers it. You draw the extent of the thing on the plan, the
same way you draw a room, and that polygon becomes:

- the **brief** — exported as a block of exactly the right dimensions,
- the **anchor** — what the finished mesh is placed on,
- the **check** — the existing `placement.outsideAnchorRoom` warning fires when
  the mesh does not fit what was drawn.

This is what the dressing step is for.

---

## 2. Goals

- Draw the extent of a piece of dressing with the polygon tool already there.
- Export that extent as a dimensioned block a modeller can build inside.
- Import the finished mesh and have it land where it was modelled, exactly.
- The same mesh is reusable somewhere else without re-modelling it.

## 3. Non-goals

- **Details do not block navigation.** A bank of vending machines really is an
  obstacle, and one day the nav grid should know. Not yet: on a floorplan this
  approximate, an over-drawn planter that closes a corridor is a worse failure
  than a route that clips a bench. Revisit when the traced plans are real.
- **No modelling in the browser.** The mesh is authored in Blender or Rhino.
- **No detail library.** Reusing a mesh across levels works (see §5), but
  browsing a catalogue of standard furniture is a later thing.
- **No automatic fitting.** The mesh is not scaled to the polygon; if it does
  not fit, the warning says so and a human decides.

---

## 4. A detail is a fifth room kind

`RoomKind` gains `detail`:

| Kind | Meaning | Walkable |
|---|---|---|
| `room` | Enclosed, entered from outside itself | No |
| `area` | Open space you cross freely | Yes |
| `detail` | **Furniture, not architecture: a bounded thing standing on a floor** | No |
| `service` | Back of house, not public | No |
| `void` | A hole — lightwell, atrium opening | No |

Not a new entity, and the reason is not brevity. A detail is *geometrically the
same object as a room* — a footprint, holes, a height, a name — and every piece
of machinery a room already has is machinery a detail wants: the polygon tool,
vertex dragging, the layers list, selection, the context exporter, the audit
log and optimistic locking. A parallel `Detail` entity would be that same code a
second time, and every rule written afterwards would have to remember both.

What differs is meaning, and meaning is what `kind` is for. So details are
excluded, by kind, from the rules that assume a space is somewhere you go:

- not a destination, so no `room.noAccess` — nobody routes *to* a planter,
- not walkable, so it never contributes to the nav grid,
- no `room.name.missing` — "seating block 3" needs no bilingual name.

`heightM` stops being a formality. For a room it is storey height and rarely
matters; for a detail it is **the brief** — 1.9 m for a vending machine, 0.75 m
for a table, 3 m for raked seating — so it is editable in the inspector rather
than a constant chosen at draw time.

---

## 5. The round trip

The existing export writes rooms in **building coordinates**, which is right
for a whole level: the modeller sees the floor plate where it really is. For a
single detail it is wrong, and the reason is worth stating because it is the one
real design decision here.

A mesh authored at, say, x = 143 m is a mesh that can only ever be used at
x = 143 m. Rotating it turns it around the building origin, a hundred metres
away, rather than around itself. Placing a second identical water cooler means
modelling a second one.

So **a detail export is translated so the detail's own centroid sits at the
origin**, and the whole scene moves with it — the detail block and the
surrounding reference geometry together, by the same offset, so the context
still surrounds the thing being modelled.

```
 building coordinates            detail export
 ┌───────────────────┐           ┌───────────────┐
 │        wall       │           │     wall      │
 │   ┌───┐           │    ──►    │  ┌───┐        │
 │   │ ▓ │ detail    │           │  │ ▓ │        │   ▓ centroid at (0, 0, 0)
 │   └───┘ at (143,88)           │  └───┘        │
 └───────────────────┘           └───────────────┘
```

The offset is recorded in the file's `extras`, so the file explains itself
months later, and it is exactly what the placement carries back:

```
placement.position = detail centroid   →  mesh returns to where it was modelled
placement.roomId   = detail id         →  the fit check knows what to check against
```

The mesh lands where it was drawn, and because it is centred on itself it can
also be dropped anywhere else, rotated about its own middle.

### What the export contains

- The detail itself, extruded to `heightM` — the dimensioned block.
- Every room on the level within **10 m** of the detail's bounding box, as
  locked reference — the wall it stands against, the shopfront it sits outside.
- Both in the same translated frame, and the same `CONTEXT_ORIGIN_NOTE` the
  level export already carries.

### The steps in the editor

```
Draw detail  →  select it  →  Export detail for Blender
                                      ↓
                          (Blender / Rhino: model inside the block)
                                      ↓
             Upload .glb  →  Place on detail  →  fit warning if it overhangs
```

Every step but the middle two is a button in the Dressing section, and the
Dressing section is where the detail tool lives — details are dressing, so they
belong to that step rather than to the structural sequence.

---

## 6. Before it is dressed

A detail with no placement on it still has to be visible, or a teammate cannot
tell an undrawn detail from an unmodelled one.

- **In plan:** a distinct fill from rooms and areas, drawn above them, because a
  detail sits *on* a floor rather than being one.
- **In 3D:** a low massing block at `heightM` — deliberately plain, so it reads
  as a placeholder. Once a placement anchors to the detail, the block is not
  drawn: the mesh has replaced it, and a box inside the vending machines would
  be an obvious bug.

---

## 7. Validation

Reused as-is: **`placement.outsideAnchorRoom`** already warns when a placement's
asset bounding box extends outside its anchor room's footprint. Anchor a mesh to
a detail and the check becomes "does the model fit the brief" for free — which
is why the placement carries `roomId`.

One new warning: **`detail.undressed`** — a detail with no placement on it. A
warning, never an error, because drawing the extents of a whole floor before any
modelling starts is a legitimate way to work, and blocking publish on it would
punish exactly that.

---

## 8. Editor

- **Toolbar** gains `Draw detail`, after the space tools.
- **Dressing** gains the detail tool, the per-detail export, and Place-on-detail
  beside the existing asset upload.
- **Layers** gains a Details group, above Dressing — a detail is drawn geometry,
  the placement on it is not.
- **Inspector** gains `heightM` for the selected space, which details need and
  rooms have always quietly wanted.

---

## 9. Migration

`RoomKind` gains a value; nothing is removed, so existing rows stay valid and
the enum change needs no data migration. Details are rooms in the `rooms` table.

## 10. Testing

- **Geometry, pure and exhaustive**: the export's translation puts the centroid
  at the origin; the context comes with it and stays in the right relative
  position; a detail exported and placed back at its centroid occupies its
  original footprint, asserted as a coordinate round trip.
- **Kind exclusions**: a detail raises no `room.noAccess`, no name warning, and
  contributes no walkable cells to the nav grid.
- **The fit check**: a mesh larger than its detail warns; one that fits does not.
- **Editor**: the detail tool commits a non-walkable `detail`; an undressed
  detail renders in plan; a dressed one does not draw its placeholder block.

## 11. Implementation order

1. The `detail` kind, its rule exclusions and the inspector's height field.
2. The centred detail export in `@oth/renderer`, pure and tested.
3. Editor: tool, palette, layers group, and the Dressing round-trip buttons.
4. `detail.undressed`, and the 3D placeholder that disappears once dressed.
