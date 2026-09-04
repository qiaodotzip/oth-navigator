import { readFileSync } from "node:fs";
import path from "node:path";
import type { FloorId, Journey, Service, ServiceCategory } from "../src/data/types";

const CATALOG_PATH = path.resolve(process.cwd(), "public/data/services.json");

let cache: Service[] | null = null;
function loadCatalog(): Service[] {
  if (cache) return cache;
  cache = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as Service[];
  return cache;
}

export function getCatalog(filter?: {
  category?: ServiceCategory[];
  floor?: FloorId;
}): Service[] {
  let list = loadCatalog();
  if (filter?.category && filter.category.length > 0) {
    const set = new Set(filter.category);
    list = list.filter(s => set.has(s.category));
  }
  if (filter?.floor) {
    list = list.filter(s => s.floorId === filter.floor);
  }
  return list;
}

/** Hand-ordered demo journey, simulating a backend-supplied multi-stop chain. */
export const DEMO_JOURNEY: Journey = {
  id: "demo-1",
  stops: [
    {
      serviceId: "servicesg",
      order: 0,
      reason: { en: "Renew your documents", zh: "更新您的证件" },
    },
    {
      serviceId: "library",
      order: 1,
      reason: { en: "Pick up your reserved books", zh: "领取预订的书籍" },
    },
    {
      serviceId: "theatre",
      order: 2,
      reason: { en: "Collect your show tickets", zh: "领取演出门票" },
    },
  ],
};
