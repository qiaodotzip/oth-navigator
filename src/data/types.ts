export type FloorId = "L1" | "L2";
export type PolygonType = "room" | "corridor" | "landmark" | "void";
export type AccessibilityProfile = "default" | "stepFree";
export type Language = "en" | "zh";

export type Polygon = {
  id: string;
  points: [number, number][];
  heightMeters: number;
  type: PolygonType;
  label?: { en: string; zh: string };
};

export type Floor = {
  id: FloorId;
  bounds: { width: number; depth: number };
  polygons: Polygon[];
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
