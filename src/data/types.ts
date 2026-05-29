export type FloorId = "L1" | "L2" | "L3";
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
  | { id: string; type: "staircase-down"; rect: [Pt, Pt]; facing: Facing }
  | { id: string; type: "stage"; rect: [Pt, Pt]; facing: Facing }
  | { id: string; type: "seating-block"; rect: [Pt, Pt]; facing: Facing }
  | { id: string; type: "stadium-seats"; rect: [Pt, Pt]; facing: Facing }
  | { id: string; type: "walkway-bridge"; rect: [Pt, Pt] }
  | { id: string; type: "barrier"; rect: [Pt, Pt] }
  | { id: string; type: "football"; rect: [Pt, Pt] }
  | { id: string; type: "court"; rect: [Pt, Pt] }
  | { id: string; type: "event-booth"; rect: [Pt, Pt] }
  | { id: string; type: "shop-block"; rect: [Pt, Pt] }
  | { id: string; type: "wall"; rect: [Pt, Pt] }
  | { id: string; type: "service-centre"; points: Pt[]; variant: "psc" | "family" }
  | { id: string; type: "library-entrance"; points: Pt[] }
  | { id: string; type: "library-decor"; points: Pt[] }
  | { id: string; type: "meeting-rooms"; points: Pt[] }
  | { id: string; type: "walkway"; points: Pt[] }
  | { id: string; type: "court-roof"; points: Pt[] }
  | { id: string; type: "garden-decor"; points: Pt[] }
  | { id: string; type: "hdb-office"; points: Pt[] }
  | { id: string; type: "theatre"; points: Pt[] };

export type Floor = {
  id: FloorId;
  bounds: { width: number; depth: number };
  polygons: Polygon[];
  details?: Detail[];
};

export type ServiceCategory =
  | "government"
  | "healthcare"
  | "community"
  | "retail"
  | "lifestyle";

export type Service = {
  id: string;
  nameEn: string;
  nameZh: string;
  providerName: string;
  category: ServiceCategory;
  /** true iff on a modeled floor (L1/L2) with a roomId that maps to a polygon */
  routable: boolean;
  /** real human floor label for display, e.g. "L1".."L8" */
  displayFloor: string;
  floorId?: FloorId;
  roomId?: string;
  /** Set when the service is inside OTH but on a floor we haven't modelled
   *  (e.g. L4/L5). Routing takes the user to a lift and hands off with a
   *  "ride to Level N — upper-floor navigation coming soon" message. */
  unmodelledLevel?: number;
  counterIds?: string[];
  accessibility: {
    liftAccess: boolean;
    stepFreeRoute: boolean;
    notes?: string;
  };
  sourceUrl: string;
  iconKey: string;
};

/** A routing target point for a place/service, keyed by id (see EntranceEditor). */
export type Entrance = { floorId: FloorId; point: Pt };
export type EntranceMap = Record<string, Entrance>;

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
  /** On a "lift-handoff" step: the unmodelled OTH level the user rides up to. */
  handoffLevel?: number;
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

/** Where a busyness curve came from. "live"=current BestTime reading,
 *  "forecast"=BestTime weekly forecast, "modeled"=our category heuristic. */
export type BusynessSource = "live" | "forecast" | "modeled";

export type PopularTimesEntry = {
  serviceId: string;
  /** BestTime venue_id or legacy Google place id; absent for modeled curves. */
  placeId?: string;
  placeName?: string;
  weekday: PopularTimesHour[][];
  currentPopularity?: number;
  source: BusynessSource;
};

export type JourneyStop = {
  serviceId: string;
  order: number;
  reason?: { en: string; zh: string };
};

export type Journey = {
  id: string;
  stops: JourneyStop[];
};
