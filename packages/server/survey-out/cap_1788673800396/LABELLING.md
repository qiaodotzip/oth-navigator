# Labelling this capture

You are proposing what is in each frame. Nothing you write here is treated as
true — a person reviews every proposal before it becomes part of the map — so
propose what you can actually see and say when you are unsure.

## What to do

1. Read `manifest.json`. It lists every frame and the places already named.
2. Look at each image under `frames/`.
3. Write `proposals.json` next to the manifest, in the shape below.
4. Tell whoever asked you to run `survey:import <path to proposals.json>`.

## The shape

```json
{
  "captureId": "cap_...",
  "proposals": [
    {
      "keyframeId": "kf_...",
      "nameEn": "NTUC FairPrice",
      "category": "retail",
      "box": { "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4 },
      "placeId": "pl_existing",
      "note": "sign partly obscured"
    }
  ]
}
```

- `keyframeId` — required, and must be one from the manifest.
- `nameEn` — required. What the sign actually says. Do not invent a name for
  something you cannot read; describe it instead ("unmarked shopfront").
- `category` — one of: government, healthcare, community, retail, lifestyle,
  sports, facility.
- `box` — optional, in fractions of the frame. Include it only when the frame
  shows more than one thing and it says which you mean.
- `placeId` — optional. If the thing is already in `knownPlaces`, use its id
  so the seventh sighting of a shop links rather than making a seventh shop.
- `levelId` — optional, like "oth-L3". Set it when the frame tells you the
  floor, such as a directory board. Otherwise the capture's floor is used.
- `note` — optional. Say what you were unsure about; the reviewer reads it.

## The point

One label per *individual* thing, not per category. Every shop, counter, kiosk
and machine gets its own identity, because that is what a visitor asks for by
name. A frame with four shopfronts should produce four proposals.
