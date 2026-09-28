# Map fidelity, PDF import, Claude Code access, and the survey in the map — design

> **Status:** decided with the user after the team demo on 2026-09-28; written
> spec awaiting review.
> **Scope:** four features, built as Plan 5 in four independent parts after
> tonight's Railway deploy. Builds on
> [`2026-09-27-workspace-overhaul-design.md`](2026-09-27-workspace-overhaul-design.md);
> the Survey, Review and Build workspaces, the saver and the publish gate are
> unchanged except as listed here.

---

## 1. Context

The team saw the overhauled app for the first time today. Four things stood
between them and using it:

- **Nobody could tell whether the survey had reached the map.** L1 has 30
  confirmed places, 165 proposed and 417 frames, but the plan shows rooms
  with no names on them. The user's question was *"how do I know this
  building is the Starbucks?"*. Nothing on screen answers it.
- **Seven floors have no usable plan.** L1's rooms came from the architect's
  PDF through `scripts/extract-storey-plan.py`, run by hand, and
  `plan:l1` imported them (`packages/server/src/cli/planL1.ts`). That gave 193
  spaces whose shapes are the building's own. No other floor has had it done,
  and nobody else on the team can run it.
- **Teammates want their own Claude Code on the map.** They want it to label,
  review and trace, the way the labelling agent already proposes places.
- **The 3D view is wrong and hard to read.** Every room is a closed box with no
  doors. Where two rooms meet there are two walls. Escalators come out as
  walled rooms, voids and stairs are missing, and no room has a name.

## 2. Decisions already made

Settled with the user on 2026-09-28:

| Question | Decision |
|---|---|
| PDF upload | Uploading a floor's PDF makes it the crisp floorplan. The scale comes from the drawing's own dimensions, never from its printed ratio (L1's is wrong by 4.25×). |
| Rooms from the PDF | Traced from the drawing's lines and labels as **drafts**. A person reviews the drafts before anything is added. This productises `extract-storey-plan.py`. |
| Claude Code | Teammates' own Claude Code connects with **full powers**: it can read, survey, review, draw and edit, and publish. It works under the teammate's name, with the usual audit trail and version checks. |
| 3D | The extrusion must be faithful in three ways: room shapes, walls and doors, and the missing features (stairs, escalators, voids, columns). The view must also be readable. |
| Survey in the map | Checked in two places: name labels on the map that click through to the place and its photo, and a checklist of every surveyed place. |
| Release | **Each feature goes to Railway when it is done.** This replaces the overhaul spec's "one release" (§2, §15) for this work. |
| Order | By how much each unblocks the team: survey in the map, then PDF plan and rooms, then Claude Code access, then 3D fidelity. |

## 3. Non-goals

- **OAuth for Claude Code.** A bearer token is enough for a team of six.
  Dynamic client registration would be a large new surface to secure.
- **Parsing PDFs on the server** (see §5.1).
- **A vector underlay** that re-renders the PDF at every zoom. One raster,
  rendered at 0.05 m/px, is crisp at the zooms people trace at.
- **A wall entity** with its own tools. Walls are still derived from rooms
  (§7).
- **Aligning floors automatically.** The Align tool from Plan 3 does it.
- **A "what did Claude change" screen.** The audit's new `via` column (§6.4)
  makes one possible later.

---

## 4. Part A — Seeing the survey in the map

**Labels.** Rooms get labels on the plan, on every Build step, and in the 3D
preview:

- A bound room shows its place's name, with ✓ when the place is confirmed and
  *proposed* when it is not.
- An unbound room shows the drawing's name in grey.
- Otherwise it shows nothing.

A label sits at the room's pole of inaccessibility, the point deepest inside
it, and not at its centroid, which lands outside an L-shaped unit. It is hidden
when it doesn't fit inside the room at the current zoom, so that L1's 193 rooms
don't turn into a wall of text. In 3D the labels use drei's `Html`, which is
already a dependency. Only the active floor is labelled, and the same fit rule
applies by camera distance.

**Place card.** Clicking a room, on the plan or in 3D (`MapScene` already
reports the room), shows a card at the top of the inspector column:

- the place's name and category;
- *Confirmed by Wei, 27 Sep*;
- the best frame, large enough to read the sign, with its box drawn, and
  ← → through its other frames (*seen in 4 frames*);
- **Open in Survey**, which opens that frame.

The best frame is a confirmed sighting with a box, the largest box first, and
failing that any sighting. An unbound room says *No surveyed place is bound to
this room* and offers **Bind one**. This card is the answer to "how do I know
this is the Starbucks?".

**Places tab.** A fourth floor tab, **Survey · Review · Build · Places**, at
`/floors/:code/places?filter=gaps`. It is the checklist, and it is a tab
rather than a view under Review or Build because it reads across both.

- It has one row per confirmed place on the floor, using the floor from
  `placeLevel`. Each row shows:
  - the frame thumbnail with its box;
  - the name and category;
  - where the place is on the map: *Starbucks → Shop (L1-shop-12)*;
  - any gap;
  - **Show on map**, which goes to Build, selects the room and opens its card.
    For an unbound place it is **Bind it**, which goes to Bind places with the
    place picked, as the to-do list does.
- A heading gives the floor's count: *28 of 30 confirmed places are on the
  map*. The Floors home card repeats that line.
- Filters: **Gaps (n) · On the map (n) · All**.
- Proposed places are not listed. They are claims until Review decides them,
  so the tab shows one line for them instead: *165 waiting in Review →*.
- A second count covers the other direction: *Rooms nobody filmed: n*, linking
  to the Bind places to-do list.

| Gap | Means |
|---|---|
| Not on the map | Confirmed, but bound to no room. |
| Room gone | Bound to a room since deleted. |
| On another floor | The room's floor is not the place's floor. |
| No confirmed photo | Every sighting is still proposed, or binned. |
| Photos disagree | `place.adjacencyBroken`: something seen in the same frame is bound over 40 m away. |

**Data and API.** Part A needs no server change and no new endpoint.

- **Pure functions:**
  - `labelPoint(ring, holes)`, in `@oth/model` geometry;
  - `placeRows(model, report, levelId)` and `bestEvidence(model, placeId)`,
    in a new `editor/src/places/`.
- **Routes:** `FloorTab` gains `"places"`.
- **Two slots**, so that later parts mount layers without editing these files
  again:
  - `PlanCanvas` gains an `overlays` slot;
  - `MapScene` gains a `children` slot.

**Risks.**

- Label clutter. The fit rule handles it, and names are truncated to the
  room's width.
- The cost of HTML labels. There are about 200 of them on L1, with only those
  in view mounted.

## 5. Part B — PDF plan and rooms

### 5.1 Where the extraction runs

| | (a) Python + PyMuPDF in the image | (b) TypeScript + pdf.js on the server | (c) TypeScript + pdf.js in the browser |
|---|---|---|---|
| Licence | PyMuPDF is AGPL-3.0 or Artifex commercial. Serving a modified copy over a network obliges releasing its source. That is a risk to hand OTH, even though the repo is public. | Apache-2.0 | Apache-2.0 |
| Docker image | About +200 MB: python3, numpy, Pillow, and PyMuPDF's 26 MB wheel. A second runtime in the image. | Rendering needs a native canvas (`@napi-rs/canvas`, 35 MB). | No change to what runs. pdf.js is a lazy chunk of about 1.5 MB in the editor bundle. |
| Untrusted files | Parsed on the server. | Parsed on the server: a pdf.js bug (CVE-2024-4367 was arbitrary JS) becomes a server bug. | Parsed in the uploader's own tab, inside pdf.js's worker. |
| Rendering the plan | PyMuPDF | Needs the native canvas. | The browser's canvas, which is what pdf.js is built for. |

**Recommended: (c).** The deciding fact is that the script never reads the
drawing's vectors to find rooms. It renders the page to a raster
(`get_pixmap`) and floods that. In the browser, pdf.js's render replaces
`get_pixmap` one for one, so the port is faithful by construction. The flood,
erode, dilate and trace steps become typed-array code in a Web Worker.

- The core stays pure, so Vitest runs it under Node with pdf.js's legacy build.
- `pdfjs-dist` is pinned exactly, and `isEvalSupported` is set to false.
- The operator list (paths) is read only by Part D's finders.

`extract-storey-plan.py` stays as the reference until the port matches it on
L1 (§9). It is then marked superseded.

### 5.2 The flow

**Floorplan step.** The drop zone takes a PDF as well as PNG or JPEG.

1. If the PDF has more than one page, choose the page.
2. A worker reads the text, finds the runs of grid dimensions and takes the
   scale from them, as the script's `calibrate` does: the median of the
   runs, keeping those that agree to within 0.5%. It reports the result:
   *Scale from the drawing's grid: 0.7505 m per point, 2 of 3 dimension
   runs agree.*
   - With fewer than two agreeing runs it says so and places the plan
     unscaled. Sheet scale and Measure scale work as they do today.
   - The printed ratio is never read.
3. The page is rendered at 0.05 m/px, or 0.07 m/px for a sheet wider than
   400 m, and uploaded as the floor's plan with its calibration, through the
   existing level-image endpoints. The PDF is uploaded alongside it, so any
   teammate can find rooms from it later.
4. Position:
   - If the floor below's plan came from a PDF of the same sheet size and
     scale, the new plan reuses that page-to-model placement. The sheets of
     one CAD set usually share a viewport; L2's sheet will confirm it.
   - Otherwise the plan is centred on the floor below's.
   - Either way, Align finishes the job, as it does today.

**Areas & rooms step.** The guide gains **Find rooms in the drawing**, beside
Import DXF.

5. **Finding.** The worker runs the script's method over the plan's current
   placement:
   - erase the lettering;
   - pinch doorways shut at 0.5 m;
   - flood from each label, then dilate back;
   - clean, trace and simplify at 0.4 m.

   The drafts are saved to the server and replace that floor's previous ones.
   Two things differ from the script:
   - **Escalator and stair labels are left out and reported.** On L1 they
     became walled rooms; Part D turns them into lift-and-stair outlines.
   - **"Void" labels become `void` drafts.** The script drops them as junk.
6. **Showing.** Drafts are drawn dashed, in the *proposed* colour, with their
   names. A draft that covers more than half of an existing room is marked
   *already on the map* and hidden by default. L1's rooms came from this
   method, so on L1 only what the script dropped comes through.
7. **Reviewing.** The to-do list reads *n drafts to review*.
   - Selecting a draft shows its name (editable), its kind (room, area or
     service, from the script's word lists) and its area in m².
   - **Accept (A) · Reject (R) · Skip (S)** use Review's keys. **Accept all
     shown** comes with a single Undo.
   - Accepting creates a room:
     - its id from the name, and its height from the level;
     - walkable if it is an area;
     - verification `cad`, with the PDF's checksum as evidence.
   - The drawing leaves some spaces open, such as *Plaza* and *Walkway*. Each
     is listed as *Draw by hand* at its label. Choosing it picks Draw area and
     zooms there.

### 5.3 Data and API

| Change | Where | Why |
|---|---|---|
| `level_images.source` jsonb, nullable: PDF storage path, checksum, page, metres per point, rotation, origin in points | table, migration | Provenance, finding rooms again later, and reusing the placement on the next floor. |
| `POST /api/level-images/:id/source` (at most 50 MB; checks the `%PDF-` header and nothing else), `GET …/source` | server | The PDF is stored but never parsed on the server. It is served as an attachment with `nosniff`, so it never renders on the app's origin. |
| `roomDraft` entity: level, name, kind, footprint (absent for an open space), holes, label point, m², source, `acceptedRoomId` | new `@oth/model` schema file, table, entity registry | Version checks, audit, soft delete and restore come free. Kept out of `MapModel`'s validation and the published bundle. |
| `PUT /api/levels/:id/drafts` `{ source, drafts[] }` | server | Replaces a floor's live drafts in one transaction. At most 1,000 drafts and 2 MB. |
| `POST /api/room-drafts/:id/accept` `{ expectedVersion, nameEn?, kind? }`, and `/unaccept` | server | Creates the room and retires the draft in one transaction. `/unaccept` is the Undo, as `/reopen` is for places. |
| `editor/src/pdf/`: `calibrate`, `labels`, `raster`, `findRooms`, `worker` | editor | The port. |

**Risks.**

- **A scanned PDF has no text layer.** The app says so, places the plan
  unscaled and offers the hand tools.
- **Rotated sheets.** L1's sheet is rotated. The script's own history shows
  how easily rotation moves the clip, so a rotated fixture is tested.
- **Memory.** A 6,000 × 5,800 px raster peaks at about 250 MB in the worker.
- **pdf.js versions.** Its path encoding changes between major versions,
  hence the exact pin.

## 6. Part C — Claude Code access

### 6.1 Getting a token

The Team page gains a **Claude Code** section, which is reachable only past
the gate and signed in.

- **Create token** asks for a name, such as *Wei's laptop*. The token is shown
  once, with the command to paste:

  ```
  claude mcp add --transport http --scope user oth https://<app>/mcp --header "Authorization: Bearer oth_pat_…"
  ```

- `--scope user` keeps the token in the teammate's own Claude Code settings.
  It never goes into a project's `.mcp.json`, which could be committed to this
  public repo.
- This section is the one place the app shows a terminal command. It is an
  exception to the overhaul's copy rule, because connecting Claude Code is a
  terminal step.
- Everyone's tokens are listed: whose, the name, created, last used and
  expiry. Anyone may revoke any of them, since the team is flat.
- Signing in is still picking a name. So anyone past the gate can make a token
  in someone else's name, as they can already act as them. To make that
  visible, the owner sees *A Claude Code token was made in your name on 3 Oct ·
  Revoke* the next time they sign in.

**The token.**

- It is `oth_pat_` followed by 32 random bytes in base64url.
- The server stores only its SHA-256, looks it up by that hash, and stamps
  *last used* at most once a minute.
- It expires after 90 days (§11). Revoking it ends it, and so does disabling
  the person. Changing `TEAM_CODE` does not.
- A person may hold at most five live tokens.
- A token can't make tokens, add teammates or change floor owners.

### 6.2 Through the gate

The gate's guard (`gate/gate.ts`) gains one exception. A `POST` to exactly
`/mcp` (compared on the parsed pathname) that carries a bearer token is
checked against the token table instead of the cookie.

- **A valid token** sets the user and the token on the context, as a session
  would.
- **An invalid token** gets a 401 with `WWW-Authenticate: Bearer`. Bad tokens
  count against a global window, like wrong codes, so a flood can't hammer the
  database.
- **Other requests are refused:**
  - a request to `/mcp` carrying only the gate cookie;
  - any request with an `Origin` header, which is the guard against DNS
    rebinding that the MCP spec asks for.
- **Nothing else changes.** A token opens no page and no `/api` route.

### 6.3 The MCP server

`/mcp` is a route in the same Hono app.

It uses `@modelcontextprotocol/sdk`, which is MIT-licensed. Its
`WebStandardStreamableHTTPServerTransport` takes Hono's `c.req.raw` directly
(checked in 1.30.1).

- It runs stateless: no session ids, and nothing held in memory across a
  deploy.
- Responses are JSON, with no SSE.
- **Why the SDK rather than our own code:** it handles the protocol-version
  negotiation, and it turns zod tool schemas into JSON Schema. Doing that
  ourselves would duplicate both and drift out of step as the protocol
  changes.
- It needs zod 3.25 or later (we have 3.25.76) and hono 4.11 or later (we
  have 4.13.5).
- **The cost:** it brings in express and a few other runtime dependencies that
  we never use.
- It is pinned exactly. `@hono/mcp` is not needed.

The tools call the same service functions as the routes and never make HTTP
calls back to the server, so a tool can do nothing the API would refuse.
Where a route handler's logic is inline, it is lifted into a function that
both the route and the tool call. That covers review accept, reject, merge
and reopen, binding, and binning a frame.

| Tool | Does | As |
|---|---|---|
| `list_floors`, `get_floor`, `get` | Floors with owners and progress. A floor's rooms, pathways, entrances, lifts and places as ids, names, kinds and versions. One entity in full. | `/api/model` |
| `check_floor` | The validation issues on a floor. | `/api/model/validate` |
| `list_frames`, `view_frame` | Frames filtered as untagged, proposed or tagged. One frame as an image of up to 1600 px, with its tags and boxes. | `/api/keyframes` |
| `view_plan` | The floor's plan, cropped, with rooms outlined (composited with `sharp`). | level images |
| `tag_frame` | Tags an existing or new place on a frame, with an optional box. | Survey's Tag |
| `review_place` | Accept, reject, merge into, or reopen. | `/api/places/:id/…` |
| `bind_place` | Binds a place to a room, and marks the room verified by photo. | Bind places |
| `create`, `update`, `delete`, `restore` | Any editable entity, checked against the model's zod schemas. Update, delete and restore take `expectedVersion`. | `/api/entities` |
| `review_draft` | Accepts or rejects a PDF room draft (once Part B is out). | `/api/room-drafts` |
| `publish` | Publishes, if the token may. | `/api/publish` |

Read tools carry `readOnlyHint`. `delete` and `publish` carry
`destructiveHint`, so Claude Code asks before using them unless the teammate
allows them.

### 6.4 The saver's rules, for a model

- **Conflicts.** A conflict writes nothing. The result is marked `isError`
  and says *Not saved: room L1-shop-12 is at version 7 and you sent 5. Wei
  changed it at 14:02. Its current value is {…}. Read it again and decide.*
  The server never retries a conflict or merges it.
- **Locks.** A write to something a person holds a lock on in the browser is
  refused: *Wei is editing this now.* An agent never edits under someone's
  hands.
- **Undo.** Deletes are soft, and each delete's result gives what `restore`
  needs.
- **Audit.** `updatedBy` is still the person. `audit_log` gains a `via` column
  holding the token id, so the trail reads *Wei via Claude Code*. While calls
  are arriving, presence shows *Wei (Claude)* on the floor.
- **Survey claims.** Tags that Claude reads off frames go in as `proposed`,
  with `proposedBy: "Claude Code (Wei)"`, just as the labelling agent's do
  (§11).
- **Publish.** Only a token made with **May publish** ticked can publish. The
  publish gate (no errors) applies as in the app, and the notes say *via
  Claude Code*.

**Limits, per token:**

- 120 reads and 60 writes a minute;
- one publish every ten minutes;
- four requests in flight at once;
- request bodies of at most 256 KB.

Over a limit, the request gets a 429 with `Retry-After`, which the model reads
as *slow down*. The counters are kept in memory, which works because Railway
runs one instance.

### 6.5 Security review, before release

The release waits for a review of these points, each with a test:

- **The gate exception** applies to exactly `/mcp`. The tests try `/mcp/`,
  `/MCP`, `/mcp/../api/model`, `%2F`-encoded paths and `/api/mcp`.
- **Token secrecy.**
  - A token is never logged: `Authorization` is redacted in `onError` and
    in request logs.
  - It never appears in audit rows.
  - It is shown exactly once.
- **Token lifecycle.** Only the hash is stored, and the tests cover the
  prefix, expiry, revocation and a disabled person.
- **Token scope.**
  - A token reaches `/mcp` and nothing else.
  - It can't mint tokens, invite anyone or change floor owners.
- **Input.**
  - Requests with an `Origin` header are refused.
  - The body limit is enforced.
  - Every tool input is validated by zod, and then by the model's schema.
- **Prompt injection.** Frames, place names and notes are data that a model
  reads, and signage can say anything. The mitigations:
  - no hard delete;
  - publishing is off by default;
  - Claude Code asks before each destructive tool;
  - the rate limits;
  - the `via` audit trail.
- **What leaves the server.** Frames and plans go to the teammate's Claude
  session. The labelling agent's already do.

## 7. Part D — 3D fidelity

| What the user saw | Cause today | Fix |
|---|---|---|
| Room shapes | Rooms were hand-traced on the 0.21 m/px 2020 sheets, and L1's escalators were extracted as rooms. | Part B's drafts replace the traces, and escalators become outlines (below). |
| Walls and doors | The model has doorways, but Build no longer draws them and `shellWalls` cuts no openings: every edge of every room is a closed wall. Where two rooms meet there are two walls. | Openings, and one wall per shared boundary. |
| Stairs, escalators, voids, columns | Portals are points with no geometry. A `void` builds nothing and cuts nothing. Columns exist only where someone drew one by hand. | Below. |
| Hard to read | No names, no pathways, and walls a whole storey high. Plan 3 made the preview a toggle and a larger panel, but not what it draws. | Part A's labels, plus legibility (below). |

- **Doors.** A wall gets an opening wherever a live pathway crosses it, as wide
  as the pathway and at most 3 m, or wherever a doorway lies on it.
  - Every reachable room already has a pathway into it: without one,
    `room.noAccess` fires. So doors need no new data.
  - Openings are gaps in the per-edge boxes. They need no boolean geometry.
- **Walls.** Neighbouring rooms' edges that are parallel and within 0.4 m of
  each other become one wall. It is built midway between them and is as thick
  as the gap, which is the drawing's wall.
  - Walls stand 1.2 m high in the preview so rooms read from above, with a
    toggle for full height.
  - Wall lines are not stored from the PDF. The drafts' footprints already sit
    on the walls' inner faces.
- **Columns** are already `detail` rooms that build solid. The extractor finds
  them as small solid-filled rectangles, 0.3–1.5 m across, and proposes them
  as detail drafts named *Column*. That is what the second builder did by hand
  for the west concourse.
- **Voids.** A `void` cuts itself out of any slab on its floor that contains
  it, which gives automatic holes, and gets a 1.1 m balustrade around its edge.
- **Lifts, escalators and stairs.** `PortalEndpoint` gains an optional
  `footprint` ring, stored as a jsonb column.
  - A lift builds a shaft through every floor it stops at.
  - An escalator or stair builds an inclined flight from the lower stop's
    footprint up to the next floor's elevation. It rises toward the end nearer
    the upper stop, and the inspector offers **Flip**.
- **Legibility.**
  - Pathways are drawn as flat strips in their kind's colour.
  - Entrances and lift stops get markers.
  - A bound room is tinted by its place's category.

**From the drawing, automatically:** footprints, names, voids, columns,
escalator and stair outlines, and door positions (door-swing arcs as doorway
drafts, an optional extra).

**Needs a person:**

- which place a room is (Bind places);
- which floors a lift or escalator joins, and which way it runs (Entrances &
  lifts);
- pathways;
- the spaces the drawing leaves open;
- heights, where the level's height is wrong.

**The second builder's files.** `massing.ts`, `shell.ts`, `theme.ts` and
`planL1.ts` belong to the second builder, so Part D is offered to them first.
If someone else builds it, the second builder reviews every change to those
four files. L1's rooms named *Escalator – nn*, which `plan:l1` imported as
rooms, are converted through the app. `planL1.ts` is not edited for this.

---

## 8. Delivery

Each part is its own small plan, and each ships to Railway when it is done.
They are listed in the order of how much each unblocks:

1. **A — Survey in the map.** It is quick, and it works on data the team
   already has.
2. **B — PDF plan and rooms.** It unblocks all eight floors.
3. **C — Claude Code access.**
4. **D — 3D fidelity.** Its finders extend B's extractor.

The parts can run in parallel because each works in its own files:

| Part | Owns (new) | Shared files it touches |
|---|---|---|
| A | `editor/src/places/`, `plan/RoomLabels.tsx`, `renderer/RoomLabels.tsx`, `@oth/model` `labelPoint` | `route.ts`, `shell/FloorTabs.tsx` and `home/FloorCard.tsx` (A's). It adds the `overlays` slot to `plan/PlanCanvas.tsx` and the `children` slot to `renderer/MapScene.tsx`, and mounts the card and the tab in `build/SelectionInspector.tsx`, `build/BuildWorkspace.tsx` and `floor/FloorWorkspace.tsx`. |
| B | `editor/src/pdf/`, `plan/DraftLayer.tsx`, `build/Drafts*.tsx`, `server/src/drafts/`, the `roomDraft` schema | `build/FloorplanTools.tsx`, `build/StepTools.tsx` and `build/todo.ts` (B's once Plan 3 is done), and `images/routes.ts`. B keeps its own draft selection, so it does not touch `state/store.ts`. |
| C | `server/src/mcp/`, `server/src/tokens/`, `team/ClaudeCode.tsx` | `gate/gate.ts` and `app.ts` (C's once Plan 4 has committed them tonight), `survey/review.ts` (to lift out the handlers), and `team/TeamPage.tsx`. |
| D | `renderer/portals.ts`, `renderer/voids.ts`, `renderer/Pathways.tsx`, and the finders in `editor/src/pdf/finders/` | `renderer/{shell,massing,theme,LevelGroup,RoomMesh}.ts(x)`, which are the second builder's, and `PortalEndpoint` in `schema/navigation.ts`. |

Files every part may touch:

- **`db/schema.ts` and `drizzle/`.** Migrations are generated one at a time,
  just before a part merges, and whoever merges second regenerates. Every
  migration only adds.
- **`api/client.ts`, `testing/fakeApi.ts` and `@oth/model`'s `index.ts`.**
  Parts append their own blocks and never edit anyone else's.

**Plan 3 is still landing.** It is at Task 11 of 13: the Build workspace is
being assembled, and `App.tsx` is retired in Task 12. That decides what can
start now:

- **Can start now:**
  - A's pure functions and the Places page;
  - B's extractor and its server half;
  - all of C, once tonight's deploy has committed the gate. C touches no
    Plan 3 file.
  - D's model field and renderer work, with the second builder.
- **Must wait for Plan 3's Task 12:**
  - anything in `build/`, `floor/` or `plan/PlanCanvas.tsx`: A's mounting, and
    B's Floorplan and Areas & rooms UI.
  - D's PDF finders, which also wait for B's extractor core.

Each part ends the same way:

- its tests pass;
- someone tries it on the :3055 sandbox copy of the data;
- it is deployed;
- the teammate note gets one line.

## 9. Testing

- **Pure functions, exhaustively:**
  - `labelPoint`, `placeRows` (every gap), `bestEvidence`;
  - `calibrate`: agreeing runs, a disagreeing run thrown out, too few runs;
  - the raster operations, on small fixtures;
  - wall merging, openings, and the geometry of a flight.
- **The extractor** runs on a synthetic PDF built inside the test: two rooms,
  a door gap, labels, a run of dimensions, and a rotated page. The architect's
  sheet never enters the repo.
- **Parity, by hand:** on the real L1 sheet the TypeScript extractor must
  reproduce `l1-spaces.json`. That means the same count of spaces within 5%
  and a median IoU of at least 0.95.
- **Server, against PGlite:**
  - replacing, accepting and unaccepting drafts;
  - the PDF upload refusing a file that isn't a PDF;
  - tokens: shown once, stored as a hash, revoked, expired, a disabled person;
  - each of the gate exception's path tests;
  - every tool's conflict answer, and the rate limits.
- **MCP end to end:** the SDK's own client against the app, in process. It
  initialises, lists the tools, meets a conflict, and is refused a publish
  without the scope.
- **By hand:** `claude mcp add` against the sandbox, then against Railway.
- **Throttled runs:** test runs keep the worker cap, as before.

## 10. Risks

| Risk | Mitigation |
|---|---|
| A token made in someone else's name | Tokens are listed for the whole team and revocable by anyone, and the owner is told at their next sign-in. It is no worse than name-only sign-in, which is accepted behind the gate. |
| A token committed to this public repo | The command uses `--scope user`. The `oth_pat_` prefix makes a leaked token easy to grep for, and it can be revoked in one click. |
| An agent runs away | Rate limits, soft deletes only, publishing off by default, and the `via` audit trail. |
| A sheet unlike L1's | Every draft is reviewed. With no dimensions or text layer, the app falls back to the hand tools. |
| Shipping each part breaks the live app while the team is working in it | Every release is tried on the sandbox first, migrations only add, and Railway can roll a deploy back. |
| Four parts in parallel collide | The ownership table in §8, migrations generated one at a time, and Plan 3's files left alone until its Task 12. |
| AGPL code in the product | PyMuPDF stays in a script that is run by hand. The product uses pdf.js. |
| The 40-hours-each budget | The non-goals in §3. Door arcs are the first thing to drop. |

## 11. Open questions

1. **Can Claude publish with no person involved?** *Recommended:* yes, but
   only with a token made with **May publish** ticked, which is off by
   default. The publish gate still applies.
2. **How long should a token last?** *Recommended:* 90 days, which runs past
   the 18 December deployment. It is revocable, and renewing it means making a
   new one.
3. **Should Claude's own survey tags arrive as proposals or as confirmed?**
   *Recommended:* as proposals, so they pass through Review like the labelling
   agent's. Claude can still accept them through `review_place` when the
   teammate asks it to.
4. **Should sign-in stay name-only now that tokens exist?** *Recommended:*
   yes, for the team of six, with the notice at sign-in and the team-wide list
   from §6.1. Add a personal passphrase if anyone outside the six gets the
   team code.
