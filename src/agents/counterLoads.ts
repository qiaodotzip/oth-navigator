// noisejs's @types declares `export = Noise` (CJS default), but the runtime
// (a UMD wrapper) attaches `Noise` as a named property on module.exports —
// which is what Vite resolves for `import { Noise } from "noisejs"`. The
// // @ts-expect-error below bridges the gap without flipping esModuleInterop.
// @ts-expect-error noisejs types misdeclare the CJS shape; runtime exports { Noise }
import { Noise } from "noisejs";
import { useEffect } from "react";
import { useStore } from "@/store";
import { busynessNow } from "@/enrichment/popularTimes";

const noise = new Noise(Math.random());

export function useCounterLoadSimulator() {
  const services = useStore(s => s.services);
  const popularTimes = useStore(s => s.popularTimes);
  const setLoad = useStore(s => s.setLoad);
  useEffect(() => {
    if (!services.length) return;

    // Map each counter back to its owning service so we can look up that
    // service's real busyness curve.
    const counterToService = new Map<string, string>();
    services.forEach(s => (s.counterIds ?? []).forEach(cid => counterToService.set(cid, s.id)));
    const counters = Array.from(counterToService.keys());
    if (counters.length === 0) return;

    // Counter loads drift slowly; updating ~1.5x/sec (not every frame) avoids
    // churning the store 60x/sec and the re-renders that come with it.
    const tick = () => {
      const seconds = performance.now() / 1000;
      const now = new Date();
      counters.forEach((cid, i) => {
        const serviceId = counterToService.get(cid)!;
        const real = busynessNow(serviceId, popularTimes, now);
        if (real !== null) {
          const wobble = noise.perlin2(i * 0.13, seconds * 0.07) * 0.15;
          setLoad(cid, Math.max(0, Math.min(1, real + wobble)));
        } else {
          const n = noise.perlin2(i * 0.13, seconds * 0.07) * 0.5 + 0.5;
          setLoad(cid, n);
        }
      });
    };
    tick();
    const id = setInterval(tick, 650);
    return () => clearInterval(id);
  }, [services, popularTimes, setLoad]);
}
