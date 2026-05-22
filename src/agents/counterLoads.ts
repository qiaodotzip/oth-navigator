// noisejs's @types declares `export = Noise` (CJS default), but the runtime
// (a UMD wrapper) attaches `Noise` as a named property on module.exports —
// which is what Vite resolves for `import { Noise } from "noisejs"`. The
// // @ts-expect-error below bridges the gap without flipping esModuleInterop.
// @ts-expect-error noisejs types misdeclare the CJS shape; runtime exports { Noise }
import { Noise } from "noisejs";
import { useEffect } from "react";
import { useStore } from "@/store";

const noise = new Noise(Math.random());

export function useCounterLoadSimulator() {
  const services = useStore(s => s.services);
  const setLoad = useStore(s => s.setLoad);
  useEffect(() => {
    if (!services.length) return;
    const counters = services.flatMap(s => s.counterIds ?? []);
    if (counters.length === 0) return;
    let raf = 0;
    const tick = (t: number) => {
      const seconds = t / 1000;
      counters.forEach((cid, i) => {
        const n = noise.perlin2(i * 0.13, seconds * 0.07) * 0.5 + 0.5;
        setLoad(cid, n);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [services, setLoad]);
}
