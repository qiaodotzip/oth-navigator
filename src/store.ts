import { create } from "zustand";
import type { Plan } from "@/intent/types";
import type {
  AccessibilityProfile,
  EntranceMap,
  Floor,
  FloorId,
  Journey,
  Language,
  PopularTimesEntry,
  Pt,
  RouteVariant,
  Service,
} from "@/data/types";

type ActiveRoute = {
  variant: RouteVariant;
  startedAt: number;
  currentWaypointIndex: number;
};

export type UserLocation = { floorId: FloorId; point: Pt };
export type TimeOfDay = "morning" | "evening" | "night";

type State = {
  language: Language;
  profile: AccessibilityProfile;
  activeFloor: FloorId;
  floors: Floor[];
  services: Service[];
  routes: RouteVariant[];
  counterLoads: Record<string, number>;
  popularTimes: PopularTimesEntry[];
  journey: Journey | null;
  doneStops: string[];
  entrances: EntranceMap;
  activeRoute: ActiveRoute | null;
  /** When set, the active route is a static map PREVIEW (orbit view, no
   *  turn-by-turn / no voice) used by a demo, and the value names which demo so
   *  the panel shows the right switch: "crowd" → Morning/Evening (Time re-bends
   *  the lift choice); "access" → Step-free/Stairs (profile switches lift↔stairs).
   *  null = real navigation. */
  routePreview: "crowd" | "access" | null;
  activePlan: Plan | null;
  intentStatus: "idle" | "resolving" | "resolved";
  inspectMode: boolean;
  firstPerson: boolean;
  /** GPS-style: camera locks to a close, top-down view that follows the guide. */
  cameraFollow: boolean;
  showLabels: boolean;
  userLocation: UserLocation | null;
  pickingLocation: boolean;
  timeOfDay: TimeOfDay;
  tileSizeM: number;
  effectsEnabled: boolean;
  /** Spoken turn-by-turn guidance during navigation (ElevenLabs via JOM). */
  voiceOn: boolean;

  setLanguage: (l: Language) => void;
  setProfile: (p: AccessibilityProfile) => void;
  setActiveFloor: (f: FloorId) => void;
  setBundle: (data: { floors: Floor[]; services: Service[]; routes: RouteVariant[] }) => void;
  /** Merge extra services (e.g. resolved from the backend) into the catalog,
   *  skipping ids that already exist, so the router/timeline can find them. */
  addServices: (svcs: Service[]) => void;
  setLoad: (counterId: string, load: number) => void;
  setPopularTimes: (entries: PopularTimesEntry[]) => void;
  setJourney: (j: Journey | null) => void;
  markStopDone: (serviceId: string) => void;
  setPlan: (p: Plan | null) => void;
  setIntentStatus: (s: "idle" | "resolving" | "resolved") => void;
  resetIntent: () => void;
  resetJourneyProgress: () => void;
  setEntrances: (e: EntranceMap) => void;
  startRoute: (v: RouteVariant) => void;
  /** Draw a route on the map as a preview (orbit view), not as navigation.
   *  `kind` selects which in-panel switch the preview card shows. */
  previewRoute: (v: RouteVariant, kind?: "crowd" | "access") => void;
  advanceRoute: () => void;
  endRoute: () => void;
  toggleInspectMode: () => void;
  toggleFirstPerson: () => void;
  toggleCameraFollow: () => void;
  toggleLabels: () => void;
  setUserLocation: (loc: UserLocation) => void;
  setPickingLocation: (v: boolean) => void;
  cycleTimeOfDay: () => void;
  setTimeOfDay: (t: TimeOfDay) => void;
  setTileSize: (m: number) => void;
  toggleEffects: () => void;
  toggleVoice: () => void;
};

const TILE_KEY = "oth-ground-tile-m";
const initialTile = (() => {
  if (typeof localStorage === "undefined") return 1.2;
  const v = parseFloat(localStorage.getItem(TILE_KEY) ?? "");
  return Number.isFinite(v) && v > 0 ? v : 1.2;
})();

const VOICE_KEY = "oth-voice-on";
const initialVoiceOn = (() => {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(VOICE_KEY) !== "false"; // default ON
})();

export const useStore = create<State>(set => ({
  language: "en",
  profile: "stepFree",
  activeFloor: "L1",
  floors: [],
  services: [],
  routes: [],
  counterLoads: {},
  popularTimes: [],
  journey: null,
  doneStops: [],
  entrances: {},
  activeRoute: null,
  routePreview: null,
  activePlan: null,
  intentStatus: "idle",
  inspectMode: true,
  firstPerson: false,
  cameraFollow: false,
  showLabels: true,
  userLocation: null,
  pickingLocation: false,
  timeOfDay: "morning",
  tileSizeM: initialTile,
  effectsEnabled: true,
  voiceOn: initialVoiceOn,

  setLanguage: l => set({ language: l }),
  setProfile: p => set({ profile: p }),
  setActiveFloor: f => set({ activeFloor: f }),
  setBundle: ({ floors, services, routes }) => set({ floors, services, routes }),
  addServices: svcs =>
    set(s => {
      const have = new Set(s.services.map(x => x.id));
      const add = svcs.filter(x => !have.has(x.id));
      return add.length ? { services: [...s.services, ...add] } : {};
    }),
  setLoad: (counterId, load) =>
    set(s => ({ counterLoads: { ...s.counterLoads, [counterId]: load } })),
  setPopularTimes: entries => set({ popularTimes: entries }),
  setJourney: j => set({ journey: j, doneStops: [] }),
  setPlan: p => set({ activePlan: p }),
  setIntentStatus: s => set({ intentStatus: s }),
  resetIntent: () => set({ activePlan: null, intentStatus: "idle", journey: null }),
  markStopDone: serviceId =>
    set(s => (s.doneStops.includes(serviceId) ? {} : { doneStops: [...s.doneStops, serviceId] })),
  resetJourneyProgress: () => set({ doneStops: [] }),
  setEntrances: e => set({ entrances: e }),
  // Starting a route drops straight into GPS navigation (close follow cam) —
  // we're a wayfinding app, so the default on "go" is the turn-by-turn view, not
  // the orbit map. The "Follow me" toggle (shown while a route is active) is the
  // way back out to the map. inspectMode must be off or Scene mounts OrbitControls
  // instead of CameraRig; firstPerson off so the follow cam wins.
  startRoute: v =>
    set({
      activeRoute: { variant: v, startedAt: Date.now(), currentWaypointIndex: 0 },
      routePreview: null,
      cameraFollow: true,
      inspectMode: false,
      firstPerson: false,
    }),
  // Preview a route on the orbit/map view (whole path visible) instead of
  // dropping into GPS turn-by-turn. Used by the routing-logic demo: the route is
  // drawn, but there's nothing to walk or "arrive" at, so toggling Time simply
  // re-bends the visible path. Orbit view (inspectMode on, follow off) so the
  // full path — and the connector choice — is visible.
  previewRoute: (v, kind = "crowd") =>
    set({
      activeRoute: { variant: v, startedAt: Date.now(), currentWaypointIndex: 0 },
      routePreview: kind,
      cameraFollow: false,
      inspectMode: true,
      firstPerson: false,
    }),
  advanceRoute: () =>
    set(s => {
      if (!s.activeRoute) return {};
      const nextIdx = s.activeRoute.currentWaypointIndex + 1;
      const nextStep = s.activeRoute.variant.steps[nextIdx];
      const floorChange =
        nextStep && nextStep.floorId !== s.activeFloor
          ? { activeFloor: nextStep.floorId }
          : {};
      return {
        activeRoute: {
          ...s.activeRoute,
          currentWaypointIndex: nextIdx,
        },
        ...floorChange,
      };
    }),
  // Ending a route hands the camera back: GPS-follow has no target once routing
  // stops, and its toggle button is hidden without an active route — so leaving
  // it on would trap the user in a fixed view. Restore manual rotate/tilt.
  endRoute: () =>
    set(s =>
      s.cameraFollow
        ? { activeRoute: null, routePreview: null, cameraFollow: false, inspectMode: true }
        : { activeRoute: null, routePreview: null },
    ),
  // Manually touching rotate/tilt or walk mode exits GPS-follow, so the flag
  // never goes stale against the active camera.
  toggleInspectMode: () => set(s => ({ inspectMode: !s.inspectMode, cameraFollow: false })),
  toggleFirstPerson: () => set(s => ({ firstPerson: !s.firstPerson, cameraFollow: false })),
  // Enabling follow takes over the camera (no orbit, no walk); disabling hands
  // control back to manual rotate/tilt.
  toggleCameraFollow: () =>
    set(s =>
      s.cameraFollow
        ? { cameraFollow: false, inspectMode: true }
        : { cameraFollow: true, inspectMode: false, firstPerson: false },
    ),
  toggleLabels: () => set(s => ({ showLabels: !s.showLabels })),
  setUserLocation: loc => set({ userLocation: loc, activeFloor: loc.floorId }),
  setPickingLocation: v => set({ pickingLocation: v }),
  cycleTimeOfDay: () =>
    set(s => ({
      timeOfDay:
        s.timeOfDay === "morning"
          ? "evening"
          : s.timeOfDay === "evening"
          ? "night"
          : "morning",
    })),
  setTimeOfDay: t => set({ timeOfDay: t }),
  setTileSize: m => {
    const v = Math.max(0.3, Math.min(20, m));
    try {
      localStorage.setItem(TILE_KEY, String(v));
    } catch {
      /* ignore */
    }
    set({ tileSizeM: v });
  },
  toggleEffects: () => set(s => ({ effectsEnabled: !s.effectsEnabled })),
  toggleVoice: () =>
    set(s => {
      const voiceOn = !s.voiceOn;
      try {
        localStorage.setItem(VOICE_KEY, String(voiceOn));
      } catch {
        /* ignore */
      }
      return { voiceOn };
    }),
}));
