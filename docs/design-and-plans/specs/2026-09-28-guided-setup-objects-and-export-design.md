# Guided floor setup with Claude, survey objects, and the 3D export — design

> **Status:** decided with the user on 2026-09-28 (evening, after deploy 3);
> the user asked to go straight on to plans and building.
> **Scope:** Plan 6. The Claude Code button (piece 1) shipped in deploy 4
> (`3085d46`, `8775e86`). This spec covers the rest, built as five plans (§10).
> Builds on [`2026-09-28-map-fidelity-and-agent-access-design.md`](2026-09-28-map-fidelity-and-agent-access-design.md);
> everything there stands unless changed here.

---

## 1. Context

Plan 5 gave the team all the parts: survey tagging, Claude Code on the map,
room drafts from the architect's PDF, and a readable 3D view. Three gaps
remain.

- **The parts don't make a flow.** Getting a floor onto the map means knowing
  which tab to visit in which order, and which parts Claude can do. The user
  describes the flow they want as: *Claude labels the survey → the user
  optionally reviews → the user gives the floorplan → Claude draws out Build →
  the user edits by hand.* Giving the floorplan isn't a step anywhere today.
- **Claude can't use the PDF drafts.** Drafts are read in the browser and
  stored on the server, but Claude Code has no tool to list or decide them, so
  it can't turn them into rooms.
- **Objects aren't recognised.** The user tagged "wastebin" (5 sightings) and
  "water cooler" (1). They are stored as Places in *facility* with no floor,
  waiting to be bound to a room like a shop. Claude proposed 8 more of the
  same kind (recycling bins, vending machines, fire cabinets). The app's
  "details" are something else: 17 outlines traced on L1 and 1 on L2, exported
  to Blender as blocks. One model has been uploaded; none is placed.
- **There's no whole-floor 3D export.** *Export context for Blender* writes
  room slabs and the old walls only, without the Plan 5D walls, doors, stops or
  placed models.

## 2. Decisions

Settled with the user on 2026-09-28:

| Question | Decision |
|---|---|
| Shape of the flow | A **step-by-step wizard** per floor, one step at a time with Back and Next. It hides the tabs while you're in it. |
| How the wizard hands work to Claude | **Slash commands in the teammate's own Claude Code** (MCP prompts, e.g. `/mcp__oth__map_rooms L1`). The wizard shows the command and watches progress on the server. Nothing runs Claude inside the app. |
| Claude's changes | **Straight onto the draft map**, marked as Claude's, each with Undo. A check step lists everything Claude did. Nothing is published until someone presses Publish. |
| What Claude does in Build | Decides the PDF drafts (with names and kinds), turns lifts, escalators and stairs into stops, binds survey places, places objects, and draws a **first pass of pathways and entrances**. |
| Objects | **A label is a kind; the map has each one.** "wastebin" is one kind with one 3D model, made once and reused; every actual bin is its own marker. Claude places them from the frames and merges sightings it judges to be the same bin. |
| 3D export | **One button for both uses**: the modeller's reference and the hand-over copy. Everything the preview shows, as named parts. |
| Claude's drafts review | Claude reviews drafts that someone found with **Find rooms** in the browser. The server still never parses a PDF (Plan 5 §5.1). |

## 3. Non-goals

- **Running Claude inside the app** (a *Run* button on the server, billed per
  use through the API). The slash commands use each teammate's own
  subscription.
- **Claude running Find rooms itself.** It would mean parsing and rendering
  PDFs on the server.
- **Live updates of the whole map from other people's edits.** The wizard
  reloads the floor when a Claude step's counts change (§4.3); the rest of the
  app stays as it is.
- **Object instances affecting routing.** Objects are decoration, like
  placements today.
- **Converting the 17 traced "detail" outlines into objects.** They stay as
  they are; this can come later.

---

## 4. The setup wizard

### 4.1 Steps

For one floor, in order:

| # | Step | Who | Done when |
|---|---|---|---|
| 1 | **Add footage** | you | at least one capture (video or photo set) is set to this floor |
| 2 | **Label the survey** | Claude: `/mcp__oth__label_survey L1` | Claude calls `finish_step`; every frame of the floor's captures is tagged or binned |
| 3 | **Review Claude's labels** | you, optional | no proposal sighted in this floor's frames is left, or you press **Skip** |
| 4 | **Floorplan** | you | PDF in, page picked, scale set, and **Find rooms** has run |
| 5 | **Rooms from the PDF** | Claude: `/mcp__oth__map_rooms L1` | Claude calls `finish_step`; no draft is left waiting |
| 6 | **Places and objects** | Claude: `/mcp__oth__place_things L1` | Claude calls `finish_step` |
| 7 | **Pathways and entrances** | Claude: `/mcp__oth__draw_paths L1` | Claude calls `finish_step`; `check_floor` shows no unreachable room that has a door |
| 8 | **Check Claude's work** | you | you press **Looks right** (§8) |
| 9 | **Finish** | you | the floor is handed over to normal editing; the 3D export is offered |

A "you" step is done by what's on the map, and it ticks itself. A Claude step
is done when Claude says so with `finish_step`. You can also press **Mark
done** on any step, which records your name.

### 4.2 Where it lives

- **Entry:** each floor's card on the Floors home gets **Set up L1**, or
  **Continue: step 5 of 9** once started, or **Set up again** once finished.
  The route is `/floors/L1/setup` (optionally `/floors/L1/setup/5`).
- **Layout:**
  - The header's tabs are replaced by a step bar with the steps' numbers and
    names, the current one highlighted. A done step shows a tick, and every
    step can be clicked.
  - The body is that step's real tool:
    - **Add footage** → the Survey's Add footage dialog and the floor's capture list.
    - **Review** → the Review queue, filtered to this floor.
    - **Floorplan** → the Build Floorplan tools and canvas, then **Find rooms**.
    - **Check** → §8.
  - A bottom bar has **Back**, **Next** and **Leave setup**. Next is always
    allowed: the wizard advises, it doesn't block, and it warns in one line
    when the step isn't done.
- **A Claude step's screen:**
  - The command, with **Copy**. If the person has no live token, a line leads
    to the Claude Code button's panel.
  - Live counts for the step (§4.3).
  - The last 5 changes Claude made on this floor, each named in plain words.
  - A **Do it myself** link to the same step's normal tool (Build step,
    Places tab or Review).
- **Leaving:** progress is stored per floor on the server (§9). Anyone on the
  team can continue any floor's setup.

### 4.3 Progress and counts

`GET /api/levels/:id/setup` returns each step's stored state, plus live
counts computed from the model:

| Step | Counts |
|---|---|
| 2 | frames on this floor's captures: tagged, binned, left |
| 3 | proposals sighted in this floor's frames: left |
| 5 | drafts: waiting, accepted, rejected or set aside; stops made |
| 6 | places bound, places left unbound; objects placed, by kind |
| 7 | pathways, entrances; rooms with a door but no route |

While a Claude step is on screen, the wizard polls every 5 s. When a count
changes it reloads the floor's model, so the map on screen shows Claude's
work.

---

## 5. Objects

### 5.1 Tagging in the survey

- The tag bar's **Place · Walkway** choice becomes **Place · Walkway · Object**.
  Tagging a frame as an Object with the name "wastebin" makes or reuses the
  **object kind** "wastebin", and records a sighting on the frame (a box if you
  drew one).
- Under the hood, an object kind *is* a place with `objectKindId` set, the way
  a walkway is a place with `pathwayKindId` set. So sightings, proposals,
  Review, the Places list and the MCP survey tools all work unchanged.
- **Existing labels:** in Places, any place can be turned into an object with
  **This is an object**, which asks for the size. That's for "wastebin",
  "water cooler" and Claude's 8. In step 2, Claude's instructions tell it to
  propose the change for places that are clearly objects.

### 5.2 The kind

`ObjectKind`: id, name (en, zh), size in metres `{ w, d, h }`, an optional
`assetId` (its 3D model), and notes. Claude estimates the size from the frames
when it makes a kind, and anyone can edit it.

The Places tab gets an **Objects** section that lists each kind with:
- its size;
- whether it has a model yet ("Box" or "Model");
- how many are on the map, per floor;
- its frames;
- **Export for modelling** and **Upload model**.

### 5.3 On the map

- Each actual object is a **placement**. Placements are extended: `assetId`
  becomes optional, and they gain `objectKindId` and `sightingIds`.
- A placement needs an asset or a kind.
- An object's model is its kind's asset, unless the placement names its own.
- **Drawing:**
  - **Plan view:** a small square marker at the object's position, turned to
    its rotation. Click it to select it, drag it to move it, and it opens the
    Placement inspector.
  - **3D:** the kind's model, or while it has none a box of the kind's size
    in a neutral colour, with the kind's name on hover.
  - Rotation and scale work as they do for placements today.
- Objects never affect routing (Plan 5 placement rule).

### 5.4 How Claude places them (step 6)

For each sighting of an object kind on this floor:

1. **Find where the frame was taken.**
   - Take the places sighted in the same frame and in the 3 frames before and
     after, whose places are bound to rooms on this floor.
   - The frame's rough position is between those rooms' fronts, at the nearest
     point on a walkable area.
   - If there are none, use the capture's order: halfway between the nearest
     earlier and later frames that did get a position.
2. **Place it:** put the object at the edge of the walkable area nearest that
   position, turned to face into the walkway.
3. **Merge:** two sightings of the same kind whose positions are within 3 m,
   and whose frames are within 10 frames of each other in one capture, become
   one object that keeps both sighting ids.
4. **Record** each object with its `sightingIds`, so the check step can show
   its photo.

The server does steps 1–3 as the tool `suggest_object_spots(floor)`, which
returns proposed placements with a confidence (high: two or more anchors; low:
a capture-order guess). Claude reviews them against `view_frame` and the plan,
drops or moves the doubtful ones, and creates the placements. Low-confidence
ones are flagged in the check step.

### 5.5 The Blender round trip, per kind

1. **Export for modelling** downloads `oth-object-<kind>.glb`:
   - a box of the kind's size;
   - origin at its base centre, Y up, metres;
   - the surroundings (within 5 m) of one of its objects on the map, as locked
     reference.

   This reuses `buildDetailGlb`, with a box in place of a traced outline.
2. The modeller builds inside the box and uploads the model in the kind's row.
   The upload goes through the existing asset pipeline and its limits (5 MB,
   150k triangles).
3. The kind's `assetId` is set, so every object of that kind shows the model,
   in place.

---

## 6. The 3D export

- **Button:** **Download 3D model**, in Build's top bar next to **3D**, and in
  the wizard's Finish step. It asks **This floor** or **All floors**; all floors
  are stacked at their elevations.
- **File:** `oth-<floor>.glb` or `oth-all-floors.glb`. Its node tree:

  ```
  <floor code>
    Floors      one mesh per room, named after it, coloured by category (theme tints)
    Walls       full-height walls with the doors cut (Plan 5D levelStructure)
    Voids       balustrades
    Stops       lift shafts, escalator and stair flights (Plan 5D portals)
    Objects     one node per object: its kind's model, or its sized box
    Pathways    thin strips, one per pathway
  ```

- **Built from the preview's own geometry:** the same functions the renderer
  uses (`levelStructure`, the portal and marker builders), put into a
  three.js scene and written with `GLTFExporter`. So the file matches what the
  preview shows. Walls are always full height in the file.
- **Units, origin and axes** as today's context export. The note is repeated
  in the file's generator field.
- **Replaces** *Export context for Blender*. The per-kind *Export for
  modelling* (§5.5) and the traced-detail export stay.
- Text labels aren't exported; names are on the nodes.

---

## 7. Claude's tools and slash commands

### 7.1 Slash commands (MCP prompts)

The server registers four prompts. Claude Code shows each as
`/mcp__oth__<name>`, and each takes the floor code as its argument:

| Prompt | What its instructions say |
|---|---|
| `label_survey` | Work through the floor's untagged frames with `list_frames` / `view_frame` / `tag_frame`, box what's ambiguous, tag objects as objects, propose "This is an object" for places that are clearly objects; `finish_step` when none is left. |
| `map_rooms` | Read the drafts with `list_drafts`, look at them over the plan with `view_plan`, decide them in batches with `decide_drafts` (fix names and kinds; reject junk; set aside what needs a person), convert lifts, escalators and stairs with `make_stop`; `finish_step`. |
| `place_things` | Bind places to rooms with `bind_place`, using the survey's names against the rooms' names and the plan; get `suggest_object_spots`, check them against frames, create placements; `finish_step`. |
| `draw_paths` | Get `suggest_paths`, check it over the plan, create the pathways (naming the ones people say out loud), mark entrances from survey places like "Gate 4"; run `check_floor` until no room with a door is unreachable; `finish_step`. |

Each prompt names the floor, lists its tools, gives a stop rule, and ends:
"Report what you did in a few lines, then call `finish_step`." The prompt
text lives in `packages/server/src/mcp/prompts/` and is tested against the
real tool list, so a renamed tool breaks a test, not the prompt.

### 7.2 New tools

| Tool | Does |
|---|---|
| `list_drafts(floor)` | The floor's drafts: id, name, kind, area, label point, and whether it overlaps an existing room. Drafts waiting come first; decided ones are summarised. |
| `decide_drafts(floor, items[])` | For each item: `accept` (optional new name and kind), `reject`, or `set_aside`. Up to 100 per call. It calls the same `acceptDrafts` service as the Accept button, so Undo works the same way. |
| `make_stop(room, kind)` | Turns a room into a lift, escalator or stairs stop, with the same rules and results as the MakeStop button. `portalFromRoom` moves from the editor to `@oth/model` so both call it. |
| `suggest_object_spots(floor)` | §5.4 steps 1–3. Read-only. |
| `suggest_paths(floor)` | §7.3. Read-only. |
| `step_status(floor)` / `finish_step(floor, step, note)` | Read the wizard's state; mark a Claude step finished with a one-line note shown in the wizard. |

Object kinds and placements are made with the existing `create`, `update` and
`delete` tools. They are new entity types in the same guarded path.

### 7.3 The pathway first pass (`suggest_paths`)

On one floor:

1. **Walkable surface:** the union of walkable rooms (areas and opened stop
   spaces).
2. **Rasterise** it at 0.25 m, take the distance transform, and thin it to a
   one-pixel skeleton.
3. **Prune** spurs shorter than 2 m. Vectorise it to polylines, and simplify
   them (Douglas–Peucker, 0.3 m).
4. **Connect:**
   - every doorway's midpoint, every stop's footprint centre, and every
     entrance to the nearest skeleton point;
   - with a straight segment that stays inside the walkable surface;
   - if none does, list it as *unconnected*.
5. **Width:** twice the median distance-to-edge along the line, clamped to
   1.2–6 m.
6. **Returns** the proposed polylines with widths, the connection segments,
   and the unconnected list.

Runtime target: under 2 s for L1 on Railway.

### 7.4 Safety

The same as Plan 5C:
- Claude acts as the token's owner.
- Every change goes through the guarded entity path with version checks and
  the audit log's `via`.
- The existing per-token limits cover the new tools.
- Publishing still needs **May publish**.

The new tools read and write nothing outside the floor they are given.

---

## 8. Checking Claude's work (step 8)

- **Source:** the audit log. The step lists every change on this floor whose
  `via` is a Claude token, made since the wizard's step 2 began.
- **Grouped:**
  - rooms made from drafts;
  - drafts rejected or set aside;
  - names or kinds changed;
  - stops made;
  - places bound;
  - objects placed (low confidence first);
  - pathways;
  - entrances.
- **Each row:**
  - one plain line ("Made *Starbucks* from a draft", "Placed *wastebin* by
    *Gate 4*, from 2 frames");
  - **Show**, which selects it on the map beside the list;
  - **Undo**, which reverses that change, or restores a delete.
- **Objects** show their frames' thumbnails.
- **Undo** refuses, with a reason, when a later change depends on the entity;
  for example, a room that has since had a place bound to it.
- **Looks right** finishes the step. Anything still in the list stays on the
  map.

---

## 9. Data and migration

One migration, `0014`:

- `object_kinds`: id, name_en, name_zh, size (jsonb `{w,d,h}`), asset_id
  (nullable), notes, and the audit columns.
- `places.object_kind_id` (nullable).
- `placements`:
  - `asset_id` becomes nullable;
  - add `object_kind_id` (nullable) and `sighting_ids` (jsonb, default `[]`);
  - add a check that `asset_id` or `object_kind_id` is set.
- `floor_setup`: level_id, step (int), status (`open` | `done` | `skipped`),
  note, finished_by, finished_via (token id, nullable), finished_at; primary
  key (level_id, step).

All the changes are additive or relax a constraint, so no row is rewritten on
Railway's Postgres. The model package gets `ObjectKindSchema`,
`Place.objectKindId`, and the new placement fields (append-only). The bundle,
the publish gate and the editor loader all learn the new entity type.

---

## 10. Build order

Five plans, each shipping to Railway when done:

| Plan | Contents | Depends on |
|---|---|---|
| **6A Objects** | object kinds, the Object tag, "This is an object", placements with kinds, the Places Objects section, the plan markers and 3D boxes, the per-kind Blender round trip, migration 0014 (all of it) | — |
| **6B 3D export** | Download 3D model (this floor, all floors), replacing the context export | 6A's placement changes (can start in parallel, joins at objects) |
| **6C Claude's tools** | the drafts, make_stop, object-spot, step tools, the four prompts, the `portalFromRoom` move | 6A |
| **6D Pathway first pass** | `suggest_paths` and its tests on L1 and L2 | — (parallel with 6C) |
| **6E Wizard** | the setup route, the step bar, the steps' screens, progress and counts, the check step | 6C, 6D |

6A and 6D start first, in parallel; 6B starts alongside 6A.

## 11. Testing and the rehearsal

- **Unit and component tests** as in Plan 5. The prompts are tested against
  the registered tool names. The skeleton pass is tested on synthetic shapes
  (a corridor, an L, a concourse with a hole) and on L1's real areas.
- **Screenshots** of every wizard step, the Objects section and the plan
  markers, on a sandbox copy of the data (never the :3000 dev database).
- **Rehearsal before 6E ships:**
  - on a sandbox server with a copy of the live data, a real Claude Code
    session connects with a token and runs all four commands on **L2**, then
    on **L1**;
  - the check step is used to undo a sample of changes;
  - what Claude got wrong feeds back into the prompts before deploy.

## 12. Risks

- **Object positions are guesses.** A frame has no location, only what's in
  it. This is why §5.4 flags low confidence, and the check step shows the
  photo beside the marker.
- **The skeleton pass on odd shapes.** Concourses with many holes give busy
  networks. Pruning and Claude's review are the mitigation; the fallback is
  drawing by hand, as today.
- **Long Claude runs.** L1 has 215 drafts and 417 frames. The prompts work in
  batches and can be re-run; each step's tools skip what's already done, so a
  second run carries on.
