import { useEffect, useCallback, useRef } from "react";
import { resolveLocal, planToJourney, planFromJourneyStops } from "@/intent/resolveIntent";
import { fetchCurrentJourney, locationForServiceId, ROUTABLE_SERVICE_IDS } from "@/data/retrieval";
import type { Plan, PlanStop } from "@/intent/types";
import { PhoneFrame } from "@/ui/PhoneFrame";
import { Scene } from "@/world/Scene";
import { FloorSelector } from "@/ui/FloorSelector";
import { TopBar } from "@/ui/TopBar";
import { PromptPanel } from "@/ui/PromptPanel";
import { useStore } from "@/store";
import { loadDataBundle } from "@/data/loaders";
import { prewarmAll } from "@/narration/prewarm";
import { buildRoute, DEFAULT_START, routeArrivalLocation, serviceLocation } from "@/routing/buildRoute";
import { connectorCrowdPenalty } from "@/routing/crowdPenalty";
import { simDate } from "@/enrichment/simClock";
import { nextJourneyStopId } from "@/routing/journeyNav";
import { speak, stopSpeaking } from "@/narration/voice";
import { buildStepInstruction } from "@/ui/stepInstruction";
import type { PopularTimesEntry, Service, Pt, FloorId } from "@/data/types";
import { SetLocationControl } from "@/ui/SetLocationControl";
// import { JourneyTimeline } from "@/ui/JourneyTimeline"; // top pill hidden for screenshots
import { WaypointEditor } from "@/dev/WaypointEditor";
import { PolygonEditor } from "@/dev/PolygonEditor";
import { EntranceEditor } from "@/dev/EntranceEditor";

import { DetailEditor } from "@/dev/DetailEditor";
import { Dashboard } from "@/dashboard/Dashboard";
import { ReportView } from "@/dashboard/ReportView";

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
    routable: !!(stop.floorId && stop.roomId) || !!stop.unmodelledLevel,
    displayFloor: stop.unmodelledLevel ? `L${stop.unmodelledLevel}` : (stop.floorId ?? "L1"),
    floorId: stop.floorId,
    roomId: stop.roomId,
    unmodelledLevel: stop.unmodelledLevel,
    accessibility: {
      liftAccess: stop.accessibility?.liftAccess ?? true,
      stepFreeRoute: stop.accessibility?.stepFree ?? true,
      notes: stop.accessibility?.notes,
    },
    sourceUrl: "",
    iconKey: "info",
  };
}

/** A connector-crowd penalty bound to the current catalog + the toggled time. */
function currentConnectorPenalty(): (point: Pt, floorId: FloorId) => number {
  const st = useStore.getState();
  const now = simDate(st.timeOfDay);
  return (point, floorId) =>
    connectorCrowdPenalty(point, floorId, st.services, st.floors, st.popularTimes, now);
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
  // const journey = useStore(s => s.journey); // used by the hidden "Your trip" top pill
  const floors = useStore(s => s.floors);
  const voiceOn = useStore(s => s.voiceOn);
  const timeOfDay = useStore(s => s.timeOfDay);

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

  // Switching step-free ↔ stairs-OK mid-route should visibly re-route (the
  // toggle only changes cross-floor connectors, so single-floor routes won't
  // move — that's expected). Rebuild from the current leg's start so we don't
  // jump the user back to the building entrance.
  const prevProfile = useRef(profile);
  useEffect(() => {
    if (prevProfile.current === profile) return;
    prevProfile.current = profile;
    const st = useStore.getState();
    const route = st.activeRoute;
    if (!route) return;
    const svc = st.services.find(s => s.id === route.variant.serviceId);
    const start = route.variant.steps[0];
    if (!svc || !start) return;
    const rebuilt = buildRoute(
      { floorId: start.floorId, point: start.point },
      svc,
      profile,
      st.floors,
      st.entrances,
      st.counterLoads,
      currentConnectorPenalty(),
    );
    if (rebuilt) {
      st.setActiveFloor(rebuilt.steps[0].floorId);
      st.startRoute(rebuilt);
    }
  }, [profile]);

  // Toggling the Time control re-routes the active route from the current leg's
  // start, so the path visibly bends around the new crowd picture.
  const prevTime = useRef(timeOfDay);
  useEffect(() => {
    if (prevTime.current === timeOfDay) return;
    prevTime.current = timeOfDay;
    const st = useStore.getState();
    const route = st.activeRoute;
    if (!route) return;
    const svc = st.services.find(s => s.id === route.variant.serviceId);
    const start = route.variant.steps[0];
    if (!svc || !start) return;
    const rebuilt = buildRoute(
      { floorId: start.floorId, point: start.point },
      svc,
      st.profile,
      st.floors,
      st.entrances,
      st.counterLoads,
      currentConnectorPenalty(),
    );
    if (rebuilt) {
      st.setActiveFloor(rebuilt.steps[0].floorId);
      st.startRoute(rebuilt);
    }
  }, [timeOfDay]);

  const onPickService = useCallback(
    (serviceId: string) => {
      // Read fresh from the store: a service may have just been registered
      // (backend/poller/?dest handoff) in the same tick, before re-render.
      const svc = useStore.getState().services.find(s => s.id === serviceId);
      if (!svc) return;
      const start = useStore.getState().userLocation ?? DEFAULT_START;
      const floors = useStore.getState().floors;
      const entrances = useStore.getState().entrances;
      const loads = useStore.getState().counterLoads;
      const variant = buildRoute(start, svc, profile, floors, entrances, loads, currentConnectorPenalty());
      if (!variant) return;
      setActiveFloor(variant.steps[0].floorId);
      startRoute(variant);
    },
    [profile, services, startRoute, setActiveFloor],
  );

  // Quick-access tiles resolve LOCALLY only — tamp never sends queries; the
  // chatbot bar lives on the JOM side. Backend journeys arrive via the poller.
  const onSubmitIntent = useCallback((query: string) => {
    const st = useStore.getState();
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

  // Live ref so the poll effect (deps []) can auto-route via onGuide without
  // re-subscribing every time onGuide's identity changes.
  const onGuideRef = useRef(onGuide);
  onGuideRef.current = onGuide;
  // One-shot guard for the "Take me on the route" (?route=auto) hand-off.
  const autoRoutedRef = useRef(false);

  const onStartInApp = useCallback((_plan: Extract<Plan, { kind: "offsite" }>) => {
    const url = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_OTH_APP_URL;
    if (url) window.open(url, "_blank", "noopener");
    else window.alert("Opening the OTH app… (set VITE_OTH_APP_URL to wire the real handoff)");
  }, []);

  // Receiver: poll the journey the JOM chatbot published and render it. We never
  // send queries from here — the chatbot bar lives on the JOM side.
  //
  // The backend keeps the last journey stored forever (it only changes on a new
  // chat turn). If we tracked "seen" only in a ref it'd reset to -1 on every
  // remount — a page reload or a Vite HMR save in dev — and we'd re-apply the
  // same stale journey again. Persist the last-consumed version so each
  // published journey is delivered exactly once, even across reloads.
  const SEEN_JOURNEY_KEY = "tamp.lastJourneyVersion";
  const lastJourneyVersion = useRef(
    Number(window.localStorage.getItem(SEEN_JOURNEY_KEY) ?? -1),
  );
  const markJourneySeen = (version: number) => {
    lastJourneyVersion.current = version;
    window.localStorage.setItem(SEEN_JOURNEY_KEY, String(version));
  };
  useEffect(() => {
    // In face-to-face mode (opened with ?dest) we route to that single place;
    // the live whole-journey poll would override it, so skip polling then.
    if (new URLSearchParams(window.location.search).get("dest")) return;
    // "Take me on the route" from JOM opens us with ?route=auto — start
    // navigating the currently-published journey immediately (even if its
    // version was already seen), instead of just showing the plan card.
    const autoRoute = new URLSearchParams(window.location.search).get("route") === "auto";
    let alive = true;
    const tick = async () => {
      const st = useStore.getState();
      if (st.floors.length === 0) return;
      if (st.activeRoute) return; // already navigating — don't interrupt
      try {
        const { version, response } = await fetchCurrentJourney(st.floors);
        if (!alive) return;
        if (!response || response.stops.length === 0) {
          if (!autoRoute) markJourneySeen(version);
          return;
        }
        if (autoRoute) {
          if (autoRoutedRef.current) return; // one-shot
          autoRoutedRef.current = true;
          const plan = planFromJourneyStops(response);
          st.addServices(planStops(plan).map(stopToService));
          onGuideRef.current(plan); // start navigating the whole journey
          return;
        }
        if (version === lastJourneyVersion.current) return;
        markJourneySeen(version);
        const plan = planFromJourneyStops(response);
        st.addServices(planStops(plan).map(stopToService));
        st.setPlan(plan);
        st.setIntentStatus("resolved");
      } catch {
        /* backend not running / unreachable — keep polling quietly */
      }
    };
    void tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Face-to-face handoff: JOM opens us with ?dest=<{serviceId,name}>. Resolve
  // the service to a floor/room and route straight there (single destination).
  const handledDest = useRef(false);
  useEffect(() => {
    if (handledDest.current || floors.length === 0) return;
    const raw = new URLSearchParams(window.location.search).get("dest");
    if (!raw) return;
    handledDest.current = true;
    try {
      const { serviceId, name } = JSON.parse(decodeURIComponent(raw)) as {
        serviceId: string;
        name?: string;
      };
      if (!serviceId) return;
      if (!ROUTABLE_SERVICE_IDS.has(serviceId)) {
        const st = useStore.getState();
        st.setPlan({
          kind: "human",
          message: {
            en: `${name ?? "This service"} is online or handled at a counter — check the OTH Buddy chat for how to access it.`,
            zh: `${name ?? "此服务"}为线上或柜台办理 — 请在 OTH Buddy 聊天中查看办理方式。`,
          },
          stop: {
            serviceId,
            name: { en: name ?? serviceId, zh: name ?? serviceId },
          },
        });
        st.setIntentStatus("resolved");
        return;
      }
      const loc = locationForServiceId(serviceId, floors);
      const label = name ?? serviceId;
      const stop: PlanStop = {
        serviceId,
        name: { en: label, zh: label },
        floorId: loc.floorId,
        roomId: loc.roomId,
        unmodelledLevel: loc.unmodelledLevel,
      };
      const plan: Plan = { kind: "destination", answer: { en: label, zh: label }, stop };
      const st = useStore.getState();
      st.addServices([stopToService(stop)]);
      st.setPlan(plan);
      st.setIntentStatus("resolved");
      onGuide(plan); // auto-start the route to that place
    } catch {
      /* malformed ?dest — ignore */
    }
  }, [floors, onGuide]);

  const onAskAgain = useCallback(() => {
    useStore.getState().resetIntent();
  }, []);

  // DEMO: preset a crowd-sensitive single route so we can show the Time toggle
  // bending the path. Start on the leisure (hawker) side of L1, route up to the
  // HDB branch on L2. Presets the time to "morning" — the quiet baseline where
  // the route takes the direct central lift. The reveal is toggling Time to
  // "evening": the hawker centre fills up, the central lift gets a crowd penalty,
  // and the route visibly swings to the quieter east lift. Verified (Task 8)
  // against the real geometry with CROWD_RADIUS_M=16 / CROWD_WEIGHT_M=120.
  const onRoutingDemo = useCallback(() => {
    const st = useStore.getState();
    const anchorSvc = st.services.find(s => s.id === "hawker");
    const anchor = anchorSvc ? serviceLocation(anchorSvc, st.floors) : null;
    const start = anchor
      ? { floorId: anchor.floorId, point: anchor.point }
      : DEFAULT_START;
    st.setUserLocation(start);
    st.setTimeOfDay("morning");
    onPickService("hdb");
  }, [onPickService]);

  // Speak the current step's instruction (same line PromptPanel shows) whenever
  // the step or language changes. Voice routes through JOM's ElevenLabs TTS with
  // a browser-speech fallback. Silent when voice is off or no route is active.
  useEffect(() => {
    if (!activeRoute || !voiceOn) {
      stopSpeaking();
      return;
    }
    const st = useStore.getState();
    const instr = buildStepInstruction(
      activeRoute.variant,
      activeRoute.currentWaypointIndex,
      st.services,
      language,
    );
    // Speak just the headline + distance (e.g. "Walk to ComCare …, 58 meters").
    const meters = Math.round(instr.distanceM);
    const dist = meters > 0 ? (language === "zh" ? `，${meters}米` : `, ${meters} meters`) : "";
    void speak(`${instr.title}${dist}`);
  }, [activeRoute?.currentWaypointIndex, activeRoute?.variant.serviceId, voiceOn, language, activeRoute]);

  const onNext = useCallback(() => {
    stopSpeaking(); // silence the current line immediately on tap
    advanceRoute();
  }, [advanceRoute]);

  // Arrived at a stop: mark it done, then chain to the next journey stop (if any).
  const onArrived = useCallback(() => {
    stopSpeaking(); // silence the current line immediately on tap
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

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <div className="flex-shrink-0">
          <TopBar />
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
            {/* "Your trip" top pill — hidden for clean screenshots. Re-enable: */}
            {/* {journey && <JourneyTimeline onPick={onPickService} />} */}
            <FloorSelector />
            <SetLocationControl />
          </div>
          <div
            className={`min-h-0 md:h-full md:w-1/4 md:flex-none ${
              activeRoute ? "h-[40%]" : "h-[42%]"
            }`}
          >
            <PromptPanel
              onSubmitIntent={onSubmitIntent}
              onRoutingDemo={onRoutingDemo}
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
