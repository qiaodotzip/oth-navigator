# OTH Navigation

Indoor wayfinding for **Our Tampines Hub** — Singapore's largest integrated
community hub, 8 storeys, 30+ tenants and services across 6 government agencies,
serving 250,000 residents.

This repository is the production successor to the hackathon prototype that
placed 5th at the Tampines AI JOM Hackathon. OTH engaged the team to take the
map forward as a real web application. The prototype lives on in
[`legacy/`](legacy/) as reference; its floor data is superseded.

---

## Why this is a rewrite, not an upgrade

The prototype had no 3D model. It stored 2D point rings with a height number and
extruded them at runtime; everything else was a rectangle tagged with one of ~35
hardcoded type strings, each rendered by a hand-written three.js component. There
was no asset pipeline of any kind — no way for a mesh a human made to enter the
app at all. The authoring tools wrote to `localStorage` and a localhost-only
endpoint, so exactly one person on one machine could use them. And the floor data
was traced from outdated plans, so it was wrong.

None of that carries 8 storeys, a modelling teammate working in Rhino/Blender, or
a public service OTH operates.

## The model

Four thin layers. Each has exactly one authoring tool, and **exactly one of them
is load-bearing for routing**:

| Layer | Contents | Authored in | Load-bearing? |
|---|---|---|---|
| **Structure** | Room footprints + heights, on a shared building datum | Editor, plan view | Yes — everything |
| **Navigation** | Walkable surface, doorways, entrances, portals | Editor, derived + corrected | Yes — routing |
| **Dressing** | `.glb` hero assets placed by transform | Blender/Rhino → uploaded → placed | **No** |
| **Semantics** | Tenants and services bound to room ids | Editor / CSV import | Search + POIs |

The dressing layer is **deliberately inert**: nothing in routing, collision or
reachability reads a `.glb`. A teammate can get a mesh badly wrong and the worst
outcome is that it looks wrong — the route still works. That is what makes the
Blender round trip safe to hand to someone who is not a developer.

Read the full design in
[`docs/design-and-plans/specs/2026-09-04-oth-map-model-design.md`](docs/design-and-plans/specs/2026-09-04-oth-map-model-design.md).

## Repository layout

```
packages/
  model/      schema, geometry, validation, nav baking, bundle builder — pure TS
  renderer/   shared rendering + Blender context export
  server/     Hono API, Postgres, auth, assets, publish
  editor/     hosted authoring app for the team
  viewer/     the visitor-facing app                          (next project)
legacy/       the hackathon app, kept runnable for reference
docs/         specs and implementation plans
```

`packages/model` is pure and I/O-free on purpose. It is what both apps and the
server depend on, and the part that must be most heavily tested.

## Quick start

Requires Node 20+. Nothing else — no database to install.

```bash
npm install
npm test          # vitest across all packages
npm run typecheck # tsc -b, strict

# seed the building and 8 levels, then create yourself an account
npm run seed
npm run invite -- you@example.com "Your Name"
npm run reset-password -- you@example.com   # if the one-time password is lost

# the server also serves the built editor, so this is all you need
npm run dev             # API and editor on :3000

# or, to work on the editor with hot reload, a second terminal
npm run dev --workspace @oth/editor   # editor on :5180
```

Every command above also exists in the long `--workspace @oth/server` form.
The short ones are here because the long ones are easy to mistype, and a
mistyped one fails silently enough to look like the app is broken.

Working with the map and the survey:

```bash
npm run trace                        # zones traced from the 2020 storey plans
npm run survey:export -- <captureId> # frames + a brief for a labelling agent
npm run survey:import -- <file.json> # the agent's proposals, for review
```

Locally the server falls back to file-backed PGlite, the same engine the tests
use, so a fresh clone runs with nothing installed. Production requires
`DATABASE_URL` and refuses to start without it — see
[`packages/server/README.md`](packages/server/README.md).

To run the old prototype for reference: `cd legacy && npm install && npm run dev`.

## How the model reaches visitors

The editor's database is never read by the visitor app. Editing is continuous and
half-finished by nature, and a public service cannot render someone's in-progress
corridor.

Instead, **Publish** snapshots the model into an immutable, versioned bundle, and
the viewer only ever reads a published version. Publishing runs the full
validator as a **gate**: a model with a self-intersecting footprint, a doorway
pointing at a room that does not exist, or a walkable room no entrance can reach
is refused, not shipped. Warnings — an unnamed room, an unverified tenant — are
surfaced but never block.

The navigation grid is baked at publish time at 0.25 m resolution into a packed
bitmask, so the viewer never rasterises eight floors on a phone.

## A note on data accuracy

The prototype's data was wrong because the plans it was traced from were out of
date and nothing recorded that fact. Every room and tenant in the new model
carries a `verification` field — `unverified`, `photo`, `onsite` or `cad` — with
evidence and an author. Staleness is visible instead of silent, and publishing
warns about anything never checked against the real building.

## The Blender round trip

The modelling teammate never touches load-bearing data and never needs git:

1. **Export context** in the editor writes a `.glb` of the active level — floor
   slabs and walls as locked reference geometry, in real metres, with the origin
   convention recorded inside the file so it cannot be guessed wrong later.
2. They model against it in Blender or Rhino and export **just their new mesh**.
3. **Upload** it in the editor. The server checks it is valid glTF 2.0 and within
   budget (5 MB, 150k triangles), content-addresses it by checksum, and registers
   it as a placeable asset.
4. **Place** it in a room. Replacing an asset later touches nothing else.

Because the dressing layer is inert, a mesh that is broken, mis-scaled or wrong
can only ever *look* wrong. Routing keeps working.

## Credits

Built for Our Tampines Hub, following the Tampines AI JOM Hackathon 2026, where
the prototype placed 5th.
