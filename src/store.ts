import { create } from "zustand";
import type {
  AccessibilityProfile,
  Floor,
  FloorId,
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

type State = {
  language: Language;
  profile: AccessibilityProfile;
  activeFloor: FloorId;
  floors: Floor[];
  services: Service[];
  routes: RouteVariant[];
  counterLoads: Record<string, number>;
  popularTimes: PopularTimesEntry[];
  activeRoute: ActiveRoute | null;
  inspectMode: boolean;
  showLabels: boolean;
  userLocation: UserLocation | null;
  pickingLocation: boolean;

  setLanguage: (l: Language) => void;
  setProfile: (p: AccessibilityProfile) => void;
  setActiveFloor: (f: FloorId) => void;
  setBundle: (data: { floors: Floor[]; services: Service[]; routes: RouteVariant[] }) => void;
  setLoad: (counterId: string, load: number) => void;
  setPopularTimes: (entries: PopularTimesEntry[]) => void;
  startRoute: (v: RouteVariant) => void;
  advanceRoute: () => void;
  endRoute: () => void;
  toggleInspectMode: () => void;
  toggleLabels: () => void;
  setUserLocation: (loc: UserLocation) => void;
  setPickingLocation: (v: boolean) => void;
};

export const useStore = create<State>(set => ({
  language: "en",
  profile: "default",
  activeFloor: "L1",
  floors: [],
  services: [],
  routes: [],
  counterLoads: {},
  popularTimes: [],
  activeRoute: null,
  inspectMode: true,
  showLabels: true,
  userLocation: null,
  pickingLocation: false,

  setLanguage: l => set({ language: l }),
  setProfile: p => set({ profile: p }),
  setActiveFloor: f => set({ activeFloor: f }),
  setBundle: ({ floors, services, routes }) => set({ floors, services, routes }),
  setLoad: (counterId, load) =>
    set(s => ({ counterLoads: { ...s.counterLoads, [counterId]: load } })),
  setPopularTimes: entries => set({ popularTimes: entries }),
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
  endRoute: () => set({ activeRoute: null }),
  toggleInspectMode: () => set(s => ({ inspectMode: !s.inspectMode })),
  toggleLabels: () => set(s => ({ showLabels: !s.showLabels })),
  setUserLocation: loc => set({ userLocation: loc, activeFloor: loc.floorId }),
  setPickingLocation: v => set({ pickingLocation: v }),
}));
