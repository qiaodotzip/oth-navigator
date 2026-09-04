import { useState, useRef, useEffect, ChangeEvent, MouseEvent, WheelEvent } from "react";
import type { Detail, Facing, FloorId, Pt } from "@/data/types";

type Tool =
  | "select"
  | "stall-row"
  | "stall-island"
  | "bench-rows"
  | "round-table"
  | "toilet"
  | "cleaning"
  | "greenery-row"
  | "landscape-island"
  | "escalator-up"
  | "escalator-down"
  | "lift-block"
  | "staircase"
  | "staircase-down"
  | "walkway-bridge"
  | "stage"
  | "seating-block"
  | "stadium-seats"
  | "barrier"
  | "football"
  | "court"
  | "sport-hall"
  | "event-booth"
  | "shop-block"
  | "wall"
  | "psc"
  | "family-centre"
  | "library-entrance"
  | "library-decor"
  | "meeting-rooms"
  | "walkway"
  | "court-roof"
  | "garden-decor"
  | "hdb-office"
  | "theatre";

// Tools placed by clicking N points then closing the shape (not a rectangle).
const POLYGON_TOOLS = new Set<Tool>([
  "psc",
  "family-centre",
  "library-entrance",
  "library-decor",
  "meeting-rooms",
  "walkway",
  "court-roof",
  "garden-decor",
  "hdb-office",
  "theatre",
]);

const TOOL_CATEGORIES: { name: string; tools: Tool[] }[] = [
  { name: "Hawker", tools: ["stall-row", "stall-island", "bench-rows", "round-table", "cleaning"] },
  { name: "Standard", tools: ["landscape-island", "greenery-row", "toilet", "barrier", "wall"] },
  { name: "Circulation", tools: ["escalator-up", "escalator-down", "lift-block", "staircase", "staircase-down", "walkway-bridge", "walkway"] },
  { name: "Stage", tools: ["stage", "seating-block", "stadium-seats"] },
  { name: "Sports", tools: ["football", "court", "sport-hall"] },
  { name: "Retail", tools: ["event-booth", "shop-block"] },
  {
    name: "Civic (draw polygon)",
    tools: [
      "psc",
      "family-centre",
      "library-entrance",
      "library-decor",
      "meeting-rooms",
      "hdb-office",
      "theatre",
    ],
  },
  { name: "Outdoor (draw polygon)", tools: ["court-roof", "garden-decor"] },
];

const STORAGE_KEY = (fid: string) => `oth-detail-editor:${fid}`;
const POLY_STORAGE_KEY = (fid: string) => `oth-polygon-editor:${fid}`;

type Stored = {
  details: Detail[];
  widthM: number;
  depthM: number;
  imageDims: { w: number; h: number };
  savedAt: number;
};

type PolyStored = {
  polygons: Array<{ id: string; type: string; points: Pt[] }>;
  widthM?: number;
  depthM?: number;
  imageDims?: { w: number; h: number };
};

const TOOL_LABELS: Record<Tool, string> = {
  select: "Select",
  "stall-row": "Stall row",
  "stall-island": "Stall island",
  "bench-rows": "Bench rows",
  "round-table": "Round table",
  toilet: "Toilet",
  cleaning: "Cleaning block",
  "greenery-row": "Greenery row",
  "landscape-island": "Landscape island",
  "escalator-up": "Escalator ↑",
  "escalator-down": "Escalator ↓",
  "lift-block": "Lift block",
  staircase: "Staircase ↑",
  "staircase-down": "Staircase ↓",
  "walkway-bridge": "Walkway bridge (walkable)",
  stage: "Stage",
  "seating-block": "Seating block",
  "stadium-seats": "Stadium seats (blocks)",
  barrier: "Barrier (blocks routing)",
  football: "Football pitch (blocks)",
  court: "Sports court (blocks)",
  "sport-hall": "Sport hall (block)",
  "event-booth": "Event booth",
  "shop-block": "Shop block",
  wall: "Wall (blocks routing + agents)",
  psc: "Public Service Centre",
  "family-centre": "Family Centre",
  "library-entrance": "Library entrance",
  "library-decor": "Library decorations",
  "meeting-rooms": "Meeting rooms",
  "court-roof": "Court roof (draw polygon)",
  "garden-decor": "Garden decor (draw polygon)",
  "hdb-office": "HDB office",
  theatre: "Theatre",
  walkway: "Walkway (draw polygon)",
};

const TOOL_COLORS: Record<Exclude<Tool, "select">, string> = {
  "stall-row": "#D9534F",
  "stall-island": "#C9462A",
  "bench-rows": "#8C6A47",
  "round-table": "#D8B57C",
  toilet: "#5E81AC",
  cleaning: "#3A3D42",
  "greenery-row": "#4F7A3A",
  "landscape-island": "#6E8B4A",
  "escalator-up": "#4CAF50",
  "escalator-down": "#FF8A50",
  "lift-block": "#7E868F",
  staircase: "#B8BEC6",
  "staircase-down": "#8A95A3",
  "walkway-bridge": "#607D8B",
  stage: "#7E57C2",
  "seating-block": "#90A4AE",
  "stadium-seats": "#6D4C7D",
  barrier: "#B0202A",
  football: "#2E7D32",
  court: "#E07B39",
  "sport-hall": "#1E88E5",
  "event-booth": "#C2185B",
  "shop-block": "#5D4037",
  wall: "#6B7280",
  psc: "#0E7C7B",
  "family-centre": "#D96BA0",
  "library-entrance": "#3E7CB1",
  "library-decor": "#8E6E53",
  "meeting-rooms": "#5E81AC",
  "court-roof": "#9AA1A9",
  "garden-decor": "#5C8B47",
  "hdb-office": "#1C7C9C",
  theatre: "#8B2433",
  walkway: "#A1887F",
};

const FACING_ARROW: Record<Facing, [number, number]> = {
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
};

function nextFacing(f: Facing): Facing {
  return f === "N" ? "E" : f === "E" ? "S" : f === "S" ? "W" : "N";
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

// Classify an overlay polygon id as an UP vertical connector (goes to the floor
// above). Lifts/stairs are bidirectional (count as up); escalators only if they
// rise (exclude down-facing escalators). No B1 floor — building is L1–L3 only.
function polyConnectorUp(id: string): "lift" | "escalator" | "stair" | null {
  if (/elevator|lift/i.test(id)) return "lift";
  if (/escalator/i.test(id)) return /down/i.test(id) ? null : "escalator";
  if (/stair/i.test(id)) return "stair";
  return null;
}

// Up-connectors of a floor from its raw polygons + details (all in METRES).
function extractUpConnectors(
  polygons: { id: string; points: Pt[] }[],
  details: Detail[],
): { kind: string; point: Pt }[] {
  const out: { kind: string; point: Pt }[] = [];
  for (const p of polygons) {
    const k = polyConnectorUp(p.id);
    if (k && Array.isArray(p.points) && p.points.length) {
      out.push({
        kind: k,
        point: [
          p.points.reduce((a, [x]) => a + x, 0) / p.points.length,
          p.points.reduce((a, [, y]) => a + y, 0) / p.points.length,
        ],
      });
    }
  }
  for (const d of details) {
    let k: string | null = null;
    if (d.type === "lift-block") k = "lift";
    else if (d.type === "staircase") k = "stair";
    else if (d.type === "escalator-up") k = "escalator";
    if (!k || !("rect" in d)) continue;
    out.push({ kind: k, point: [(d.rect[0][0] + d.rect[1][0]) / 2, (d.rect[0][1] + d.rect[1][1]) / 2] });
  }
  return out;
}

// "Sport hall" is a composite block, not a single Detail type. Dragging the tool
// expands into a court + two stadium stands (facing in) wrapped by 4 walls. Each
// piece is defined as fractions [fx0,fy0,fx1,fy1] of the drawn rectangle, so the
// whole hall scales to fit whatever box you draw. Fractions come from a canonical
// 32×22 m layout (wall ≈ 0.4 m, court 28×14, 3 m stands on both long sides).
type HallPiece =
  | { type: "wall" | "court"; f: [number, number, number, number] }
  | { type: "stadium-seats"; f: [number, number, number, number]; facing: Facing };

const SPORT_HALL_TEMPLATE: HallPiece[] = [
  { type: "wall", f: [0, 0, 1, 0.0182] }, // top
  { type: "wall", f: [0, 0.9818, 1, 1] }, // bottom
  { type: "wall", f: [0, 0, 0.0125, 1] }, // left
  { type: "wall", f: [0.9875, 0, 1, 1] }, // right
  { type: "court", f: [0.0625, 0.1818, 0.9375, 0.8182] },
  { type: "stadium-seats", f: [0.0625, 0.0318, 0.9375, 0.1682], facing: "S" }, // top stand, faces court
  { type: "stadium-seats", f: [0.0625, 0.8318, 0.9375, 0.9682], facing: "N" }, // bottom stand, faces court
];

function makeSportHall(a: Pt, b: Pt): Detail[] {
  const minX = Math.min(a[0], b[0]);
  const minY = Math.min(a[1], b[1]);
  const w = Math.abs(b[0] - a[0]);
  const h = Math.abs(b[1] - a[1]);
  const at = (fx: number, fy: number): Pt => [minX + fx * w, minY + fy * h];
  return SPORT_HALL_TEMPLATE.map(p => {
    const rect: [Pt, Pt] = [at(p.f[0], p.f[1]), at(p.f[2], p.f[3])];
    if (p.type === "stadium-seats")
      return { id: uid(), type: "stadium-seats", rect, facing: p.facing };
    if (p.type === "court") return { id: uid(), type: "court", rect };
    return { id: uid(), type: "wall", rect };
  });
}

export function DetailEditor() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [floorId, setFloorId] = useState<FloorId>("L1");
  const [widthM, setWidthM] = useState(210);
  const [depthM, setDepthM] = useState(130);
  const [overlayMeters, setOverlayMeters] = useState<Array<{ id: string; points: Pt[] }>>([]);
  const [overlaySource, setOverlaySource] = useState<"json" | "localStorage" | "none">("none");
  const [details, setDetails] = useState<Detail[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [firstCorner, setFirstCorner] = useState<Pt | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Pt | null>(null);
  const [polyPoints, setPolyPoints] = useState<Pt[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showConnectors, setShowConnectors] = useState(false);
  // Up-connectors on the OTHER floor (metres) + that floor's bounds, loaded from
  // its files. Drawn as ghosts (normalised by the OTHER floor's bounds) so you
  // can align this floor's shafts to them even when the floors' depths differ.
  const [otherFloor, setOtherFloor] = useState<{
    widthM: number;
    depthM: number;
    conns: { kind: string; point: Pt }[];
  }>({ widthM: 210, depthM: 130, conns: [] });
  const [view, setView] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panStart = useRef<{ cx: number; cy: number; vx: number; vy: number } | null>(null);
  const dragMoved = useRef(false);
  const restoring = useRef(true);
  // Details pulled from the saved -details.json file (in METRES), waiting for the
  // image to load before we can convert them to editor pixel coords.
  const pendingFileDetails = useRef<{ details: Detail[]; widthM: number; depthM: number } | null>(null);

  // Convert pending file details (metres) → editor pixels once the image is loaded.
  const applyPendingDetails = () => {
    const p = pendingFileDetails.current;
    if (!p) return;
    if (imageDims.w <= 1 || imageDims.h <= 1) return; // wait for the image
    const sx = imageDims.w / p.widthM;
    const sy = imageDims.h / p.depthM;
    const conv = ([x, y]: Pt): Pt => [x * sx, y * sy];
    const loaded: Detail[] = p.details.map(d => {
      if (d.type === "round-table") return { ...d, id: d.id ?? uid(), point: conv(d.point) };
      if ("points" in d)
        return { ...d, id: d.id ?? uid(), points: d.points.map(conv) };
      return { ...d, id: d.id ?? uid(), rect: [conv(d.rect[0]), conv(d.rect[1])] as [Pt, Pt] };
    });
    setDetails(loaded);
    pendingFileDetails.current = null;
  };

  // Manually (re)load the saved details file, replacing the current working copy.
  const loadSavedDetailsFile = () => {
    fetch(`/data/floors/${floorId}-details.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(dj => {
        if (!dj || !Array.isArray(dj.details)) {
          alert(`No saved ${floorId}-details.json found.`);
          return;
        }
        pendingFileDetails.current = { details: dj.details, widthM, depthM };
        if (imageDims.w > 1 && imageDims.h > 1) {
          applyPendingDetails();
        } else {
          alert("Loaded saved details — load the floor image to see them.");
        }
      })
      .catch(() => alert("Failed to load saved details file."));
  };

  useEffect(() => {
    if (imageDims.w > 1 && imageDims.h > 1) {
      setView({ x: 0, y: 0, w: imageDims.w, h: imageDims.h });
      applyPendingDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDims]);

  // Load the OTHER floor's up-connectors (metres) so they can be ghosted on this
  // floor for vertical alignment (a shaft must sit at the same x,y on both floors).
  useEffect(() => {
    // Align against the adjacent floor: L1↔L2, and L3 against L2 below it.
    const other: FloorId = floorId === "L2" ? "L1" : "L2";
    let cancelled = false;
    Promise.all([
      fetch(`/data/floors/${other}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/data/floors/${other}-details.json`).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([fl, det]) => {
      if (cancelled) return;
      const polys = (fl?.polygons ?? []).filter((p: { points?: Pt[] }) => Array.isArray(p?.points));
      const dets = (det?.details ?? []) as Detail[];
      setOtherFloor({
        widthM: typeof fl?.bounds?.width === "number" ? fl.bounds.width : widthM,
        depthM: typeof fl?.bounds?.depth === "number" ? fl.bounds.depth : depthM,
        conns: extractUpConnectors(polys, dets),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [floorId]);

  useEffect(() => {
    restoring.current = true;
    let cancelled = false;
    pendingFileDetails.current = null;
    let hasLocalDetails = false;
    try {
      const probe = localStorage.getItem(STORAGE_KEY(floorId));
      if (probe) {
        const pd = JSON.parse(probe) as Stored;
        hasLocalDetails = Array.isArray(pd.details) && pd.details.length > 0;
      }
    } catch {
      hasLocalDetails = false;
    }
    fetch(`/data/floors/${floorId}.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        let boundsW = widthM;
        let boundsD = depthM;
        if (typeof data?.bounds?.width === "number") boundsW = data.bounds.width;
        if (typeof data?.bounds?.depth === "number") boundsD = data.bounds.depth;
        // When there's no local working copy, load the saved details file so the
        // editor shows your previously-authored layers (converted once image loads).
        if (!hasLocalDetails) {
          fetch(`/data/floors/${floorId}-details.json`)
            .then(r => (r.ok ? r.json() : null))
            .then(dj => {
              if (cancelled || !dj || !Array.isArray(dj.details) || dj.details.length === 0) return;
              pendingFileDetails.current = { details: dj.details, widthM: boundsW, depthM: boundsD };
              applyPendingDetails();
            })
            .catch(() => {});
        }
        if (data && Array.isArray(data.polygons)) {
          setOverlayMeters(
            data.polygons
              .filter((p: { id?: string; points?: Pt[] }) => Array.isArray(p?.points))
              .map((p: { id: string; points: Pt[] }) => ({ id: p.id, points: p.points })),
          );
          setOverlaySource("json");
          if (typeof data.bounds?.width === "number") setWidthM(data.bounds.width);
          if (typeof data.bounds?.depth === "number") setDepthM(data.bounds.depth);
          return;
        }
        // Fall back to polygon-editor localStorage (in pixels — convert to meters)
        const polyRaw = localStorage.getItem(POLY_STORAGE_KEY(floorId));
        if (polyRaw) {
          try {
            const pdata = JSON.parse(polyRaw) as PolyStored;
            const w = typeof pdata.widthM === "number" ? pdata.widthM : widthM;
            const d = typeof pdata.depthM === "number" ? pdata.depthM : depthM;
            const idim = pdata.imageDims && pdata.imageDims.w > 1 ? pdata.imageDims : imageDims;
            const sx = w / idim.w;
            const sy = d / idim.h;
            setOverlayMeters(
              (pdata.polygons || []).map(p => ({
                id: p.id,
                points: p.points.map(([x, y]) => [x * sx, y * sy] as Pt),
              })),
            );
            setOverlaySource("localStorage");
            if (typeof pdata.widthM === "number") setWidthM(pdata.widthM);
            if (typeof pdata.depthM === "number") setDepthM(pdata.depthM);
          } catch (e) {
            console.warn("[DetailEditor] polygon overlay load failed:", e);
            setOverlayMeters([]);
            setOverlaySource("none");
          }
        } else {
          setOverlayMeters([]);
          setOverlaySource("none");
        }
      })
      .catch(e => {
        if (!cancelled) {
          console.warn("[DetailEditor] floor JSON fetch failed:", e);
          setOverlayMeters([]);
          setOverlaySource("none");
        }
      });
    const raw = localStorage.getItem(STORAGE_KEY(floorId));
    if (raw) {
      try {
        const data = JSON.parse(raw) as Stored;
        setDetails(data.details || []);
        setSavedAt(data.savedAt || null);
      } catch {
        setDetails([]);
        setSavedAt(null);
      }
    } else {
      setDetails([]);
      setSavedAt(null);
    }
    setFirstCorner(null);
    setHoverPoint(null);
    setPolyPoints([]);
    setSelectedId(null);
    Promise.resolve().then(() => {
      restoring.current = false;
    });
    return () => {
      cancelled = true;
    };
  }, [floorId]);

  useEffect(() => {
    if (restoring.current) return;
    const data: Stored = {
      details,
      widthM,
      depthM,
      imageDims,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(STORAGE_KEY(floorId), JSON.stringify(data));
      setSavedAt(data.savedAt);
    } catch (e) {
      console.warn("[DetailEditor] autosave failed:", e);
    }
  }, [details, widthM, depthM, imageDims, floorId]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.includes("3rd") || lower.includes("level3") || lower.includes("l3")) {
      setFloorId("L3");
    } else if (lower.includes("2nd") || lower.includes("level2") || lower.includes("l2")) {
      setFloorId("L2");
    } else if (lower.includes("1st") || lower.includes("level1") || lower.includes("l1")) {
      setFloorId("L1");
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    const img = new Image();
    img.onload = () => setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  };

  function screenToSvg(clientX: number, clientY: number): Pt | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const tx = pt.matrixTransform(ctm.inverse());
    return [tx.x, tx.y];
  }

  const onSvgMouseDown = (e: MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      panStart.current = { cx: e.clientX, cy: e.clientY, vx: view.x, vy: view.y };
      dragMoved.current = false;
    }
  };

  const onSvgMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    if (panStart.current) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const sx = view.w / rect.width;
      const sy = view.h / rect.height;
      const dx = (e.clientX - panStart.current.cx) * sx;
      const dy = (e.clientY - panStart.current.cy) * sy;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragMoved.current = true;
      setView(v => ({ ...v, x: panStart.current!.vx - dx, y: panStart.current!.vy - dy }));
      return;
    }
    if (firstCorner) {
      const pt = screenToSvg(e.clientX, e.clientY);
      if (pt) setHoverPoint(pt);
    }
  };

  const onSvgMouseUp = () => {
    panStart.current = null;
  };

  const onSvgClick = (e: MouseEvent<SVGSVGElement>) => {
    if (e.shiftKey || dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    if (tool === "select") return;
    const pt = screenToSvg(e.clientX, e.clientY);
    if (!pt) return;
    if (pt[0] < 0 || pt[1] < 0 || pt[0] > imageDims.w || pt[1] > imageDims.h) return;

    if (tool === "round-table") {
      setDetails(prev => [...prev, { id: uid(), type: "round-table", point: pt }]);
      return;
    }

    if (POLYGON_TOOLS.has(tool)) {
      setPolyPoints(prev => [...prev, pt]);
      return;
    }

    if (!firstCorner) {
      setFirstCorner(pt);
      setHoverPoint(pt);
    } else {
      const r: [Pt, Pt] = [firstCorner, pt];
      if (tool === "sport-hall") {
        setDetails(prev => [...prev, ...makeSportHall(firstCorner, pt)]);
        setFirstCorner(null);
        setHoverPoint(null);
        return;
      }
      const id = uid();
      let newDetail: Detail;
      switch (tool) {
        case "stall-row":
          newDetail = { id, type: "stall-row", rect: r, facing: "S" };
          break;
        case "stall-island":
          newDetail = { id, type: "stall-island", rect: r };
          break;
        case "toilet":
          newDetail = { id, type: "toilet", rect: r };
          break;
        case "cleaning":
          newDetail = { id, type: "cleaning", rect: r };
          break;
        case "greenery-row":
          newDetail = { id, type: "greenery-row", rect: r };
          break;
        case "landscape-island":
          newDetail = { id, type: "landscape-island", rect: r };
          break;
        case "escalator-up":
          newDetail = { id, type: "escalator-up", rect: r, facing: "S" };
          break;
        case "escalator-down":
          newDetail = { id, type: "escalator-down", rect: r, facing: "S" };
          break;
        case "lift-block":
          newDetail = { id, type: "lift-block", rect: r, facing: "S" };
          break;
        case "staircase":
          newDetail = { id, type: "staircase", rect: r, facing: "S" };
          break;
        case "staircase-down":
          newDetail = { id, type: "staircase-down", rect: r, facing: "S" };
          break;
        case "walkway-bridge":
          newDetail = { id, type: "walkway-bridge", rect: r };
          break;
        case "stage":
          newDetail = { id, type: "stage", rect: r, facing: "S" };
          break;
        case "seating-block":
          newDetail = { id, type: "seating-block", rect: r, facing: "S" };
          break;
        case "stadium-seats":
          newDetail = { id, type: "stadium-seats", rect: r, facing: "S" };
          break;
        case "barrier":
          newDetail = { id, type: "barrier", rect: r };
          break;
        case "football":
          newDetail = { id, type: "football", rect: r };
          break;
        case "court":
          newDetail = { id, type: "court", rect: r };
          break;
        case "event-booth":
          newDetail = { id, type: "event-booth", rect: r };
          break;
        case "shop-block":
          newDetail = { id, type: "shop-block", rect: r };
          break;
        case "wall":
          newDetail = { id, type: "wall", rect: r };
          break;
        default:
          newDetail = { id, type: "bench-rows", rect: r };
      }
      setDetails(prev => [...prev, newDetail]);
      setFirstCorner(null);
      setHoverPoint(null);
    }
  };

  const onSvgWheel = (e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const pt = screenToSvg(e.clientX, e.clientY);
    if (!pt) return;
    const factor = e.deltaY < 0 ? 0.85 : 1.18;
    setView(v => ({
      x: pt[0] - (pt[0] - v.x) * factor,
      y: pt[1] - (pt[1] - v.y) * factor,
      w: v.w * factor,
      h: v.h * factor,
    }));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFirstCorner(null);
        setHoverPoint(null);
        setPolyPoints([]);
        setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const resetView = () => setView({ x: 0, y: 0, w: imageDims.w, h: imageDims.h });

  const cancelCurrent = () => {
    setFirstCorner(null);
    setHoverPoint(null);
    setPolyPoints([]);
  };

  const closePolyShape = () => {
    if (polyPoints.length < 3) return;
    if (tool === "library-entrance") {
      setDetails(prev => [
        ...prev,
        { id: uid(), type: "library-entrance", points: polyPoints },
      ]);
      setPolyPoints([]);
      return;
    }
    if (tool === "walkway") {
      setDetails(prev => [...prev, { id: uid(), type: "walkway", points: polyPoints }]);
      setPolyPoints([]);
      return;
    }
    if (tool === "library-decor") {
      setDetails(prev => [...prev, { id: uid(), type: "library-decor", points: polyPoints }]);
      setPolyPoints([]);
      return;
    }
    if (tool === "meeting-rooms") {
      setDetails(prev => [...prev, { id: uid(), type: "meeting-rooms", points: polyPoints }]);
      setPolyPoints([]);
      return;
    }
    if (tool === "court-roof") {
      setDetails(prev => [...prev, { id: uid(), type: "court-roof", points: polyPoints }]);
      setPolyPoints([]);
      return;
    }
    if (tool === "garden-decor") {
      setDetails(prev => [...prev, { id: uid(), type: "garden-decor", points: polyPoints }]);
      setPolyPoints([]);
      return;
    }
    if (tool === "hdb-office") {
      setDetails(prev => [...prev, { id: uid(), type: "hdb-office", points: polyPoints }]);
      setPolyPoints([]);
      return;
    }
    if (tool === "theatre") {
      setDetails(prev => [...prev, { id: uid(), type: "theatre", points: polyPoints }]);
      setPolyPoints([]);
      return;
    }
    const variant = tool === "family-centre" ? "family" : "psc";
    setDetails(prev => [
      ...prev,
      { id: uid(), type: "service-centre", points: polyPoints, variant },
    ]);
    setPolyPoints([]);
  };

  const deleteDetail = (id: string) => {
    setDetails(prev => prev.filter(d => d.id !== id));
    setSelectedId(cur => (cur === id ? null : cur));
  };

  const rotateFacing = (id: string) =>
    setDetails(prev =>
      prev.map(d =>
        d.id === id && "facing" in d ? { ...d, facing: nextFacing(d.facing) } : d,
      ),
    );

  // Rotate a rect detail 90° about its center (swaps width/height). Escalators
  // and stairs derive their orientation from the rect's long axis, so this turns
  // them a true 90°. Only the selected detail changes.
  const rotateRect90 = (id: string) =>
    setDetails(prev =>
      prev.map(d => {
        if (d.id !== id || !("rect" in d)) return d;
        const [a, b] = d.rect;
        const cx = (a[0] + b[0]) / 2;
        const cy = (a[1] + b[1]) / 2;
        const hw = Math.abs(b[0] - a[0]) / 2;
        const hh = Math.abs(b[1] - a[1]) / 2;
        const rect: [Pt, Pt] = [
          [cx - hh, cy - hw],
          [cx + hh, cy + hw],
        ];
        return { ...d, rect };
      }),
    );

  const clearAll = () => {
    if (!window.confirm("Delete all details AND clear autosave for this floor?")) return;
    setDetails([]);
    localStorage.removeItem(STORAGE_KEY(floorId));
    setSavedAt(null);
  };

  const buildDetailsData = () => {
    const sx = widthM / imageDims.w;
    const sy = depthM / imageDims.h;
    const r = (n: number) => Math.round(n * 100) / 100;
    const conv = ([x, y]: Pt): Pt => [r(x * sx), r(y * sy)];
    const exported = details.map(d => {
      if (d.type === "round-table") return { ...d, point: conv(d.point) };
      if ("points" in d)
        return { ...d, points: d.points.map(conv) };
      return { ...d, rect: [conv(d.rect[0]), conv(d.rect[1])] as [Pt, Pt] };
    });
    return { id: floorId, details: exported };
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(buildDetailsData(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${floorId}-details.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateSaved = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/save-floor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ floorId, kind: "details", data: buildDetailsData() }),
      });
      const text = await res.text();
      if (!res.ok) {
        setSaveMsg(
          res.status === 404
            ? "✗ Endpoint missing — restart the server (npm run dev:full)"
            : `✗ ${res.status}: ${text.slice(0, 80)}`,
        );
        return;
      }
      const j = JSON.parse(text);
      setSaveMsg(`✓ Saved ${j.file}`);
    } catch (e) {
      setSaveMsg(`✗ ${e instanceof Error ? e.message : "save failed"} (is the server running?)`);
    } finally {
      setSaving(false);
    }
  };

  const importJson = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(text => {
      try {
        const data = JSON.parse(text);
        const fileWidth: number =
          typeof data.bounds?.width === "number" ? data.bounds.width : widthM;
        const fileDepth: number =
          typeof data.bounds?.depth === "number" ? data.bounds.depth : depthM;
        if (typeof data.bounds?.width === "number") setWidthM(data.bounds.width);
        if (typeof data.bounds?.depth === "number") setDepthM(data.bounds.depth);

        const sx = imageDims.w / fileWidth;
        const sy = imageDims.h / fileDepth;
        const convToPixels = ([x, y]: Pt): Pt => [x * sx, y * sy];

        let didSomething = false;

        if (Array.isArray(data.polygons)) {
          // File polygons are in meters; store overlay in meters
          const polys = data.polygons
            .filter((p: { id?: string; points?: Pt[] }) => Array.isArray(p?.points))
            .map((p: { id: string; points: Pt[] }) => ({
              id: p.id,
              points: p.points as Pt[],
            }));
          setOverlayMeters(polys);
          setOverlaySource("json");
          didSomething = true;
        }

        if (Array.isArray(data.details)) {
          const loaded: Detail[] = data.details.map((d: Detail) => {
            if (d.type === "round-table") {
              return { ...d, id: d.id ?? uid(), point: convToPixels(d.point) };
            }
            if ("points" in d) {
              return { ...d, id: d.id ?? uid(), points: d.points.map(convToPixels) };
            }
            return {
              ...d,
              id: d.id ?? uid(),
              rect: [convToPixels(d.rect[0]), convToPixels(d.rect[1])] as [Pt, Pt],
            };
          });
          setDetails(loaded);
          didSomething = true;
        }

        if (!didSomething) {
          alert(
            "No polygons or details found in this JSON. Expected either a floor file (with polygons) or a -details.json file.",
          );
        } else if (!Array.isArray(data.details) && Array.isArray(data.polygons)) {
          alert(
            `Refreshed ${data.polygons.length} polygon outline${data.polygons.length === 1 ? "" : "s"} from this floor JSON. No details in the file — keep authoring details and export when ready.`,
          );
        }
      } catch (err) {
        alert("Failed to parse JSON: " + (err instanceof Error ? err.message : String(err)));
      }
    });
  };

  const strokeBase = Math.max(1.5, view.w / 600);
  const fontBase = Math.max(8, view.w / 100);
  const zoomPct = imageDims.w > 1 ? Math.round((imageDims.w / view.w) * 100) : 100;

  // Up-going connectors (lift/escalator/stair → next floor) on the current floor,
  // in image pixels. Pulled from overlay polygons AND details. Shared by the
  // toggle's count and the on-map markers.
  const connectorHighlights: { kind: string; cx: number; cy: number }[] = (() => {
    const scx = imageDims.w / widthM;
    const scy = imageDims.h / depthM;
    const out: { kind: string; cx: number; cy: number }[] = [];
    for (const p of overlayMeters) {
      const kind = polyConnectorUp(p.id);
      if (!kind) continue;
      out.push({
        kind,
        cx: (p.points.reduce((a, [x]) => a + x, 0) / p.points.length) * scx,
        cy: (p.points.reduce((a, [, y]) => a + y, 0) / p.points.length) * scy,
      });
    }
    for (const d of details) {
      let kind: string | null = null;
      if (d.type === "lift-block") kind = "lift";
      else if (d.type === "staircase") kind = "stair";
      else if (d.type === "escalator-up") kind = "escalator";
      if (!kind || !("rect" in d)) continue;
      out.push({ kind, cx: (d.rect[0][0] + d.rect[1][0]) / 2, cy: (d.rect[0][1] + d.rect[1][1]) / 2 });
    }
    return out;
  })();
  const cursorClass =
    tool === "select" ? "cursor-default" : tool === "round-table" ? "cursor-crosshair" : "cursor-crosshair";

  return (
    <div className="grid grid-cols-[2fr_1fr] h-screen bg-neutral-100">
      <div className="relative bg-neutral-200 overflow-hidden">
        {imageUrl ? (
          <>
            <svg
              ref={svgRef}
              viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
              className={`absolute inset-0 w-full h-full ${cursorClass}`}
              onMouseDown={onSvgMouseDown}
              onMouseMove={onSvgMouseMove}
              onMouseUp={onSvgMouseUp}
              onMouseLeave={onSvgMouseUp}
              onClick={onSvgClick}
              onWheel={onSvgWheel}
              preserveAspectRatio="xMidYMid meet"
            >
              <image href={imageUrl} x={0} y={0} width={imageDims.w} height={imageDims.h} />
              {overlayMeters.map((p, pi) => {
                const sx = imageDims.w / widthM;
                const sy = imageDims.h / depthM;
                const cx = (p.points.reduce((a, [x]) => a + x, 0) / p.points.length) * sx;
                const cy = (p.points.reduce((a, [, y]) => a + y, 0) / p.points.length) * sy;
                const tag = p.id.replace(`${floorId}-`, "");
                return (
                  <g key={`${p.id}-${pi}`} pointerEvents="none">
                    <polygon
                      points={p.points.map(([x, y]) => `${x * sx},${y * sy}`).join(" ")}
                      fill="rgba(0,102,179,0.05)"
                      stroke="rgba(0,102,179,0.45)"
                      strokeWidth={strokeBase * 0.6}
                      strokeDasharray={`${strokeBase * 2},${strokeBase * 2}`}
                    />
                    <text
                      x={cx}
                      y={cy}
                      fontSize={fontBase * 0.9}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#0066B3"
                      fontFamily="system-ui"
                      fontWeight={600}
                      opacity={0.75}
                    >
                      {tag}
                    </text>
                  </g>
                );
              })}
              {details.map(d => (
                <DetailShape
                  key={d.id}
                  detail={d}
                  strokeBase={strokeBase}
                  fontBase={fontBase}
                  selected={d.id === selectedId}
                  selectable={tool === "select"}
                  onSelect={() => setSelectedId(prev => (prev === d.id ? null : d.id))}
                />
              ))}
              {showConnectors && (
                <g pointerEvents="none">
                  {/* OTHER-floor connectors, ghosted for alignment (dashed orange).
                      Normalised by the OTHER floor's bounds so it lands at the
                      same fractional spot even if the floors' depths differ. */}
                  {otherFloor.conns.map((h, i) => {
                    const r = Math.max(6, view.w / 120);
                    const cx = (h.point[0] / otherFloor.widthM) * imageDims.w;
                    const cy = (h.point[1] / otherFloor.depthM) * imageDims.h;
                    const other = floorId === "L2" ? "L1" : "L2";
                    return (
                      <g key={`other${i}`}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r}
                          fill="rgba(224,123,57,0.18)"
                          stroke="#E07B39"
                          strokeWidth={strokeBase * 1.6}
                          strokeDasharray={`${strokeBase * 3},${strokeBase * 2}`}
                        />
                        <text
                          x={cx}
                          y={cy + r + fontBase * 0.85}
                          fontSize={fontBase * 0.8}
                          textAnchor="middle"
                          fill="#7A3D12"
                          fontWeight={700}
                          stroke="#fff"
                          strokeWidth={strokeBase * 0.45}
                          paintOrder="stroke"
                        >
                          {other} {h.kind}
                        </text>
                      </g>
                    );
                  })}
                  {connectorHighlights.map((h, i) => {
                    const r = Math.max(6, view.w / 120);
                    return (
                      <g key={`conn${i}`}>
                        <circle
                          cx={h.cx}
                          cy={h.cy}
                          r={r}
                          fill="rgba(0,194,168,0.4)"
                          stroke="#00B39A"
                          strokeWidth={strokeBase * 1.8}
                        />
                        <text
                          x={h.cx}
                          y={h.cy}
                          fontSize={fontBase}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#063D36"
                          fontWeight={800}
                          stroke="#fff"
                          strokeWidth={strokeBase * 0.5}
                          paintOrder="stroke"
                        >
                          ↑
                        </text>
                        <text
                          x={h.cx}
                          y={h.cy + r + fontBase * 0.85}
                          fontSize={fontBase * 0.8}
                          textAnchor="middle"
                          fill="#063D36"
                          fontWeight={700}
                          stroke="#fff"
                          strokeWidth={strokeBase * 0.45}
                          paintOrder="stroke"
                        >
                          {h.kind}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}
              {firstCorner && hoverPoint && tool !== "select" && tool !== "round-table" && (
                <rect
                  x={Math.min(firstCorner[0], hoverPoint[0])}
                  y={Math.min(firstCorner[1], hoverPoint[1])}
                  width={Math.abs(hoverPoint[0] - firstCorner[0])}
                  height={Math.abs(hoverPoint[1] - firstCorner[1])}
                  fill={`${TOOL_COLORS[tool as Exclude<Tool, "select">]}30`}
                  stroke={TOOL_COLORS[tool as Exclude<Tool, "select">]}
                  strokeWidth={strokeBase * 1.2}
                  strokeDasharray={`${strokeBase * 3},${strokeBase * 2}`}
                  pointerEvents="none"
                />
              )}
              {polyPoints.length > 0 && POLYGON_TOOLS.has(tool) && (
                <g pointerEvents="none">
                  <polyline
                    points={polyPoints.map(([x, y]) => `${x},${y}`).join(" ")}
                    fill={`${TOOL_COLORS[tool as Exclude<Tool, "select">]}22`}
                    stroke={TOOL_COLORS[tool as Exclude<Tool, "select">]}
                    strokeWidth={strokeBase * 1.2}
                    strokeDasharray={`${strokeBase * 3},${strokeBase * 2}`}
                  />
                  {polyPoints.map(([x, y], i) => (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r={Math.max(3, view.w / 300)}
                      fill={TOOL_COLORS[tool as Exclude<Tool, "select">]}
                      stroke="#fff"
                      strokeWidth={strokeBase * 0.8}
                    />
                  ))}
                </g>
              )}
            </svg>
            <div className="absolute bottom-3 left-3 bg-white/90 rounded-lg shadow px-3 py-2 text-xs space-y-1 pointer-events-none">
              <div>
                <span className="font-mono">{zoomPct}%</span> zoom · tool:{" "}
                <span className="font-semibold">{TOOL_LABELS[tool]}</span>
              </div>
              <div>scroll = zoom · shift+drag = pan · ESC = cancel</div>
              {tool === "select" && (
                <div className="text-pink-700">Click a detail to select / highlight it</div>
              )}
              {firstCorner && (
                <div className="text-orange-700">Click second corner to finish</div>
              )}
              {POLYGON_TOOLS.has(tool) && (
                <div className="text-teal-700">
                  Click to drop points ({polyPoints.length}) · use "Close shape" when done
                </div>
              )}
            </div>
            <button
              onClick={resetView}
              className="absolute top-3 left-3 bg-white/90 hover:bg-white rounded-lg shadow px-3 py-1.5 text-xs font-semibold"
            >
              Reset zoom
            </button>
            {(() => {
              const sel = details.find(d => d.id === selectedId);
              if (!sel) return null;
              return (
                <div className="absolute top-3 right-3 bg-white rounded-lg shadow-lg px-3 py-2 text-xs flex items-center gap-3 border border-pink-300">
                  <span className="font-mono uppercase">{sel.type}</span>
                  {"facing" in sel && (
                    <button
                      onClick={() => rotateFacing(sel.id)}
                      className="px-1.5 py-0.5 rounded bg-neutral-200 hover:bg-neutral-300 font-mono"
                      title="Cycle facing N/E/S/W"
                    >
                      {sel.facing}
                    </button>
                  )}
                  {"rect" in sel && (
                    <button
                      onClick={() => rotateRect90(sel.id)}
                      className="px-1.5 py-0.5 rounded bg-neutral-200 hover:bg-neutral-300 font-mono"
                      title="Rotate footprint 90°"
                    >
                      ⟳ 90°
                    </button>
                  )}
                  <button
                    onClick={() => deleteDetail(sel.id)}
                    className="px-2 py-0.5 rounded bg-red-600 text-white font-semibold"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="text-neutral-500 hover:text-neutral-800"
                  >
                    Deselect
                  </button>
                </div>
              );
            })()}
          </>
        ) : (
          <div className="grid place-items-center h-full text-neutral-500">
            <div className="text-center p-8 max-w-md">
              <p className="mb-3 text-lg font-semibold">Load the floor plan image</p>
              <p className="text-sm mb-4">
                Same image you used in the polygon editor. Polygons you've already traced
                will appear as blue dashed outlines so you know where rooms are.
              </p>
              <input type="file" accept="image/*" onChange={onFile} className="block mx-auto" />
            </div>
          </div>
        )}
      </div>
      <div className="bg-neutral-50 p-4 overflow-auto border-l border-neutral-300">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="text-xs font-semibold text-neutral-700">
            Floor
            <select
              value={floorId}
              onChange={e => setFloorId(e.target.value as FloorId)}
              className="block w-full mt-1 px-2 py-1 rounded border border-neutral-300 font-mono"
            >
              <option value="L1">L1</option>
              <option value="L2">L2</option>
              <option value="L3">L3</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-neutral-700">
            Image
            <input
              type="file"
              accept="image/*"
              onChange={onFile}
              className="block w-full mt-1 text-xs"
            />
          </label>
        </div>
        {savedAt && (
          <div className="mb-2 px-2 py-1.5 rounded bg-green-50 border border-green-200 text-xs text-green-800">
            ✓ Auto-saved{" "}
            {new Date(savedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            ({details.length} details)
          </div>
        )}
        <div className="mb-3 px-2 py-1.5 rounded bg-neutral-100 border border-neutral-200 text-[11px] text-neutral-700">
          Overlay source:{" "}
          <span className="font-semibold">
            {overlaySource === "json"
              ? `${floorId}.json (${overlayMeters.length} polygons)`
              : overlaySource === "localStorage"
                ? `polygon-editor localStorage (${overlayMeters.length} polygons)`
                : "none — no polygons found"}
          </span>
        </div>
        <button
          onClick={() => setShowConnectors(v => !v)}
          className={`w-full mb-3 px-2 py-1.5 rounded text-xs font-semibold border ${
            showConnectors
              ? "bg-[#00B39A] text-white border-[#00B39A]"
              : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100"
          }`}
          title="Highlight lifts / escalators / stairs that go UP to the next floor"
        >
          {showConnectors ? "✓ " : ""}↑ connectors — {floorId} ({connectorHighlights.length}) + {floorId === "L2" ? "L1" : "L2"} ghosts ({otherFloor.conns.length})
        </button>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <label className="text-xs font-semibold text-neutral-700">
            Width (m)
            <input
              type="number"
              value={widthM}
              onChange={e => setWidthM(parseFloat(e.target.value) || 1)}
              className="block w-full mt-1 px-2 py-1 rounded border border-neutral-300"
            />
          </label>
          <label className="text-xs font-semibold text-neutral-700">
            Depth (m)
            <input
              type="number"
              value={depthM}
              onChange={e => setDepthM(parseFloat(e.target.value) || 1)}
              className="block w-full mt-1 px-2 py-1 rounded border border-neutral-300"
            />
          </label>
        </div>

        <div className="mb-4">
          <h3 className="font-semibold text-sm mb-2">Tool</h3>
          <button
            onClick={() => {
              setTool("select");
              cancelCurrent();
            }}
            className={`w-full mb-2 px-2 py-1.5 rounded text-xs font-semibold border ${
              tool === "select"
                ? "bg-oth-primary text-white border-oth-primary"
                : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100"
            }`}
          >
            Select
          </button>
          {TOOL_CATEGORIES.map(cat => (
            <div key={cat.name} className="mb-2">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                {cat.name}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {cat.tools.map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      setTool(t);
                      cancelCurrent();
                    }}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-semibold border text-left ${
                      tool === t
                        ? "bg-oth-primary text-white border-oth-primary"
                        : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100"
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: TOOL_COLORS[t as Exclude<Tool, "select">] }}
                    />
                    <span className="truncate">{TOOL_LABELS[t]}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {firstCorner && (
            <button
              onClick={cancelCurrent}
              className="mt-1 w-full px-2 py-1 rounded bg-neutral-200 text-xs"
            >
              Cancel current rectangle
            </button>
          )}
          {POLYGON_TOOLS.has(tool) && polyPoints.length > 0 && (
            <div className="mt-1 flex gap-2">
              <button
                onClick={closePolyShape}
                disabled={polyPoints.length < 3}
                className="flex-1 px-2 py-1 rounded bg-oth-primary text-white text-xs font-semibold disabled:opacity-40"
              >
                Close shape ({polyPoints.length} pts)
              </button>
              <button
                onClick={() => setPolyPoints(prev => prev.slice(0, -1))}
                className="px-2 py-1 rounded bg-neutral-200 text-xs"
              >
                Undo pt
              </button>
              <button
                onClick={() => setPolyPoints([])}
                className="px-2 py-1 rounded bg-neutral-200 text-xs"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Details ({details.length})</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={loadSavedDetailsFile}
                className="text-xs text-oth-primary underline"
                title={`Reload ${floorId}-details.json from disk`}
              >
                Reload file
              </button>
              <button onClick={clearAll} className="text-xs text-red-600 underline">
                Clear all
              </button>
            </div>
          </div>
          <ul className="space-y-1 text-xs max-h-72 overflow-auto">
            {details.map(d => (
              <li
                key={d.id}
                className={`flex items-center gap-2 p-1 rounded ${
                  d.id === selectedId
                    ? "bg-pink-100 ring-1 ring-pink-400"
                    : "hover:bg-neutral-200"
                }`}
              >
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{
                    backgroundColor:
                      d.type === "service-centre"
                        ? d.variant === "family"
                          ? TOOL_COLORS["family-centre"]
                          : TOOL_COLORS["psc"]
                        : TOOL_COLORS[d.type],
                  }}
                />
                <button
                  onClick={() => setSelectedId(prev => (prev === d.id ? null : d.id))}
                  className="font-mono text-[10px] uppercase flex-1 text-left cursor-pointer"
                  title="Click to select/highlight on map"
                >
                  {d.type}
                </button>
                {"facing" in d && (
                  <button
                    onClick={() => rotateFacing(d.id)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 hover:bg-neutral-300 font-mono"
                    title="Cycle facing N/E/S/W"
                  >
                    {d.facing}
                  </button>
                )}
                {"rect" in d && (
                  <button
                    onClick={() => rotateRect90(d.id)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 hover:bg-neutral-300 font-mono"
                    title="Rotate footprint 90°"
                  >
                    ⟳90°
                  </button>
                )}
                <button
                  onClick={() => deleteDetail(d.id)}
                  className="text-red-600 text-base leading-none"
                  aria-label="Delete detail"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={updateSaved}
          disabled={details.length === 0 || saving}
          className="w-full px-3 py-2 rounded bg-oth-primary text-white text-sm font-semibold disabled:opacity-40"
        >
          {saving ? "Saving…" : `Update saved ${floorId}-details.json`}
        </button>
        {saveMsg && (
          <p className={`mt-1 text-xs ${saveMsg.startsWith("✓") ? "text-green-700" : "text-red-600"}`}>
            {saveMsg}
          </p>
        )}
        <button
          onClick={exportJson}
          disabled={details.length === 0}
          className="w-full mt-2 px-3 py-2 rounded bg-neutral-200 text-oth-ink text-sm font-semibold disabled:opacity-40"
        >
          Download {floorId}-details.json (manual)
        </button>
        <label className="block mt-2 text-xs font-semibold text-neutral-700">
          Import JSON (floor or details)
          <input
            type="file"
            accept="application/json"
            onChange={importJson}
            className="block w-full mt-1 text-xs"
          />
          <span className="block mt-1 text-[10px] font-normal text-neutral-500">
            Floor JSON updates the polygon overlay. Details JSON loads details.
          </span>
        </label>

        <details className="mt-4 text-xs text-neutral-600" open>
          <summary className="cursor-pointer font-semibold">How to use</summary>
          <ul className="list-disc pl-4 mt-2 space-y-1">
            <li>Pick a <strong>Tool</strong>: stall-row, stall-island, bench-rows, round-table</li>
            <li>
              For rectangles: <strong>click first corner</strong>, then{" "}
              <strong>click second corner</strong>
            </li>
            <li>For round-table: <strong>single click</strong></li>
            <li>
              <strong>Stall-row</strong> = single line of stalls facing one direction.
              Cycle the N/E/S/W button in the list to change which way they face.
            </li>
            <li>
              <strong>Stall-island</strong> = two rows of stalls back-to-back, facing
              outward on both sides (for the center clusters in a hawker centre).
            </li>
            <li>
              <strong>Bench-rows</strong> = cafeteria-style long tables with parallel bench seats,
              tiled to fill the rectangle.
            </li>
            <li><strong>ESC</strong> to cancel a half-drawn rectangle.</li>
            <li>
              Polygon outlines from the polygon editor appear as blue dashes for reference
              (won't be edited from this page).
            </li>
            <li>
              After exporting, paste the <code>"details"</code> array into the floor's
              JSON file in <code>public/data/floors/</code>.
            </li>
          </ul>
        </details>
      </div>
    </div>
  );
}

function DetailShape({
  detail,
  strokeBase,
  fontBase,
  selected,
  selectable,
  onSelect,
}: {
  detail: Detail;
  strokeBase: number;
  fontBase: number;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
}) {
  const events = selectable ? "auto" : "none";
  const handleClick = (e: MouseEvent<SVGElement>) => {
    if (!selectable || e.shiftKey) return;
    e.stopPropagation();
    onSelect();
  };
  const HILITE = "#E91E63";
  if (detail.type === "round-table") {
    const [x, y] = detail.point;
    return (
      <g pointerEvents={events} onClick={handleClick} style={{ cursor: selectable ? "pointer" : "default" }}>
        <circle
          cx={x}
          cy={y}
          r={Math.max(3, strokeBase * 2) * (selected ? 1.6 : 1)}
          fill={selected ? HILITE : TOOL_COLORS["round-table"]}
          stroke="#fff"
          strokeWidth={strokeBase * 0.5}
        />
      </g>
    );
  }
  if (detail.type === "service-centre") {
    const scColor =
      detail.variant === "family" ? TOOL_COLORS["family-centre"] : TOOL_COLORS["psc"];
    const cx = detail.points.reduce((s, [x]) => s + x, 0) / detail.points.length;
    const cy = detail.points.reduce((s, [, y]) => s + y, 0) / detail.points.length;
    return (
      <g pointerEvents={events} onClick={handleClick} style={{ cursor: selectable ? "pointer" : "default" }}>
        <polygon
          points={detail.points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill={selected ? `${HILITE}45` : `${scColor}33`}
          stroke={selected ? HILITE : scColor}
          strokeWidth={selected ? strokeBase * 2 : strokeBase}
        />
        <text
          x={cx}
          y={cy}
          fontSize={fontBase}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#111"
          fontFamily="system-ui"
          fontWeight={600}
        >
          {detail.variant === "family" ? "family centre" : "PSC"}
        </text>
      </g>
    );
  }
  if (detail.type === "library-entrance") {
    const leColor = TOOL_COLORS["library-entrance"];
    const cx = detail.points.reduce((s, [x]) => s + x, 0) / detail.points.length;
    const cy = detail.points.reduce((s, [, y]) => s + y, 0) / detail.points.length;
    // First edge (points[0]→[1]) is the doorway — draw it heavier so you can see it.
    const [d0, d1] = [detail.points[0], detail.points[1] ?? detail.points[0]];
    return (
      <g pointerEvents={events} onClick={handleClick} style={{ cursor: selectable ? "pointer" : "default" }}>
        <polygon
          points={detail.points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill={selected ? `${HILITE}45` : `${leColor}33`}
          stroke={selected ? HILITE : leColor}
          strokeWidth={selected ? strokeBase * 2 : strokeBase}
        />
        <line
          x1={d0[0]}
          y1={d0[1]}
          x2={d1[0]}
          y2={d1[1]}
          stroke={selected ? HILITE : leColor}
          strokeWidth={strokeBase * 3}
          strokeLinecap="round"
        />
        <text
          x={cx}
          y={cy}
          fontSize={fontBase}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#111"
          fontFamily="system-ui"
          fontWeight={600}
        >
          library
        </text>
      </g>
    );
  }
  if (detail.type === "walkway") {
    const wkColor = TOOL_COLORS["walkway"];
    const cx = detail.points.reduce((s, [x]) => s + x, 0) / detail.points.length;
    const cy = detail.points.reduce((s, [, y]) => s + y, 0) / detail.points.length;
    return (
      <g pointerEvents={events} onClick={handleClick} style={{ cursor: selectable ? "pointer" : "default" }}>
        <polygon
          points={detail.points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill={selected ? `${HILITE}45` : `${wkColor}33`}
          stroke={selected ? HILITE : wkColor}
          strokeWidth={selected ? strokeBase * 2 : strokeBase}
        />
        <text
          x={cx}
          y={cy}
          fontSize={fontBase}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#111"
          fontFamily="system-ui"
          fontWeight={600}
        >
          walkway
        </text>
      </g>
    );
  }
  if (detail.type === "library-decor" || detail.type === "meeting-rooms") {
    const c = TOOL_COLORS[detail.type];
    const cx = detail.points.reduce((s, [x]) => s + x, 0) / detail.points.length;
    const cy = detail.points.reduce((s, [, y]) => s + y, 0) / detail.points.length;
    return (
      <g pointerEvents={events} onClick={handleClick} style={{ cursor: selectable ? "pointer" : "default" }}>
        <polygon
          points={detail.points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill={selected ? `${HILITE}45` : `${c}33`}
          stroke={selected ? HILITE : c}
          strokeWidth={selected ? strokeBase * 2 : strokeBase}
        />
        <text
          x={cx}
          y={cy}
          fontSize={fontBase}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#111"
          fontFamily="system-ui"
          fontWeight={600}
        >
          {detail.type === "meeting-rooms" ? "meeting rooms" : "library decor"}
        </text>
      </g>
    );
  }
  if (detail.type === "court-roof" || detail.type === "garden-decor") {
    const c = TOOL_COLORS[detail.type];
    const cx = detail.points.reduce((s, [x]) => s + x, 0) / detail.points.length;
    const cy = detail.points.reduce((s, [, y]) => s + y, 0) / detail.points.length;
    return (
      <g pointerEvents={events} onClick={handleClick} style={{ cursor: selectable ? "pointer" : "default" }}>
        <polygon
          points={detail.points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill={selected ? `${HILITE}45` : `${c}33`}
          stroke={selected ? HILITE : c}
          strokeWidth={selected ? strokeBase * 2 : strokeBase}
        />
        <text
          x={cx}
          y={cy}
          fontSize={fontBase}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#111"
          fontFamily="system-ui"
          fontWeight={600}
        >
          {detail.type === "court-roof" ? "court roof" : "garden decor"}
        </text>
      </g>
    );
  }
  if (detail.type === "hdb-office") {
    const c = TOOL_COLORS["hdb-office"];
    const cx = detail.points.reduce((s, [x]) => s + x, 0) / detail.points.length;
    const cy = detail.points.reduce((s, [, y]) => s + y, 0) / detail.points.length;
    return (
      <g pointerEvents={events} onClick={handleClick} style={{ cursor: selectable ? "pointer" : "default" }}>
        <polygon
          points={detail.points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill={selected ? `${HILITE}45` : `${c}33`}
          stroke={selected ? HILITE : c}
          strokeWidth={selected ? strokeBase * 2 : strokeBase}
        />
        <text
          x={cx}
          y={cy}
          fontSize={fontBase}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#111"
          fontFamily="system-ui"
          fontWeight={600}
        >
          HDB office
        </text>
      </g>
    );
  }
  if (detail.type === "theatre") {
    const c = TOOL_COLORS["theatre"];
    const cx = detail.points.reduce((s, [x]) => s + x, 0) / detail.points.length;
    const cy = detail.points.reduce((s, [, y]) => s + y, 0) / detail.points.length;
    // First edge (points[0]→[1]) is the stage frontage — draw it heavier.
    const [s0, s1] = [detail.points[0], detail.points[1] ?? detail.points[0]];
    return (
      <g pointerEvents={events} onClick={handleClick} style={{ cursor: selectable ? "pointer" : "default" }}>
        <polygon
          points={detail.points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill={selected ? `${HILITE}45` : `${c}33`}
          stroke={selected ? HILITE : c}
          strokeWidth={selected ? strokeBase * 2 : strokeBase}
        />
        <line
          x1={s0[0]}
          y1={s0[1]}
          x2={s1[0]}
          y2={s1[1]}
          stroke={selected ? HILITE : c}
          strokeWidth={strokeBase * 3}
          strokeLinecap="round"
        />
        <text
          x={cx}
          y={cy}
          fontSize={fontBase}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#111"
          fontFamily="system-ui"
          fontWeight={600}
        >
          theatre
        </text>
      </g>
    );
  }
  const [a, b] = detail.rect;
  const minX = Math.min(a[0], b[0]);
  const minY = Math.min(a[1], b[1]);
  const w = Math.abs(b[0] - a[0]);
  const h = Math.abs(b[1] - a[1]);
  const color = TOOL_COLORS[detail.type];
  const horizontal = w >= h;
  return (
    <g pointerEvents={events} onClick={handleClick} style={{ cursor: selectable ? "pointer" : "default" }}>
      <rect
        x={minX}
        y={minY}
        width={w}
        height={h}
        fill={selected ? `${HILITE}45` : `${color}30`}
        stroke={selected ? HILITE : color}
        strokeWidth={selected ? strokeBase * 2 : strokeBase}
      />
      {"facing" in detail && (
        <FacingArrow
          cx={minX + w / 2}
          cy={minY + h / 2}
          facing={detail.facing}
          size={Math.min(w, h) * 0.4}
          color={color}
          strokeBase={strokeBase}
        />
      )}
      {detail.type === "stall-island" && (
        <line
          x1={horizontal ? minX : minX + w / 2}
          y1={horizontal ? minY + h / 2 : minY}
          x2={horizontal ? minX + w : minX + w / 2}
          y2={horizontal ? minY + h / 2 : minY + h}
          stroke={color}
          strokeWidth={strokeBase * 0.6}
          strokeDasharray={`${strokeBase * 2},${strokeBase * 2}`}
        />
      )}
      <text
        x={minX + w / 2}
        y={minY + h / 2}
        fontSize={fontBase}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#111"
        fontFamily="system-ui"
        fontWeight={600}
      >
        {detail.type.replace("-", " ")}
      </text>
    </g>
  );
}

function FacingArrow({
  cx,
  cy,
  facing,
  size,
  color,
  strokeBase,
}: {
  cx: number;
  cy: number;
  facing: Facing;
  size: number;
  color: string;
  strokeBase: number;
}) {
  const [dx, dy] = FACING_ARROW[facing];
  const tipX = cx + dx * size;
  const tipY = cy + dy * size;
  return (
    <g pointerEvents="none">
      <line
        x1={cx}
        y1={cy}
        x2={tipX}
        y2={tipY}
        stroke={color}
        strokeWidth={strokeBase * 1.5}
      />
      <circle cx={tipX} cy={tipY} r={strokeBase * 1.8} fill={color} />
    </g>
  );
}
