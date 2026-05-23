# Popular Times data for OTH services

The app shows per-service "busyness" by hour and uses it to pick the less-busy
counter (`src/routing/selectRoute.ts`). Two ways to produce the data file
`public/data/popular-times.json`:

## Primary: heuristic curves from real opening hours (free, reliable)

`build-curves.ts` reads `oth-services.csv` — **real, web-sourced** service
metadata (names, floors, opening hours, source URLs) — and expands a
category-based busyness profile into a 7-day × 24-hour curve per service,
**clamped to the real opening hours**.

```
npm run build:popular-times
```

What's real vs. estimated:

- ✅ **Real:** which services exist, their floors, and their opening hours
  (each row has a `sourceUrl`). Closed hours are 0 — that's real info.
- ⚠️ **Estimated:** the *shape* within opening hours (lunch/dinner peaks for
  food, evening peak for gym, etc.). Every entry is marked `"estimated": true`
  so the app and any reviewer know it's a category model, not scraped data.

This is the path currently used. It's free, has zero runtime dependencies, and
can't break on demo day. To tune a curve, edit the category profiles in
`build-curves.ts` or move a service to a different category in the CSV, then
re-run.

To add a service: add a row to `oth-services.csv` (serviceId must match an `id`
in `public/data/services.json` for it to affect that service's counters) and
re-run `npm run build:popular-times`.

## Optional: scrape real Google Popular Times (`scrape.py`)

If you later want the *actual* Google curve, `scrape.py` uses the `populartimes`
Python lib. Note: the lib is unmaintained (last release 2021) and Google has
changed its internal data shape since, so this may return empty or error. Treat
it as a stretch option, not the demo path.

```powershell
python -m venv scripts/popular-times/.venv
scripts/popular-times/.venv/Scripts/Activate.ps1
pip install -r scripts/popular-times/requirements.txt
# fill in scripts/popular-times/place-ids.json first
npm run scrape:popular-times
```

Place IDs (no Google API key needed): on Google Maps, search the venue, click
the marker, **Share → Embed a map**, and copy the `!1s...` segment from the
embed URL into `place-ids.json`.
