import { useState, useRef, useEffect, ChangeEvent, MouseEvent, WheelEvent } from "react";
import type { Detail, Facing, Pt } from "@/data/types";

type Tool =
  | "select"
  | "stall-row"
  | "stall-island"
  | "bench-rows"
  | "round-table"
  | "toilet"
  | "cleaning"
  | "greenery-row";

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
};

const TOOL_COLORS: Record<Exclude<Tool, "select">, string> = {
  "stall-row": "#D9534F",
  "stall-island": "#C9462A",
  "bench-rows": "#8C6A47",
  "round-table": "#D8B57C",
  toilet: "#5E81AC",
  cleaning: "#3A3D42",
  "greenery-row": "#4F7A3A",
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

export function DetailEditor() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [floorId, setFloorId] = useState<"L1" | "L2">("L1");
  const [widthM, setWidthM] = useState(210);
  const [depthM, setDepthM] = useState(130);
  const [polygons, setPolygons] = useState<Array<{ id: string; points: Pt[] }>>([]);
  const [details, setDetails] = useState<Detail[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [firstCorner, setFirstCorner] = useState<Pt | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Pt | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panStart = useRef<{ cx: number; cy: number; vx: number; vy: number } | null>(null);
  const dragMoved = useRef(false);
  const restoring = useRef(true);

  useEffect(() => {
    if (imageDims.w > 1 && imageDims.h > 1) {
      setView({ x: 0, y: 0, w: imageDims.w, h: imageDims.h });
    }
  }, [imageDims]);

  useEffect(() => {
    restoring.current = true;
    const polyRaw = localStorage.getItem(POLY_STORAGE_KEY(floorId));
    if (polyRaw) {
      try {
        const pdata = JSON.parse(polyRaw) as PolyStored;
        setPolygons((pdata.polygons || []).map(p => ({ id: p.id, points: p.points })));
        if (typeof pdata.widthM === "number") setWidthM(pdata.widthM);
        if (typeof pdata.depthM === "number") setDepthM(pdata.depthM);
        if (pdata.imageDims && pdata.imageDims.w > 1) setImageDims(pdata.imageDims);
      } catch (e) {
        console.warn("[DetailEditor] polygon overlay load failed:", e);
      }
    } else {
      setPolygons([]);
    }
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
    Promise.resolve().then(() => {
      restoring.current = false;
    });
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
    if (lower.includes("2nd") || lower.includes("level2") || lower.includes("l2")) {
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

    if (!firstCorner) {
      setFirstCorner(pt);
      setHoverPoint(pt);
    } else {
      const r: [Pt, Pt] = [firstCorner, pt];
      let newDetail: Detail;
      if (tool === "stall-row") {
        newDetail = { id: uid(), type: "stall-row", rect: r, facing: "S" };
      } else if (tool === "stall-island") {
        newDetail = { id: uid(), type: "stall-island", rect: r };
      } else if (tool === "toilet") {
        newDetail = { id: uid(), type: "toilet", rect: r };
      } else if (tool === "cleaning") {
        newDetail = { id: uid(), type: "cleaning", rect: r };
      } else if (tool === "greenery-row") {
        newDetail = { id: uid(), type: "greenery-row", rect: r };
      } else {
        newDetail = { id: uid(), type: "bench-rows", rect: r };
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
  };

  const deleteDetail = (id: string) =>
    setDetails(prev => prev.filter(d => d.id !== id));

  const rotateFacing = (id: string) =>
    setDetails(prev =>
      prev.map(d =>
        d.id === id && d.type === "stall-row" ? { ...d, facing: nextFacing(d.facing) } : d,
      ),
    );

  const clearAll = () => {
    if (!window.confirm("Delete all details AND clear autosave for this floor?")) return;
    setDetails([]);
    localStorage.removeItem(STORAGE_KEY(floorId));
    setSavedAt(null);
  };

  const exportJson = () => {
    const sx = widthM / imageDims.w;
    const sy = depthM / imageDims.h;
    const r = (n: number) => Math.round(n * 100) / 100;
    const conv = ([x, y]: Pt): Pt => [r(x * sx), r(y * sy)];
    const exported = details.map(d => {
      if (d.type === "round-table") return { ...d, point: conv(d.point) };
      return { ...d, rect: [conv(d.rect[0]), conv(d.rect[1])] as [Pt, Pt] };
    });
    const data = { id: floorId, details: exported };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${floorId}-details.json`;
    a.click();
    URL.revokeObjectURL(url);
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
        const conv = ([x, y]: Pt): Pt => [x * sx, y * sy];

        let didSomething = false;

        if (Array.isArray(data.polygons)) {
          const polys = data.polygons
            .filter((p: { id?: string; points?: Pt[] }) => Array.isArray(p?.points))
            .map((p: { id: string; points: Pt[] }) => ({
              id: p.id,
              points: p.points.map(conv) as Pt[],
            }));
          setPolygons(polys);
          didSomething = true;
        }

        if (Array.isArray(data.details)) {
          const loaded: Detail[] = data.details.map((d: Detail) => {
            if (d.type === "round-table") {
              return { ...d, id: d.id ?? uid(), point: conv(d.point) };
            }
            return {
              ...d,
              id: d.id ?? uid(),
              rect: [conv(d.rect[0]), conv(d.rect[1])] as [Pt, Pt],
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
              {polygons.map(p => (
                <polygon
                  key={p.id}
                  points={p.points.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="rgba(0,102,179,0.05)"
                  stroke="rgba(0,102,179,0.45)"
                  strokeWidth={strokeBase * 0.6}
                  strokeDasharray={`${strokeBase * 2},${strokeBase * 2}`}
                  pointerEvents="none"
                />
              ))}
              {details.map(d => (
                <DetailShape
                  key={d.id}
                  detail={d}
                  strokeBase={strokeBase}
                  fontBase={fontBase}
                />
              ))}
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
            </svg>
            <div className="absolute bottom-3 left-3 bg-white/90 rounded-lg shadow px-3 py-2 text-xs space-y-1 pointer-events-none">
              <div>
                <span className="font-mono">{zoomPct}%</span> zoom · tool:{" "}
                <span className="font-semibold">{TOOL_LABELS[tool]}</span>
              </div>
              <div>scroll = zoom · shift+drag = pan · ESC = cancel</div>
              {firstCorner && (
                <div className="text-orange-700">Click second corner to finish</div>
              )}
            </div>
            <button
              onClick={resetView}
              className="absolute top-3 left-3 bg-white/90 hover:bg-white rounded-lg shadow px-3 py-1.5 text-xs font-semibold"
            >
              Reset zoom
            </button>
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
              onChange={e => setFloorId(e.target.value as "L1" | "L2")}
              className="block w-full mt-1 px-2 py-1 rounded border border-neutral-300 font-mono"
            >
              <option value="L1">L1</option>
              <option value="L2">L2</option>
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
          <div className="mb-3 px-2 py-1.5 rounded bg-green-50 border border-green-200 text-xs text-green-800">
            ✓ Auto-saved{" "}
            {new Date(savedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            ({details.length} details)
          </div>
        )}
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
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(TOOL_LABELS) as Tool[]).map(t => (
              <button
                key={t}
                onClick={() => {
                  setTool(t);
                  cancelCurrent();
                }}
                className={`px-2 py-1.5 rounded text-xs font-semibold border ${
                  tool === t
                    ? "bg-oth-primary text-white border-oth-primary"
                    : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100"
                }`}
              >
                {TOOL_LABELS[t]}
              </button>
            ))}
          </div>
          {firstCorner && (
            <button
              onClick={cancelCurrent}
              className="mt-2 w-full px-2 py-1 rounded bg-neutral-200 text-xs"
            >
              Cancel current rectangle
            </button>
          )}
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Details ({details.length})</h3>
            <button onClick={clearAll} className="text-xs text-red-600 underline">
              Clear all
            </button>
          </div>
          <ul className="space-y-1 text-xs max-h-72 overflow-auto">
            {details.map(d => (
              <li
                key={d.id}
                className="flex items-center gap-2 p-1 rounded hover:bg-neutral-200"
              >
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{
                    backgroundColor:
                      d.type === "round-table"
                        ? TOOL_COLORS["round-table"]
                        : TOOL_COLORS[d.type],
                  }}
                />
                <span className="font-mono text-[10px] uppercase flex-1">{d.type}</span>
                {d.type === "stall-row" && (
                  <button
                    onClick={() => rotateFacing(d.id)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 hover:bg-neutral-300 font-mono"
                    title="Cycle facing N/E/S/W"
                  >
                    {d.facing}
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
          onClick={exportJson}
          disabled={details.length === 0}
          className="w-full px-3 py-2 rounded bg-green-600 text-white text-sm font-semibold disabled:opacity-40"
        >
          Download {floorId}-details.json
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
}: {
  detail: Detail;
  strokeBase: number;
  fontBase: number;
}) {
  if (detail.type === "round-table") {
    const [x, y] = detail.point;
    return (
      <g pointerEvents="none">
        <circle
          cx={x}
          cy={y}
          r={Math.max(3, strokeBase * 2)}
          fill={TOOL_COLORS["round-table"]}
          stroke="#fff"
          strokeWidth={strokeBase * 0.5}
        />
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
    <g pointerEvents="none">
      <rect
        x={minX}
        y={minY}
        width={w}
        height={h}
        fill={`${color}30`}
        stroke={color}
        strokeWidth={strokeBase}
      />
      {detail.type === "stall-row" && (
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
