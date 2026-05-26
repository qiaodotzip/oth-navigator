/**
 * Fetch real foot-traffic from BestTime.app for OTH counter services and
 * UPSERT into public/data/popular-times.json (which build-curves.ts seeds with
 * modeled curves). Real forecasts win for venues that resolve; every other
 * service keeps its modeled curve. Never throws per-venue — a failed venue is
 * logged and skipped, leaving its modeled fallback intact.
 *
 * Run: npm run build:popular-times:real   (after npm run build:popular-times)
 * Requires BESTTIME_API_KEY_PRIVATE in .env (BESTTIME_API_KEY_PUBLIC for live).
 *
 * Pass --debug to dump the first raw forecast response to
 * scripts/popular-times/.besttime-raw.json so you can verify the API shape
 * against besttime-normalize.ts before trusting it.
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeBestTimeForecast, type BestTimeForecast } from "./besttime-normalize";
import type { PopularTimesEntry } from "../../src/data/types";

const ROOT = process.cwd();
const VENUES = path.join(ROOT, "scripts", "popular-times", "venues.json");
const OUTPUT = path.join(ROOT, "public", "data", "popular-times.json");
const RAW_DUMP = path.join(ROOT, "scripts", "popular-times", ".besttime-raw.json");

const PRIVATE = process.env.BESTTIME_API_KEY_PRIVATE;
const PUBLIC = process.env.BESTTIME_API_KEY_PUBLIC;
const DEBUG = process.argv.includes("--debug");

type Venue = { name: string; address: string };

async function fetchForecast(v: Venue): Promise<BestTimeForecast | null> {
  const url = new URL("https://besttime.app/api/v1/forecasts");
  url.searchParams.set("api_key_private", PRIVATE!);
  url.searchParams.set("venue_name", v.name);
  url.searchParams.set("venue_address", v.address);
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    console.warn(`  [warn] forecast HTTP ${res.status} for "${v.name}"`);
    return null;
  }
  return (await res.json()) as BestTimeForecast;
}

async function fetchLive(venueId: string): Promise<number | null> {
  if (!PUBLIC) return null;
  const url = new URL("https://besttime.app/api/v1/forecasts/live");
  url.searchParams.set("api_key_public", PUBLIC);
  url.searchParams.set("venue_id", venueId);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    analysis?: { venue_live_busyness?: number; venue_forecasted_busyness?: number };
  };
  const live = data.analysis?.venue_live_busyness ?? data.analysis?.venue_forecasted_busyness;
  return typeof live === "number" ? Math.max(0, Math.min(1, live / 100)) : null;
}

async function main(): Promise<number> {
  if (!PRIVATE) {
    console.error("BESTTIME_API_KEY_PRIVATE not set. Copy .env.example -> .env and fill it in.");
    return 1;
  }
  const venues = JSON.parse(await fs.readFile(VENUES, "utf8")) as Record<string, Venue | string>;
  const existing = JSON.parse(await fs.readFile(OUTPUT, "utf8")) as PopularTimesEntry[];
  const byId = new Map(existing.map(e => [e.serviceId, e]));

  let dumped = false;
  let real = 0;
  for (const [serviceId, v] of Object.entries(venues)) {
    if (serviceId.startsWith("_") || typeof v === "string") continue;
    console.log(`[fetch] ${serviceId} — ${v.name}`);
    try {
      const raw = await fetchForecast(v);
      if (!raw) continue;
      if (DEBUG && !dumped) {
        await fs.writeFile(RAW_DUMP, JSON.stringify(raw, null, 2), "utf8");
        console.log(`  [debug] raw response written to ${RAW_DUMP}`);
        dumped = true;
      }
      const entry = normalizeBestTimeForecast(raw, serviceId);
      const venueId = entry.placeId;
      if (venueId) {
        const live = await fetchLive(venueId);
        if (live !== null) {
          entry.currentPopularity = live;
          entry.source = "live";
        }
      }
      byId.set(serviceId, entry);
      real++;
      console.log(`  [ok] ${serviceId}: source=${entry.source}`);
    } catch (err) {
      console.warn(`  [warn] ${serviceId}: ${(err as Error).message} — keeping modeled curve`);
    }
  }

  const merged = Array.from(byId.values());
  await fs.writeFile(OUTPUT, JSON.stringify(merged, null, 2), "utf8");
  console.log(`[done] ${real} real / ${merged.length} total entries -> ${OUTPUT}`);
  return 0;
}

main().then(code => process.exit(code)).catch(err => {
  console.error(err);
  process.exit(1);
});
