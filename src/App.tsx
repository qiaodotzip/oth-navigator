import { useState, useEffect, useCallback } from "react";
import { resolveLocal, planToJourney } from "@/intent/resolveIntent";
import type { Plan } from "@/intent/types";
import { PhoneFrame } from "@/ui/PhoneFrame";
import { Scene } from "@/world/Scene";
import { FloorSelector } from "@/ui/FloorSelector";
import { TopBar } from "@/ui/TopBar";
import { PromptPanel } from "@/ui/PromptPanel";
import { useStore } from "@/store";
import { loadDataBundle } from "@/data/loaders";
import { prewarmAll } from "@/narration/prewarm";
import { buildRoute, DEFAULT_START, routeArrivalLocation } from "@/routing/buildRoute";
import { nextJourneyStopId } from "@/routing/journeyNav";
import { fetchNarration } from "@/narration/client";
import { getCached, setCached } from "@/narration/cache";
import { enqueueSegments, cancelAll } from "@/narration/ttsQueue";
import { useSpeechRecognition } from "@/ui/useSpeechRecognition";
import type { NarrationSegment, PopularTimesEntry } from "@/data/types";
import { SetLocationControl } from "@/ui/SetLocationControl";
import { JourneyTimeline } from "@/ui/JourneyTimeline";
import { WaypointEditor } from "@/dev/WaypointEditor";
import { PolygonEditor } from "@/dev/PolygonEditor";
import { EntranceEditor } from "@/dev/EntranceEditor";

const TTS_ENABLED = false;
import { DetailEditor } from "@/dev/DetailEditor";

export default function App() {
  if (typeof window !== "undefined") {
    if (window.location.hash === "#waypoints") return <WaypointEditor />;
    if (window.location.hash === "#polygon-editor") return <PolygonEditor />;
    if (window.location.hash === "#detail-editor") return <DetailEditor />;
    if (window.location.hash === "#entrance-editor") return <EntranceEditor />;
  }

  const setBundle = useStore(s => s.setBundle);
  const services = useStore(s => s.services);
  const profile = useStore(s => s.profile);
  const language = useStore(s => s.language);
  const startRoute = useStore(s => s.startRoute);
  const advanceRoute = useStore(s => s.advanceRoute);
  const setActiveFloor = useStore(s => s.setActiveFloor);
  const activeRoute = useStore(s => s.activeRoute);
  const journey = useStore(s => s.journey);

  const [narrationText, setNarrationText] = useState("");
  const [segments, setSegments] = useState<NarrationSegment[]>([]);

  const sr = useSpeechRecognition();

  useEffect(() => {
    loadDataBundle()
      .then(b => {
        setBundle(b);
        useStore.getState().setEntrances(b.entrances ?? {});
        // prewarmAll disabled to save OpenAI tokens — narration fetched on-demand
        // when a service tile is tapped (and cached for subsequent taps).
        void prewarmAll;
      })
      .catch(e => console.warn("[App] loadDataBundle failed:", e));
  }, [setBundle]);

  useEffect(() => {
    fetch("/data/popular-times.json")
      .then(r => r.json())
      .then((entries: PopularTimesEntry[]) => useStore.getState().setPopularTimes(entries))
      .catch(e => console.warn("[App] popular-times load failed:", e));
  }, []);

  const onPickService = useCallback(
    async (serviceId: string) => {
      const svc = services.find(s => s.id === serviceId);
      if (!svc) return;
      const start = useStore.getState().userLocation ?? DEFAULT_START;
      const floors = useStore.getState().floors;
      const entrances = useStore.getState().entrances;
      const variant = buildRoute(start, svc, profile, floors, entrances);
      if (!variant) return;
      setActiveFloor(variant.steps[0].floorId);
      startRoute(variant);

      let narr = getCached(serviceId, profile);
      if (!narr) {
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
      setSegments(narr.segments);
    },
    [profile, services, startRoute, setActiveFloor],
  );

  const onSubmitIntent = useCallback((query: string) => {
    const st = useStore.getState();
    st.setIntentStatus("resolving");
    // Phase 1: synchronous local resolve. (Phase 2 will await the backend.)
    const { plan } = resolveLocal(query, st.services);
    st.setPlan(plan);
    st.setIntentStatus("resolved");
  }, []);

  const onGuide = useCallback((plan: Plan) => {
    if (plan.kind === "destination" || plan.kind === "human") {
      onPickService(plan.stop.serviceId);
    } else if (plan.kind === "journey") {
      useStore.getState().setJourney(planToJourney(plan));
      onPickService(plan.stops[0].serviceId);
    }
  }, [onPickService]);

  const onStartInApp = useCallback((_plan: Extract<Plan, { kind: "offsite" }>) => {
    // Phase 1 stub — Phase 2 deep-links to the teammates' app.
    window.alert("Opening the OTH app… (handoff to be wired in Phase 2)");
  }, []);

  const onAskAgain = useCallback(() => {
    useStore.getState().resetIntent();
  }, []);

  // Play the segment for the current waypoint whenever the index changes
  useEffect(() => {
    if (!activeRoute || segments.length === 0) return;
    const step = activeRoute.variant.steps[activeRoute.currentWaypointIndex];
    if (!step) return;
    const seg = segments.find(s => s.key === step.segmentKey);
    if (!seg) {
      // Intermediate waypoint (auto-generated by A*) — show generic text, no TTS
      setNarrationText(language === "zh" ? "继续前行" : "Continue ahead");
      return;
    }
    const text = language === "zh" ? seg.zh : seg.en;
    setNarrationText(text);
    // TTS audio disabled for now — narration shows as text only.
    cancelAll();
    if (TTS_ENABLED) enqueueSegments([seg], language, () => {});
  }, [activeRoute?.currentWaypointIndex, segments, language, activeRoute]);

  // Cleanup when route ends
  useEffect(() => {
    if (!activeRoute) {
      setNarrationText("");
      cancelAll();
      setSegments([]);
    }
  }, [activeRoute]);

  const onNext = useCallback(() => {
    advanceRoute();
  }, [advanceRoute]);

  // Arrived at a stop: mark it done, then chain to the next journey stop (if any).
  const onArrived = useCallback(() => {
    const st = useStore.getState();
    const route = st.activeRoute;
    if (!route) return;
    const sid = route.variant.serviceId;
    st.markStopDone(sid);
    st.setUserLocation(routeArrivalLocation(route.variant));
    const journey = st.journey;
    if (journey) {
      const nextId = nextJourneyStopId(journey, sid);
      if (nextId) {
        onPickService(nextId);
        return;
      }
    }
    st.endRoute();
    st.resetIntent();
  }, [onPickService]);

  const onVoiceTap = () => {
    if (sr.listening) sr.stop();
    else sr.start(language === "zh" ? "zh-CN" : "en-US");
  };

  useEffect(() => {
    if (!sr.transcript) return;
    onSubmitIntent(sr.transcript);
  }, [sr.transcript, onSubmitIntent]);

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <div className="h-[8%]">
          <TopBar onVoiceTap={onVoiceTap} />
        </div>
        <div className="h-[60%] relative">
          <Scene />
          {journey && <JourneyTimeline onPick={onPickService} />}
          <FloorSelector />
          <SetLocationControl />
        </div>
        <div className="h-[32%]">
          <PromptPanel
            narrationText={narrationText}
            onSubmitIntent={onSubmitIntent}
            onGuide={onGuide}
            onStartInApp={onStartInApp}
            onAskAgain={onAskAgain}
            onNext={onNext}
            onArrived={onArrived}
            onVoiceTap={sr.supported ? onVoiceTap : undefined}
            voiceListening={sr.listening}
            voiceTranscript={sr.transcript}
          />
        </div>
      </div>
    </PhoneFrame>
  );
}
