# Popular Times Scrape (one-shot)

Grab Google Popular Times curves for each OTH service once and write them to `public/data/popular-times.json`. The app reads that JSON at runtime — no live API calls during normal use.

## When to run

- Once before the hackathon demo, after `place-ids.json` is filled in.
- Re-run if you add new services or want a fresher curve (Popular Times changes slowly; monthly is plenty).

## Setup

From the repo root, create a Python virtual environment and install deps.

**Windows PowerShell:**
```powershell
python -m venv scripts/popular-times/.venv
scripts/popular-times/.venv/Scripts/Activate.ps1
pip install -r scripts/popular-times/requirements.txt
```

**macOS / Linux:**
```bash
python3 -m venv scripts/popular-times/.venv
source scripts/popular-times/.venv/bin/activate
pip install -r scripts/popular-times/requirements.txt
```

## Fill in place IDs

Open `scripts/popular-times/place-ids.json` and replace each `REPLACE_WITH_PLACE_ID`. To find a place ID without a Google API key:

1. Open Google Maps, search the venue (e.g. "Tampines Regional Library").
2. Click the venue marker, then **Share -> Embed a map**.
3. In the embed URL, find `!1s` followed by an alphanumeric ID like `0x31da3d77a1aae34d:0xa3...`. That's the place ID. Copy it.

Service ID keys must match `id` fields in `public/data/services.json` (currently: `psc`, `hawker`, `community-centre`, `library`, `hdb`, `theatre`).

## Run the scrape

```
npm run scrape:popular-times
```

Or directly:
```
python scripts/popular-times/scrape.py
```

Output: `public/data/popular-times.json`. Commit the file.

## Gotchas

- If `populartimes` fails with HTML parse errors, Google likely changed their internal endpoint. Pin a newer commit in `requirements.txt` or check the lib's issue tracker.
- The lib does **not** need a Google API key for `get_populartimes_for_id` — only for the `get_id` variant.
- Some venues have no Popular Times data at all (Google hasn't collected enough). Those will appear with empty `weekday` arrays — the runtime mapper falls back to Perlin noise.
