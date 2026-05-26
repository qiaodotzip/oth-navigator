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
  advanceRoute: () => void;
  endRoute: () => void;
  toggleInspectMode: () => void;
  toggleFirstPerson: () => void;
  toggleCameraFollow: () => void;
  toggleLabels: () => void;
  setUserLocation: (loc: UserLocation) => void;
  setPickingLocation: (v: boolean) => void;
  cycleTimeOfDay: () => void;
  setTileSize: (m: number) => void;
  toggleEffects: () => void;
};

const TILE_KEY = "oth-ground-tile-m";
const initialTile = (() => {
  if (typeof localStorage === "undefined") return 1.2;
  const v = parseFloat(localStorage.getItem(TILE_KEY) ?? "");
  return Number.isFinite(v) && v > 0 ? v : 1.2;
})();

export const useStore = create<State>(set => ({
  language: "en",
  profile: "default",
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
  startRoute: v =>
    set({ activeRoute: { variant: v, startedAt: Date.now(), currentWaypointIndex: 0 } }),
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
        ? { activeRoute: null, cameraFollow: false, inspectMode: true }
        : { activeRoute: null },
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
}));
