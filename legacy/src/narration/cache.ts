import type { NarrationResponse } from "@/data/types";

const memCache = new Map<string, NarrationResponse>();

function keyFor(serviceId: string, profile: string) {
  return `${serviceId}::${profile}`;
}

export function getCached(serviceId: string, profile: string) {
  return memCache.get(keyFor(serviceId, profile)) ?? null;
}

export function setCached(serviceId: string, profile: string, value: NarrationResponse) {
  memCache.set(keyFor(serviceId, profile), value);
}
