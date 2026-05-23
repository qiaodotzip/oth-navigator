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
  | { id: string; type: "toilet"; rect: [Pt, Pt] };

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
