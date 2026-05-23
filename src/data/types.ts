export type FloorId = "L1" | "L2";
export type PolygonType = "room" | "corridor" | "landmark" | "void";
export type AccessibilityProfile = "default" | "stepFree";
export type Language = "en" | "zh";

export type Pt = [number, number];

export type Polygon = {
  id: string;
  points: Pt[];
  heightMeters: number;
  type: PolygonType;
  label?: { en: string; zh: string };
};

export type Facing = "N" | "S" | "E" | "W";

export type Detail =
  | { id: string; type: "stall-row"; rect: [Pt, Pt]; facing: Facing }
  | { id: string; type: "stall-island"; rect: [Pt, Pt] }
  | { id: string; type: "bench-rows"; rect: [Pt, Pt] }
  | { id: string; type: "round-table"; point: Pt }
  | { id: string; type: "toilet"; rect: [Pt, Pt] }
  | { id: string; type: "cleaning"; rect: [Pt, Pt] }
  | { id: string; type: "greenery-row"; rect: [Pt, Pt] }
  | { id: string; type: "landscape-island"; rect: [Pt, Pt] }
  | { id: string; type: "escalator-up"; rect: [Pt, Pt]; facing: Facing }
  | { id: string; type: "escalator-down"; rect: [Pt, Pt]; facing: Facing }
  | { id: string; type: "lift-block"; rect: [Pt, Pt]; facing: Facing }
  | { id: string; type: "staircase"; rect: [Pt, Pt]; facing: Facing }
  | { id: string; type: "stage"; rect: [Pt, Pt]; facing: Facing }
  | { id: string; type: "seating-block"; rect: [Pt, Pt]; facing: Facing }
  | { id: string; type: "barrier"; rect: [Pt, Pt] }
  | { id: string; type: "football"; rect: [Pt, Pt] }
  | { id: string; type: "court"; rect: [Pt, Pt] }
  | { id: string; type: "event-booth"; rect: [Pt, Pt] }
  | { id: string; type: "shop-block"; rect: [Pt, Pt] }
  | { id: string; type: "service-centre"; points: Pt[]; variant: "psc" | "family" };

export type Floor = {
  id: FloorId;
  bounds: { width: number; depth: number };
  polygons: Polygon[];
  details?: Detail[];
};

export type Service = {
  id: string;
  nameEn: string;
  nameZh: string;
  providerName: string;
  floorId: FloorId;
  roomId: string;
  counterIds?: string[];
  accessibility: {
    liftAccess: boolean;
    stepFreeRoute: boolean;
    notes?: string;
  };
  sourceUrl: string;
  iconKey: string;
};

export type Waypoint = {
  floorId: FloorId;
  point: [number, number];
  decisionPoint: boolean;
  segmentKey: string;
  /**
   * Wall-avoiding polyline (in floor metres) from the previous waypoint to
   * this one, populated by expandRoutes via A*. The blob walks along this.
   * Absent on the first step or for cross-floor (lift/escalator) hops.
   */
  pathFromPrev?: [number, number][];
};

export type RouteVariant = {
  serviceId: string;
  profile: AccessibilityProfile;
  counterId?: string;
  steps: Waypoint[];
};

export type CounterLoad = {
  counterId: string;
  load: number;
};

export type NarrationSegment = {
  key: string;
  en: string;
  zh: string;
};

export type NarrationResponse = {
  serviceId: string;
  segments: NarrationSegment[];
};

export type PopularTimesHour = { hour: number; busyness: number };

export type PopularTimesEntry = {
  serviceId: string;
  placeId: string;
  weekday: PopularTimesHour[][];
  currentPopularity?: number;
  /** true when the curve is heuristic (category-based), not scraped from Google. */
  estimated?: boolean;
};
