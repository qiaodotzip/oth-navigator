import { create } from "zustand";
import type {
  AccessibilityProfile,
  Floor,
  FloorId,
  Language,
  RouteVariant,
  Service,
} from "@/data/types";

type ActiveRoute = {
  variant: RouteVariant;
  startedAt: number;
  currentWaypointIndex: number;
};

type State = {
  language: Language;
  profile: AccessibilityProfile;
  activeFloor: FloorId;
  floors: Floor[];
  services: Service[];
  routes: RouteVariant[];
  counterLoads: Record<string, number>;
  activeRoute: ActiveRoute | null;
  inspectMode: boolean;
  showLabels: boolean;

  setLanguage: (l: Language) => void;
  setProfile: (p: AccessibilityProfile) => void;
  setActiveFloor: (f: FloorId) => void;
  setBundle: (data: { floors: Floor[]; services: Service[]; routes: RouteVariant[] }) => void;
  setLoad: (counterId: string, load: number) => void;
  startRoute: (v: RouteVariant) => void;
  advanceRoute: () => void;
  endRoute: () => void;
  toggleInspectMode: () => void;
  toggleLabels: () => void;
};

export const useStore = create<State>(set => ({
  language: "en",
  profile: "default",
  activeFloor: "L1",
  floors: [],
  services: [],
  routes: [],
  counterLoads: {},
  activeRoute: null,
  inspectMode: true,
  showLabels: true,

  setLanguage: l => set({ language: l }),
  setProfile: p => set({ profile: p }),
  setActiveFloor: f => set({ activeFloor: f }),
  setBundle: ({ floors, services, routes }) => set({ floors, services, routes }),
  setLoad: (counterId, load) =>
    set(s => ({ counterLoads: { ...s.counterLoads, [counterId]: load } })),
  startRoute: v =>
    set({ activeRoute: { variant: v, startedAt: Date.now(), currentWaypointIndex: 0 } }),
  advanceRoute: () =>
    set(s =>
      s.activeRoute
        ? {
            activeRoute: {
              ...s.activeRoute,
              currentWaypointIndex: s.activeRoute.currentWaypointIndex + 1,
            },
          }
        : {},
    ),
  endRoute: () => set({ activeRoute: null }),
  toggleInspectMode: () => set(s => ({ inspectMode: !s.inspectMode })),
  toggleLabels: () => set(s => ({ showLabels: !s.showLabels })),
}));
