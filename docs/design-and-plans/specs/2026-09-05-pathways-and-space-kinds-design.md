# Pathways and Space Kinds — design

> **Status:** approved 2026-09-05.
> **Scope:** replace room-adjacency navigation with an explicitly drawn pathway
> network, and split "room" into the kinds of space OTH actually has.
> Supersedes the doorway-centred navigation in
> [`2026-09-04-oth-map-model-design.md`](2026-09-04-oth-map-model-design.md) §6.

---

## 1. Context

The model assumed a building of walled rooms with doors between them:
`doorway(roomA, roomB)` carves an opening in the wall the two rooms share, and
the walkable surface is the union of walkable room interiors.

Our Tampines Hub is not that building. It is a hub: shops line corridors, and
you never walk from one shop into the next. Two consequences make the doorway
model actively wrong here, not merely awkward.

**It forces geometry to be exact.** A doorway only connects two rooms if their
footprints abut; a sliver of a metre between them leaves the nav bake with a
wall and no opening. The failure is silent — the model publishes, and someone
cannot be routed.

**It depends on accuracy we do not have.** The floorplan is a rough image the
team drew or stitched from site photos. Footprints traced from it will not be
exact, so a navigation model whose correctness depends on exact footprints is
built on the one thing we cannot rely on.

A drawn pathway inverts that dependency. A line down the middle of a corridor is
correct by construction regardless of how wrong the surrounding footprints are.
Navigation stops being derived from geometric accuracy and becomes something a
human asserts directly.

### The kinds of space that actually exist

The team's own vocabulary splits three ways:

| | Examples | Walkable | A destination |
|---|---|---|---|
| **Room** | meeting rooms, dance studio, library, CC rooms, shop units | No | Yes |
| **Area** | town square, event space, stadium floor, atrium | Yes | Sometimes |
| **Detail** | stadium seating, planters, market stalls | No | No |

The model half-expresses this already — an area is a walkable room, a detail is
a dressing asset — but the editor makes no distinction, so everything drawn
becomes a generic room and walkability is a checkbox nobody knows to tick.

Note what is deliberately *not* a kind: **a shop is a room with a retail
tenant**, not a separate spatial kind. Occupancy belongs to the semantics layer,
which already has `tenant.category`.

---

## 2. Goals

- Navigation that works before the geometry is accurate.
- Drawing a corridor is one gesture, not a polygon plus a doorway per shop.
- The editor names the three kinds of space the team names.
- Existing doorway data and machinery keep working, without being in anyone's way.

## 3. Non-goals

- **Removing doorways.** They stay in the model and the nav bake; they are right
  for a genuinely walled corridor on an office floor. They leave the guided flow.
- **Routing inside a room.** You route *to* the library, not around it.
- **Rubber-sheeting a distorted floorplan.** Still out of scope, as before.
- **Automatic pathway generation** from footprints. A human draws where people
  walk; that judgement is the point.

---

## 4. The pathway

```
pathway    id, levelId, polyline (>= 2 points, metres), widthM, stepFree
           + audit columns
```

A pathway is walkable surface asserted directly: the centre line of somewhere
people walk, with a width. Default width 2.4 m — roughly a two-person corridor.

**Pathways carve unconditionally.** A doorway may only open cells inside one of
the two rooms it joins, which is what makes it depend on exact abutment. A
pathway opens every cell within half its width, wherever it is. Cross a wall,
clip the corner of a shop, run through a gap the footprints do not quite close —
all of it works, because you have asserted that people walk there.

This is the whole of why the change matters, and it is worth being explicit that
it trades a guarantee for a judgement: the model will no longer stop you drawing
a path through a solid wall. That is the correct trade when the walls themselves
are approximations.

### Baking

The nav grid gains one step, and its order matters:

1. Cells inside a **walkable area** open.
2. Cells within half a wall thickness of any area boundary close.
3. **Doorways** carve, still restricted to the rooms they join.
4. **Pathways** carve, unrestricted.

Pathways last, so nothing a wall rule does can close a route a human asserted.

---

## 5. Space kinds

`RoomKind` becomes four values, describing spatial character rather than use:

| Kind | Meaning | Walkable by default |
|---|---|---|
| `room` | Enclosed, entered from outside itself | No |
| `area` | Open space you cross freely | Yes |
| `service` | Back of house, not public | No |
| `void` | A hole — lightwell, atrium opening | No |

`corridor` disappears: a corridor is a pathway now, which is the conceptual win
of the whole change. `atrium` and `outdoor` fold into `area`.

`walkable` remains a separate field rather than being derived, so an unusual case
stays expressible — but the editor sets it from the tool, so nobody has to know
the checkbox exists.

This changes the enum, and there is no production data: the level images and
eight levels are seeded, and rooms are still at zero. Doing it now costs a
migration; doing it after the team traces eight floors costs a data migration.

---

## 6. How a destination gets reached

An area is reachable if a flood fill from the entrances reaches one of its cells.
That rule is unchanged, and now applies to areas rather than to every walkable
room.

A **room is a destination**, so "can you walk around inside it" is the wrong
question. The right one is whether you can get to its door. Since the geometry is
approximate, so is that question — which makes it a **warning, not an error**:

- **`area.unreachable`** — error. A walkable area no entrance can reach.
- **`pathway.disconnected`** — error. A pathway with no reachable cell: it leads
  nowhere and is almost certainly a mistake.
- **`room.noAccess`** — warning. No pathway passes within 3 m of the room's
  footprint, so probably nobody can get to it.

Blocking publish on `room.noAccess` would mean a rough floorplan could never be
published at all. Surfacing it means the gap is visible without being fatal.

The visitor app targets the nearest reachable cell to a room's centroid. That is
a viewer concern and not built here, but the model must support it, which it does
— the baked grid and the room footprint are enough.

---

## 7. Editor

**Tools** become `Select · Draw area · Draw room · Draw pathway · Entrance ·
Portal`. Doorway leaves the toolbar's default position; it stays reachable, since
it is still occasionally the right primitive.

**The guided flow** becomes:

```
Floorplan  →  Areas & rooms  →  Pathways  →  Entrances  →  Lifts & stairs  →  Dressing
```

"Connect them" is replaced by "Draw pathways", which is a concrete instruction
rather than an abstract one.

**On the canvas**, areas, rooms and pathways are visually distinct: areas read as
open floor, rooms as enclosed blocks, pathways as a translucent stroke of their
real width — so you can see whether a path actually reaches a shop front.

**In Layers**, Areas and Rooms are separate groups, and Pathways joins them.

---

## 8. A performance ceiling worth fixing while we are here

`bakeNavGrid` scans **every cell of the grid for every room**. On a hub-sized
floor that is roughly 500,000 cells per room, so the bake is O(rooms × cells) and
validation runs on every save. Measured today: 30 ms with no entrance, 86–126 ms
with one entrance and a single hub-sized room. At two hundred rooms it will be
unusable, and reachability re-runs it across all eight levels.

The fix is contained: scan only the cells within each room's own bounding box
rather than the whole grid. A shop is a few hundred cells, not half a million.
Pathways get the same treatment via their segment bounding boxes, which they
already use.

This is included because we are changing the bake anyway, and because a known
cliff is cheaper to remove now than to rediscover under deadline.

---

## 9. Migration

No production data exists — rooms are at zero, and the seeded levels and level
images carry no `kind`. So:

- The `RoomKind` enum changes in place; `corridor`/`atrium`/`outdoor` are not
  remapped because nothing uses them.
- `doorways` keeps its table, its bake step and its tests.
- `pathways` is a new table.

---

## 10. Testing

- **Pure and exhaustive**: pathway carving through a wall, a pathway that opens
  cells outside every room, the bake order (a pathway drawn over a wall wins),
  and each new validation rule with a passing and a failing case.
- **The bake optimisation must not change behaviour**: the same model produces
  the same grid before and after, asserted cell by cell.
- **Editor**: drawing a pathway commits a polyline rather than a ring, and the
  area and room tools set `kind` and `walkable` without the user choosing.

---

## 11. Implementation order

One plan, in this order, so each stage is independently useful:

1. `RoomKind` change and the `pathway` entity, in `@oth/model` and the server.
2. Nav bake: pathway carving, plus the bounding-box optimisation.
3. Validation: the three new rules.
4. Editor: tools, canvas rendering, checklist and layers.
