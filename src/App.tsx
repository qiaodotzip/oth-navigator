import { useState, useEffect, useCallback } from "react";
import { PhoneFrame } from "@/ui/PhoneFrame";
import { Scene } from "@/world/Scene";
import { FloorSelector } from "@/ui/FloorSelector";
import { TopBar } from "@/ui/TopBar";
import { PromptPanel } from "@/ui/PromptPanel";
import { useStore } from "@/store";
import { loadDataBundle } from "@/data/loaders";
import { prewarmAll } from "@/narration/prewarm";
import { selectRoute } from "@/routing/selectRoute";
import { fetchNarration } from "@/narration/client";
import { getCached, setCached } from "@/narration/cache";
import { enqueueSegments, cancelAll } from "@/narration/ttsQueue";
import { useSpeechRecognition } from "@/ui/useSpeechRecognition";
import type { NarrationSegment } from "@/data/types";
import { WaypointEditor } from "@/dev/WaypointEditor";
import { PolygonEditor } from "@/dev/PolygonEditor";
import { SuccessCard } from "@/ui/SuccessCard";

export default function App() {
  if (typeof window !== "undefined") {
    if (window.location.hash === "#waypoints") return <WaypointEditor />;
    if (window.location.hash === "#polygon-editor") return <PolygonEditor />;
  }

  const setBundle = useStore(s => s.setBundle);
  const services = useStore(s => s.services);
  const routes = useStore(s => s.routes);
  const profile = useStore(s => s.profile);
  const language = useStore(s => s.language);
  const counterLoads = useStore(s => s.counterLoads);
  const startRoute = useStore(s => s.startRoute);
  const setActiveFloor = useStore(s => s.setActiveFloor);
  const activeRoute = useStore(s => s.activeRoute);
  const endRoute = useStore(s => s.endRoute);

  const [narrationText, setNarrationText] = useState("");
  const [segments, setSegments] = useState<NarrationSegment[]>([]);

  const sr = useSpeechRecognition();

  useEffect(() => {
    loadDataBundle()
      .then(b => {
        setBundle(b);
        prewarmAll(b.services, b.routes);
      })
      .catch(e => console.warn("[App] loadDataBundle failed:", e));
  }, [setBundle]);

  const onPickService = useCallback(
    async (serviceId: string) => {
      const variant = selectRoute(serviceId, profile, counterLoads, routes);
      if (!variant) return;
      setActiveFloor(variant.steps[0].floorId);
      startRoute(variant);

      let narr = getCached(serviceId, profile);
      if (!narr) {
        const svc = services.find(s => s.id === serviceId);
        if (!svc) return;
        try {
          narr = await fetchNarration({
            query: svc.nameEn,
            profile,
            services: [svc],
            segmentKeys: variant.steps.map(s => s.segmentKey),
          });
          setCached(serviceId, profile, narr);
        } catch (e) {
          console.warn("[App] fetchNarration failed:", e);
          return;
        }
      }
      const fetched = narr;
      setSegments(fetched.segments);
      cancelAll();
      enqueueSegments(fetched.segments, language, key => {
        const seg = fetched.segments.find(s => s.key === key);
        if (seg) setNarrationText(language === "zh" ? seg.zh : seg.en);
      });
    },
    [profile, counterLoads, routes, services, language, startRoute, setActiveFloor],
  );

  useEffect(() => {
    if (!activeRoute) {
      setNarrationText("");
      cancelAll();
      setSegments([]);
    }
  }, [activeRoute]);

  useEffect(() => {
    const route = useStore.getState().activeRoute;
    if (!route || segments.length === 0) return;
    const remaining = segments.slice(route.currentWaypointIndex);
    cancelAll();
    enqueueSegments(remaining, language, key => {
      const seg = segments.find(s => s.key === key);
      if (seg) setNarrationText(language === "zh" ? seg.zh : seg.en);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const onVoiceTap = () => {
    if (sr.listening) sr.stop();
    else sr.start(language === "zh" ? "zh-CN" : "en-US");
  };

  useEffect(() => {
    if (!sr.transcript) return;
    const lower = sr.transcript.toLowerCase();
    const match = services.find(
      s =>
        lower.includes(s.nameEn.toLowerCase()) ||
        (s.nameZh.length > 0 && s.nameZh.split("").every(ch => sr.transcript.includes(ch))),
    );
    if (match) onPickService(match.id);
  }, [sr.transcript, services, onPickService]);

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <div className="h-[8%]">
          <TopBar onVoiceTap={onVoiceTap} />
        </div>
        <div className="h-[60%] relative">
          <Scene />
          <FloorSelector />
          <SuccessCard onDismiss={endRoute} />
        </div>
        <div className="h-[32%]">
          <PromptPanel narrationText={narrationText} onPickService={onPickService} />
        </div>
      </div>
    </PhoneFrame>
  );
}
