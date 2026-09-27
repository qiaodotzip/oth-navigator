# Workspace Overhaul — design

> **Status:** approved in conversation 2026-09-27; written spec awaiting review.
> **Scope:** rebuild the Survey and Build tools as one application a team of six
> can use without help, organised around floors, and make it deployable.
> Builds on [`2026-09-05-editor-usability-design.md`](2026-09-05-editor-usability-design.md)
> and [`2026-09-05-survey-labelling-design.md`](2026-09-05-survey-labelling-design.md);
> the model, server and publish pipeline from
> [`2026-09-04-oth-map-model-design.md`](2026-09-04-oth-map-model-design.md) are unchanged.

---

## 1. Context

OTH has delivered the floorplans. The work now is six people surveying and
tracing eight storeys, and the tools they would do it in were built one feature
at a time by the person who knew every feature. An audit on 2026-09-27 found
the result unusable by anyone else:

- **Two apps in one.** The map editor and `/survey` have different headers, no
  shared navigation, and until the bug pass only one of them checked sign-in.
- **Everything at once.** The editor shows eight tools, a layers list, a 3D
  preview and a checklist carrying 244 validation issues — 190 of them "place
  not bound", listed one per line under *Areas & rooms*.
- **The work is not where the eye is.** Labelling a frame means scrolling down
  to the tag input and back up for the next frame; reviewing a proposal happens
  in a 288 px sidebar with 64 px thumbnails that do not show the box the agent
  drew, and the agent's boxes are sometimes wrong.
- **Nothing is organised by floor**, although the team splits the work by
  floor: the one capture and 177 of 190 places have no level.
- **No path to a teammate.** Accounts are created with a CLI command that prints
  a one-time password to a terminal; there is no way to change it in the app.

The bug pass that precedes this spec (branch `ux-overhaul`, ten commits) fixed
the blockers — entrances and lifts can be placed, the canvas pans and fills the
screen, frames load as thumbnails, review decisions are one request. What it
did not fix is the shape of the thing, which is this spec.

## 2. Decisions already made

Settled with the user during brainstorming, with mockups:

| Question | Decision |
|---|---|
| Devices | Laptops only. No mobile layouts beyond not breaking. |
| Work split | By floor. Each floor has recorded owners. |
| Release | One release, after the whole overhaul. Nobody starts before. |
| App structure | A **Floors home**, then a **floor workspace** with Survey · Review · Build tabs. |
| Survey | Frame first, tag bar pinned under it, keyboard driven, plus a **Grid** view toggle. |
| Review | **One proposal at a time**, with a list drawer for jumping and batch accept. |
| Build | A **stepper**: each step changes what the screen offers. |
| Look | Calm neutral (warm greys, one teal accent), with larger type and an amber "Yours" marker. |
| Build approach | Rebuild the UI in place; keep model, server, store and pure logic; Radix primitives for dialog, popover and toast only. |

## 3. Goals

- A teammate who has never seen the tools signs in, lands on their floor, and
  knows what to do next without being told.
- The thing being worked on — a frame, a proposal, the plan — is the largest
  thing on screen, and the next action is directly under it.
- Every screen worth pointing at is a URL.
- Destructive actions can be undone rather than confirmed.
- The team's local work (traced rooms, 445 frames, 190 places) moves to the
  hosted server intact.

## 4. Non-goals

- **The visitor app.** Still its own project.
- **Mobile or on-site capture.** Survey stays a desk tool over existing footage.
- **Roles or approval workflow.** A flat team, as the map-model spec decided;
  anyone signed in may invite, reset, assign owners and publish.
- **Real-time co-editing.** Presence and advisory locks stay as they are.
- **Changing validation, the nav bake or the publish gate**, beyond grouping how
  their output is shown.
- **A component library.** Radix primitives for three hard-to-get-right widgets;
  everything else stays Tailwind.

## 5. Structure

### 5.1 URLs

The hand-rolled router in `route.ts` stays and grows a pure, tested pair:
`parseRoute(pathname, search) → Route` and `href(route) → string`.

```
/floors                                  Floors home
/floors/:code/survey?capture=&frame=&view=grid&filter=untagged
/floors/:code/review?place=&list=open
/floors/:code/build?step=pathways&select=room:L1-a
/team                                    members and invites
/            → /floors
/survey      → /floors/<your floor>/survey   (old links keep working)
```

"Your floor", wherever it appears, is the lowest floor you own; if you own
none, the floor you last worked on in this browser; failing that, the lowest
floor.

Unknown floor codes and malformed params fall back to the nearest valid route
rather than a blank screen.

### 5.2 Code layout (`packages/editor/src`)

```
ui/       Button, Kbd, Chip, Avatar, Progress, Dialog, Popover, Toast — tokens applied
shell/    AppShell, header, FloorSwitcher, AccountMenu, PublishButton, Toaster, OfflineBanner
home/     FloorsHome, FloorCard, OwnerPicker
team/     TeamPage, InviteDialog, ChangePasswordDialog
survey/   SurveyWorkspace, FrameView, GridView, TagBar, FramePanel, Filmstrip, AddFootageDialog
review/   ReviewWorkspace, ProposalFocus, ProposalDrawer
build/    BuildWorkspace, Stepper, StepGuide, StepTodo, LayersDrawer, PreviewToggle
plan/     PlanCanvas and friends — kept, restyled
flow/     pure logic — kept, extended
```

`App.tsx` and `SurveyApp.tsx` are retired once their pieces have moved. The
zustand store, `createSaver`, the API client and every pure function under
`flow/`, `plan/` and `survey/` are kept.

### 5.3 Data changes

| Change | Where | Why |
|---|---|---|
| `level.ownerIds: string[]` (default `[]`) | model schema, `levels` table, migration | Floors are owned; the home page and switcher show it. |
| `GET /api/users` | server | Names and ids for owners, avatars and the team page. |
| `POST /api/users/invite`, `POST /api/users/:id/reset-password` | server | Invites without a terminal; returns a one-time password once. |
| `POST /api/auth/password` | server | Change your own password; clears the one-time flag. |
| `users.mustChangePassword` | `users` table | Set by invite/reset, cleared on change; drives the "set your own password" banner. |
| `POST /api/entities/:type/:id/restore` | server, repository | Undo for soft deletes, audited like any write. |
| `POST /api/keyframes/:id/restore` | server | A binned frame comes back with the sightings binned with it (same `deletedAt`). |
| `POST /api/places/:id/merge` `{ into }` | server | "Same as…" in Review: sightings move to the existing place, the proposal is retired, in one transaction. |
| Capture level at creation | editor | Add footage files the capture under the current floor. |
| `placeLevel(model, place)` | `@oth/model`, pure | `place.levelId`, else the level of the capture it was most often sighted in. Fixes the 177 floorless places without a data migration. |
| `floorProgress(model, report, levelId)` | editor `flow/`, pure | One source for the home cards, the switcher and the tabs. |

`floorProgress` returns, per floor:

- **Survey:** frames with at least one sighting / all frames, over the floor's
  captures.
- **Review:** confirmed / (confirmed + proposed), over places whose derived
  level is this floor. A rejected proposal is deleted and leaves both counts,
  so the bar never goes backwards on a reject.
- **Build:** steps done / 6, from the existing checklist, and the id of the
  next unfinished step.

The survey filters use the same terms: **Untagged** — no sighting;
**Proposed** — at least one proposed sighting; **Tagged** — at least one
sighting, all confirmed.

## 6. The shell

**Header**, one row, identical on every screen:

- Left: **OTH Map** (to `/floors`); inside a floor, the **floor switcher** —
  `L1 · Yours ▾`, a popover listing every floor with owners and progress — and
  the tabs **Survey · Review (n) · Build**, where *n* is proposals waiting on
  this floor.
- Right: online teammates as avatars (hover: which floor, from presence),
  **Publish**, and the **account menu** (name, Change password, Team, Sign out).

**Publish** is building-wide. Disabled until the report has no errors; its
popover lists what blocks it grouped by floor, each item a link to the step
that fixes it (`L1 · 1 entrance off walkable floor → Entrances & lifts`).

**Feedback.** The status footer is removed. Outcomes are toasts
(`aria-live="polite"`); errors stay until dismissed and offer Retry where
retrying makes sense. A version conflict stays an inline banner in the
workspace — *"Wei changed Stadium · Reload"* — because it is about what you are
looking at. An offline banner appears while `/api/health` fails. An expired
session opens a sign-in dialog over the current page instead of navigating
away.

## 7. Floors home

- A primary **Continue on L1 →** button: your floor (§5.1), on the tab you
  last used there (remembered per browser).
- Eight **floor cards**, 4 × 2: code and name; owners, with an amber **Yours**
  tag on yours; three thin bars — Survey, Review, Build; and a line saying
  what is next (*Next: draw pathways*). Owners are set from the card with a
  small picker.
- A summary line: *2 of 8 floors ready · last published v12, 3 days ago*.

## 8. Team and account

- **`/team`**: members with the floors they own and whether they are online
  now. **Invite a teammate** (name, email) shows the one-time password once,
  with *Copy invite message* (URL, email, password). **Reset password** on a
  member does the same.
- **Change password** from the account menu. Signing in with a one-time
  password shows a banner asking you to set your own until you do.
- `npm run invite` remains for the very first account on a fresh server.

## 9. Survey workspace

**Top row:** capture picker (only when the floor has more than one),
`Frame 212 of 445 · 7m04s`, filter chips **All · Untagged (n) · Proposed (n) ·
Tagged (n)**, **Frame | Grid** toggle, **+ Add footage**.

**Frame view.** The frame is scaled to fit the space left, never scrolled to.
Boxes are drawn on it; drag to box, drag a label to move, corners to resize, ×
to remove — the existing box editing, restyled. Directly under the frame, the
**tag bar**: Place / Walkway, a name field whose suggestion list shows this
floor's places first with their sighting counts, category (locked for an
existing place), walkway type with an inline *New type* field, and **Tag**.
Under that, the **filmstrip**: 240 px thumbnails, a stripe per frame (tagged,
proposed, empty), windowed so only frames near the current one render, the
current frame kept in view.

**Right panel:** *On this frame* (each tag, removable) and *Places on L1*,
searchable; choosing a place filters the frames to the ones it appears in.

**Keys** (inactive while typing): ← → previous / next within the filter · **N**
next untagged · **T** focus the name · **Enter** tag · **Esc** drop the box ·
**Del** bin the frame · **G** grid.

**Grid view.** A contact sheet of the floor's frames with the same stripes,
lazily loaded and windowed. Clicking a frame opens it in Frame view.

**Add footage** is a dialog: choose the video file (never uploaded), name
(defaults to the filename), filed under this floor; *Find frames
automatically* runs with progress and Cancel, frames appearing as they upload.
The same dialog, opened on an existing capture, finds more frames in it.

## 10. Review workspace

One proposal at a time, for the current floor.

- A progress line: *15 of 185 decided on L1*.
- The **evidence frame**, large (1600 px variant), with the agent's box drawn;
  ← → through its other frames. The box can be corrected in place before
  deciding.
- Name, category, the agent's note and who proposed it; **Accept (A) · Reject
  (R) · Skip (S)**. The next proposal loads immediately. Letter keys are
  ignored while a field has focus.
- **Same as…**: when the proposal's name matches an existing place on the
  floor, offer merging into it rather than creating a duplicate.
- **List (L)** opens a drawer of the floor's proposals: filter, jump to one,
  tick several and accept them together.
- Every decision shows an undo toast — *Accepted Festive Mall · Undo*.

## 11. Build workspace

A **stepper** across the top — Floorplan · Areas & rooms · Pathways · Entrances
& lifts · Bind places · Dressing — with a done mark and an open-issue count on
each. Choosing a step changes three things: the **guide** floating over the
canvas (one instruction and that step's tools), the **to-do list** on the right
(that step's issues, each click selecting and zooming to the entity), and the
tool set. Steps guide; none are locked.

| Step | Tools | To-do from |
|---|---|---|
| Floorplan | Upload (drop zone), Measure scale, **Sheet scale** (paper size + ratio, e.g. A3 at 1:1500), drag to align with the floor below shown faintly, opacity | image missing, scale unset |
| Areas & rooms | Draw area, Draw room, Import DXF | unnamed spaces, broken footprints |
| Pathways | Draw pathway, walkway types inline | `room.noAccess`, `pathway.disconnected`, `area.unreachable` |
| Entrances & lifts | Entrance, Lift/stair, with other floors' stops shown dashed | `entrance.*`, `portal.*`, `level.portals.none`, `building.entrances.none` |
| Bind places | Select a room, pick its place from this floor's confirmed places, with an evidence thumbnail | `place.unbound`, `room.unsurveyed` for this floor |
| Dressing | Draw detail, export context / detail for Blender, upload `.glb`, place | `detail.undressed`, `placement.*` |

**Sheet scale** exists because it is the right method for OTH's plans: the
drawn scale bars are wrong by a factor of three, and the sheet itself
(3000 px across an A3 at 1:1500) gives 0.21 m/px exactly.

**On every step:** Select, pan and zoom, Fit, a **Layers** drawer (everything
on the floor, rename, delete with undo), a **3D** toggle (the preview as a
floating panel), and the inspector for the selection in the right column above
the to-do list. Spaces are drawn semi-transparent so the plan shows through.

**Keys:** **V** select · **A** area · **R** room · **P** pathway · **E**
entrance · **L** lift · **F** fit · **Space** drag to pan · **Del** delete ·
**Esc** cancel the shape in progress.

## 12. Look

- **Type:** Inter, 14 px base (up from 12–13), 13 px for secondary text.
- **Colour tokens** in `tailwind.config.ts`: warm grey neutrals (stone), one
  **teal** accent for primary actions and selection; **amber** for *yours* and
  *needs attention*; **sky** for *proposed*; **emerald** for *confirmed*;
  **red** for errors. Colour is never the only signal — every status also has
  a word or an icon.
- **Shape:** 6 px corners, 1 px borders, shadows only on floating panels.
- **Focus:** a visible `focus-visible` ring on every control.

## 13. Deploy

- **Railway**, per the plan: Postgres via `DATABASE_URL`, a volume mounted at
  `DATA_DIR` for assets and thumbnails, `sharp`'s Linux binary from the
  lockfile, `/api/health` as the health check.
- **`data:export` / `data:import`** CLI: writes the model rows and every
  referenced asset file from one server's database and data directory, and
  reads them into another, so the local PGlite work reaches production intact.
  Import refuses to run into a database that already has rooms, rather than
  merging.
- **Teammate note:** one page — the URL, how to sign in and set a password, and
  the order of the six build steps — in the short style of the client docs.

## 14. Testing

- **Pure functions, exhaustively:** `parseRoute` / `href`, `floorProgress`,
  `placeLevel`, the per-step to-do derivation, the key maps.
- **Components** with Testing Library, as now; the kept tests move with their
  components.
- **Server** endpoints against PGlite: owners, users / invite / reset /
  password, restore (entity and keyframe), merge.
- **An end-to-end smoke test** (`npm run e2e`, Playwright, run by hand, not
  part of `npm test`): sign in, change password, tag a frame, accept and undo a
  proposal, place an entrance, publish refused with its reasons.
- Test runs keep a worker cap: the full suite unthrottled is what froze the
  laptop before.

## 15. Delivery

One spec, four plans, in order; nothing is released until all four are done.

1. **Foundation** — tokens and `ui/`, routes, the shell, Floors home, owners,
   team and account endpoints and screens, toasts, undo and restore.
2. **Survey and Review** — both workspaces, Add footage, merge.
3. **Build** — the stepper, per-step guide and to-do, sheet scale, drag-align,
   bind places, layers drawer, 3D toggle.
4. **Deploy** — Railway config, data export / import, the e2e smoke test, the
   teammate note.

## 16. Risks

| Risk | Mitigation |
|---|---|
| A rebuild in place breaks the logic the old screens used | The pure functions and their tests are kept as-is; screens are replaced around them, and the e2e smoke covers the paths that matter. |
| One release at the end means late feedback | Each plan ends with the app runnable against the sandbox copy of the real data, for the user to try before the next starts. |
| The data carried to production is incomplete | Import is all-or-nothing into an empty database, and reports counts per entity type to check against the export. |
| Anyone can reset anyone's password | Accepted for a team of six, as the map-model spec accepted a flat team. Every reset is in the audit log. |
| The 40-hours-each budget | No new features beyond what the six steps and the two survey tabs need; the spec's non-goals are the list of things to say no to. |
