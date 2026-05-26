import { useState, useEffect, useCallback } from "react";
import { resolveIntent, planToJourney } from "@/intent/resolveIntent";
import type { Plan, PlanStop } from "@/intent/types";
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
import type { NarrationSegment, PopularTimesEntry, Service } from "@/data/types";
import { SetLocationControl } from "@/ui/SetLocationControl";
import { JourneyTimeline } from "@/ui/JourneyTimeline";
import { WaypointEditor } from "@/dev/WaypointEditor";
import { PolygonEditor } from "@/dev/PolygonEditor";
import { EntranceEditor } from "@/dev/EntranceEditor";

import { DetailEditor } from "@/dev/DetailEditor";
import { Dashboard } from "@/dashboard/Dashboard";
import { ReportView } from "@/dashboard/ReportView";

const TTS_ENABLED = false;

/** Stops in a resolved plan (1 for destination/offsite/human, N for journey). */
function planStops(plan: Plan): PlanStop[] {
  return plan.kind === "journey" ? plan.stops : [plan.stop];
}

/** Backend stops aren't in the local catalog; synthesize Service records so the
 *  router, timeline and narration can look them up by id like any other. */
function stopToService(stop: PlanStop): Service {
  return {
    id: stop.serviceId,
    nameEn: stop.name.en,
    nameZh: stop.name.zh,
    providerName: "",
    category: "government",
    routable: !!(stop.floorId && stop.roomId),
    displayFloor: stop.floorId ?? "L1",
    floorId: stop.floorId,
    roomId: stop.roomId,
    accessibility: {
      liftAccess: stop.accessibility?.liftAccess ?? true,
      stepFreeRoute: stop.accessibility?.stepFree ?? true,
      notes: stop.accessibility?.notes,
    },
    sourceUrl: "",
    iconKey: "info",
  };
}

export default function App() {
  if (typeof window !== "undefined") {
    if (window.location.hash === "#waypoints") return <WaypointEditor />;
    if (window.location.hash === "#polygon-editor") return <PolygonEditor />;
    if (window.location.hash === "#detail-editor") return <DetailEditor />;
    if (window.location.hash === "#entrance-editor") return <EntranceEditor />;
    if (window.location.hash === "#dashboard") return <Dashboard />;
    if (window.location.hash === "#report") return <ReportView />;
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
      const loads = useStore.getState().counterLoads;
      const variant = buildRoute(start, svc, profile, floors, entrances, loads);
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

  const onSubmitIntent = useCallback(async (query: string, fromText = false) => {
    const st = useStore.getState();
    st.setIntentStatus("resolving");
    // Typed prompts go backend-first (ask the concierge); tile taps keep the
    // instant local path. Either way, graceful local fallback if backend fails.
    const plan = await resolveIntent(query, st.services, st.floors, undefined, undefined, fromText);
    // Register any backend stops in the catalog so onPickService / the timeline
    // can resolve them by id (their floor/room is already on the PlanStop).
    st.addServices(planStops(plan).map(stopToService));
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
    const url = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_OTH_APP_URL;
    if (url) window.open(url, "_blank", "noopener");
    else window.alert("Opening the OTH app… (set VITE_OTH_APP_URL to wire the real handoff)");
  }, []);

  const onAskAgain = useCallback(() => {
    useStore.getState().resetIntent();
  }, []);

  // DEMO: mimic a multi-stop journey arriving from the backend, so we can see
  // the journey Plan render without the real retrieval service running.
  const onReceiveJourney = useCallback(() => {
    const st = useStore.getState();
    // Intent: a senior's "health + errands" day. Ordered top-down to exercise
    // cross-floor routing: start (L1) → up to the clinic on L3 → down to HDB on
    // L2 → down to ServiceSG on L1.
    const demo: { id: string; reason: { en: string; zh: string } }[] = [
      {
        id: "family-medicine-clinic",
        reason: { en: "See the doctor for your health check", zh: "看医生做健康检查" },
      },
      {
        id: "hdb",
        reason: { en: "Settle your flat matter at the HDB branch", zh: "在建屋局分行处理组屋事务" },
      },
      {
        id: "servicesg",
        reason: { en: "Renew your documents on the way out", zh: "离开前更新您的证件" },
      },
    ];
    const stops = demo
      .map(d => {
        const svc = st.services.find(s => s.id === d.id);
        if (!svc) return null;
        return {
          serviceId: svc.id,
          name: { en: svc.nameEn, zh: svc.nameZh },
          floorId: svc.floorId,
          roomId: svc.roomId,
          reason: d.reason,
          accessibility: {
            liftAccess: svc.accessibility.liftAccess,
            stepFree: svc.accessibility.stepFreeRoute,
            notes: svc.accessibility.notes,
          },
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
    if (stops.length === 0) return;
    const plan: Plan = {
      kind: "journey",
      title: { en: "Your visit today: health & errands", zh: "今日行程：看诊与办事" },
      stops,
    };
    st.setIntentStatus("resolving");
    st.setPlan(plan);
    st.setIntentStatus("resolved");
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
        <div className="flex-shrink-0">
          <TopBar
            onSubmitIntent={onSubmitIntent}
            onVoiceTap={sr.supported ? onVoiceTap : undefined}
            voiceListening={sr.listening}
            voiceTranscript={sr.transcript}
          />
        </div>
        {/* Body: stacked on mobile (map above panel); side-by-side on tablet+
            (panel on the LEFT, map on the right) via flex-row-reverse. */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row-reverse">
          {/* Mobile heights are state-aware: the intent panel gets more room
              when browsing, the map takes over during navigation. Tablet (md+)
              ignores these — the panel is a fixed-width left sidebar. */}
          <div
            className={`relative min-h-0 md:h-full md:flex-1 ${
              activeRoute ? "h-[60%]" : "h-[58%]"
            }`}
          >
            <Scene onPickPlace={onPickService} />
            {journey && <JourneyTimeline onPick={onPickService} />}
            <FloorSelector />
            <SetLocationControl />
          </div>
          <div
            className={`min-h-0 md:h-full md:w-1/4 md:flex-none ${
              activeRoute ? "h-[40%]" : "h-[42%]"
            }`}
          >
            <PromptPanel
              narrationText={narrationText}
              onSubmitIntent={onSubmitIntent}
              onReceiveJourney={onReceiveJourney}
              onGuide={onGuide}
              onStartInApp={onStartInApp}
              onAskAgain={onAskAgain}
              onNext={onNext}
              onArrived={onArrived}
            />
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}
