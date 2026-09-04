"""One-shot scrape of Google Popular Times for OTH services.

Reads scripts/popular-times/place-ids.json, calls populartimes for each ID
that isn't the placeholder, and writes public/data/popular-times.json.
"""

import json
import sys
from pathlib import Path

try:
    import populartimes
except ImportError:
    print("populartimes not installed. Run: pip install -r requirements.txt")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / "scripts" / "popular-times" / "place-ids.json"
OUTPUT = ROOT / "public" / "data" / "popular-times.json"
PLACEHOLDER = "REPLACE_WITH_PLACE_ID"


def normalise(raw: dict, service_id: str, place_id: str) -> dict:
    """Convert populartimes output to our PopularTimesEntry shape.

    populartimes returns:
      raw["populartimes"] = [
        {"name": "Monday", "data": [0..100 for 24 hours]},
        ... 7 days
      ]
    We need 7 arrays indexed by JS getDay() (0=Sun..6=Sat) with busyness in 0..1.
    """
    js_order = [None] * 7
    pt_to_js = {
        "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
        "Thursday": 4, "Friday": 5, "Saturday": 6,
    }
    for day in raw.get("populartimes", []):
        idx = pt_to_js.get(day.get("name"))
        if idx is None:
            continue
        data = day.get("data") or []
        js_order[idx] = [
            {"hour": h, "busyness": (data[h] or 0) / 100.0}
            for h in range(min(24, len(data)))
        ]
    current = raw.get("current_popularity")
    return {
        "serviceId": service_id,
        "placeId": place_id,
        "weekday": [d if d is not None else [] for d in js_order],
        "currentPopularity": (current / 100.0) if current is not None else None,
    }


def main() -> int:
    with open(INPUT, "r", encoding="utf-8") as fh:
        place_ids = json.load(fh)

    entries = []
    for service_id, place_id in place_ids.items():
        if service_id.startswith("_"):
            continue
        if place_id == PLACEHOLDER:
            print(f"[skip] {service_id}: place_id not set")
            continue
        print(f"[fetch] {service_id} ({place_id})")
        try:
            raw = populartimes.get_populartimes_for_id(place_id)
            entries.append(normalise(raw, service_id, place_id))
        except Exception as exc:
            print(f"[warn] {service_id}: {exc}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as fh:
        json.dump(entries, fh, indent=2)
    print(f"[done] wrote {len(entries)} entries to {OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
