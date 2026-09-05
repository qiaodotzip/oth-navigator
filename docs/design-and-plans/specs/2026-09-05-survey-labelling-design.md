# Survey Labelling — design

> **Status:** draft 2026-09-05.
> **Scope:** turn the walkthrough footage into a tenant catalogue and an
> adjacency graph, with evidence, **before any floorplan exists**.
> Fulfils [`2026-09-04-oth-map-model-design.md`](2026-09-04-oth-map-model-design.md) §12,
> which reserved the landing points and deferred the tool to its own spec.

---

## 1. Context

The map model spec reserved three things for this tool and then deliberately
stopped:

> `room.verification.evidence` — references to keyframes that show the room.
> `tenant.verification.evidence` — the photo a tenant record was derived from.
> Adjacency captured from co-visibility ("this shop is next to that shop")
> validates against the derived doorway graph.
>
> The intended sequence: labelling produces the connectivity graph and tenant
> catalogue **without floor plans**; when CAD arrives, the structure layer is
> imported or traced and the graph snaps onto it as a correctness check. Nobody
> is blocked waiting on OTH.

That sequence is now the actual situation. The floorplans are weeks away, the
editor is finished, and the footage has been sitting on a laptop since the
hackathon. Everything the map eventually needs to *say* — which units exist,
what they are called, what kind of thing they are, what is next to what — is
already recorded in that footage and can be extracted today.

There is a second reason to do it now, and it is the more important one.

**The hackathon's failure was that nothing recorded what was known.** The plans
were outdated and the model did not say so, so the data looked authoritative and
was wrong. `verification` exists to fix that, and it is currently `unverified`
on every entity because nothing writes to it. A room traced from a rough sketch
and a room confirmed against a photograph are different claims, and the model
can only tell them apart if something does this work.

---

## 2. Goals

- Extract named, categorised units from footage with **no floorplan**.
- Every claim carries the frame it came from.
- Record what is next to what, from what was seen together.
- When structure arrives, bind a place to a room and **check the two agree**.
- Usable by a teammate who has never opened a terminal.

## 3. Non-goals

- **Automatic recognition.** No OCR of shop signs, no object detection. Reading
  a fascia is a job a human does in two seconds and a model does in two seconds
  and one mistake. Worth revisiting once the catalogue exists and there is
  something to measure against.
- **Uploading video.** See §5 — the video never leaves the laptop.
- **Photogrammetry or 3D reconstruction.** Unchanged from the map model spec.
- **Positions.** A place has no coordinates until it is bound to a room. The
  graph is topological on purpose; guessing metres from a handheld video would
  manufacture precision that is not there.
- **Public-facing anything.** This is a team tool behind the same invite-only
  login as the editor.

---

## 4. The survey layer

Four entities, sitting alongside the existing four layers rather than inside
them, because they describe *the evidence* rather than the building:

```
capture    id, kind (video | photos), filename, durationMs?, levelId?, notes
           — the source. The bytes are NOT stored; see §5.

keyframe   id, captureId, timeMs?, imageId, widthPx, heightPx
           — one still. Stored content-addressed, like a floorplan underlay.

place      id, nameEn, nameZh, category, levelId?, roomId?, notes
           — something you can point at and name, before the map knows it
             exists. Becomes a tenant, and binds to a room, later.

sighting   id, placeId, keyframeId, box?  (x, y, w, h in image fractions)
           — this place appears in this frame. The evidence link.
```

A **place** is the load-bearing idea. Labelling happens before the structure
exists, so a label cannot reference a `room.id` — there are no rooms. It needs
an identity of its own that survives until there is something to bind it to.
`roomId` is optional and empty for most of the project's life; filling it is
what §7 calls binding.

`category` reuses the existing `TenantCategorySchema`, so the catalogue lands in
the semantics layer without a translation step.

---

## 5. The video never leaves the laptop

A walkthrough of eight floors at phone quality is tens of gigabytes. Railway's
hobby plan is not the place for it, the upload would take a working day on a
home connection, and **the frames actually worth keeping are a few hundred**.

So the browser does the extraction:

```
  <input type="file"> → <video> (a local object URL, never uploaded)
        ↓ scrub to a moment worth keeping
  canvas.drawImage(video) → JPEG blob → POST /api/keyframes
        ↓
  only that frame is stored, content-addressed beside the floorplans
```

No ffmpeg on the server, no video in storage, no upload wait, and it works on a
train with no connection until you press the button.

**The honest cost:** a capture's timeline can only be re-scrubbed by whoever has
the file. Re-opening a capture asks for the same local file again, matched on
filename and duration, and says so plainly rather than appearing broken. What
survives without it is everything that matters — the keyframes are permanent and
so is every place, sighting and adjacency derived from them. Only *finding a new
moment* needs the original back.

Photos skip the video step entirely: a photo set is a capture whose keyframes
are uploaded directly, with no `timeMs`. The rest of the tool does not care
which kind it is looking at.

---

## 6. What the labelling produces

### The tenant catalogue

Every place with a name and a category is a tenant record waiting to be written,
with `verification.evidence` set to its sightings and `status: "photo"`. That is
the first time anything in this project moves an entity off `unverified`.

### Adjacency, from two independent signals

- **Co-visible** — two places sighted in the same keyframe. You can see both at
  once, so they are near each other and facing the same space.
- **Sequential** — two places sighted in consecutive keyframes of one capture.
  You walked past one and then the other.

These are different claims and the tool keeps them apart. Co-visibility is
strong evidence of adjacency; sequence is evidence of *connection*, which is
weaker but says something co-visibility cannot: **that a walkable route exists
between them, because a person walked it.**

That second one is worth dwelling on. A labelled walkthrough is a recording of a
real path through a real building. The order of sightings along a capture is a
route somebody actually took — which is precisely what a pathway is, and what
the pathway tool otherwise asks a human to assert from memory. Once places are
bound to rooms, a capture's sequence is a **candidate pathway** with real
provenance.

### Evidence, for the rooms too

Binding a place to a room copies the sightings onto `room.verification.evidence`
and sets `status: "photo"`. The traced footprint stays a tracing; what changes is
that the model can now say *this room is a real place, and here is the picture*.

---

## 7. Binding, and the check that makes this worth doing

Binding is one action: with a room selected in the editor, choose the place it
is. It sets `place.roomId`, and copies evidence both ways.

Once bound, the graph and the geometry are two independent descriptions of the
same building, and **they can be made to disagree**:

- **`place.unbound`** — a named place no room claims. Either the trace is
  missing a unit, or the place was a duplicate. Warning.
- **`place.adjacencyBroken`** — two places co-visible in a frame whose bound
  rooms are nowhere near each other. Warning, with both frames to look at.
- **`room.unsurveyed`** — a traced room no place is bound to. Warning at
  publish, and the honest answer to "how much of this map has anyone actually
  seen?"

None of these are errors. Every one of them is a question for a human, not a
fact — the footage may be old, a unit may have changed hands, a frame may show a
reflection. The point is that two independent sources agreeing is a far stronger
accuracy position than either alone, and the only way to get that is to let them
disagree out loud.

---

## 8. The tool

A second route in the existing editor app — `/survey` — behind the same
invite-only login, using the same server, storage and audit log. A separate
application would duplicate all four for no benefit; this is the same team doing
a different job on the same data.

```
┌ Captures ─────┐┌ Frame ──────────────────────┐┌ Places ────────┐
│ ▸ L1 walk.mp4 ││                             ││ 🔍 search      │
│   14 frames   ││      [ the keyframe ]       ││ ・Starbucks  ×3│
│ ▸ L3 walk.mp4 ││                             ││ ・NTUC       ×7│
│   6 frames    ││   drag a box → name it      ││ ・Library    ×2│
│ + add capture ││                             ││ 12 unbound     │
└───────────────┘└─────────────────────────────┘└────────────────┘
                 ┌ Filmstrip ──────────────────┐
                 │ ▪▪▪▪▪▪▪ ▪ ▪▪  ← keyframes   │
                 │ ═══════╪══════ ← scrub      │
                 └─────────────────────────────┘
```

The gestures that matter, in the order a session uses them:

1. **Pick a local video.** It plays; nothing uploads.
2. **Scrub, and press Space** at anything worth keeping. The frame lands in the
   filmstrip and uploads in the background.
3. **Drag a box** on a frame, type a name. Autocomplete offers existing places,
   so the seventh NTUC sighting links rather than making a seventh NTUC.
4. **Skip the box** when the whole frame is the thing. A box is for saying
   *which* of two shops you mean, not a chore to perform every time.

Naming is the slow step, so autocomplete-on-existing is the single most
important interaction in the tool. Everything else is a click.

---

## 9. Migration

Four new tables. No existing table changes: `verification` already exists on
rooms and tenants with `evidence: string[]`, reserved for exactly this, and
binding fills it in.

Keyframes reuse the content-addressed store and the PNG/JPEG inspection already
built for floorplan underlays, including the 20 MB budget — which a single JPEG
frame will never approach.

## 10. Testing

- **Pure and exhaustive**: co-visibility and sequence derivation from a set of
  sightings, including a place sighted twice in one frame, a capture with one
  keyframe, and frames whose order differs from their `timeMs`.
- **Binding**: evidence lands on both the place and the room; unbinding removes
  it; binding a second place to the same room is refused.
- **The disagreement rules**, each with a passing and a failing case.
- **Keyframe capture** is browser work and the canvas is not testable in jsdom,
  so the extraction is split: a pure `frameFilename(capture, timeMs)` and a thin
  uncovered `drawImage` call. The upload path is tested from the blob onward.

## 11. Implementation order

1. The four entities in `@oth/model` and on the server, with the derivation
   functions pure and tested.
2. Keyframe capture and upload — the video-to-JPEG path, end to end.
3. The `/survey` route: captures, filmstrip, frame, places, naming.
4. Binding, evidence, and the three disagreement rules.

## 12. Open question for the team

This assumes the footage is **handheld walkthrough video plus loose photos**,
which is what was described at the start of the project. If a floor was captured
some other way — a burst of stills at each unit, or a 360 camera — §5 still
holds, but the filmstrip in §8 is the wrong shape for it and should be a grid.
Worth confirming before Task 3, not before Task 1.
