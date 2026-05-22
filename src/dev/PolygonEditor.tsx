import { useState, useRef, useEffect, ChangeEvent, MouseEvent, WheelEvent } from "react";

type Pt = [number, number];
type PolyType = "room" | "corridor" | "landmark" | "void";
type Poly = { id: string; type: PolyType; points: Pt[] };

const HEIGHT_BY_TYPE: Record<PolyType, number> = {
  room: 3.5,
  corridor: 3.5,
  landmark: 4.5,
  void: 0.1,
};

function inferType(id: string): PolyType {
  if (id.includes("-corridor-")) return "corridor";
  if (id.includes("-landmark-")) return "landmark";
  if (id.includes("-void-")) return "void";
  return "room";
}

export function PolygonEditor() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [polygons, setPolygons] = useState<Poly[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Pt[]>([]);
  const [floorId, setFloorId] = useState<"L1" | "L2">("L1");
  const [widthM, setWidthM] = useState(210);
  const [depthM, setDepthM] = useState(130);
  const [view, setView] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const panStart = useRef<{ cx: number; cy: number; vx: number; vy: number } | null>(null);
  const dragMoved = useRef(false);

  useEffect(() => {
    if (imageDims.w > 1 && imageDims.h > 1) {
      setView({ x: 0, y: 0, w: imageDims.w, h: imageDims.h });
    }
  }, [imageDims]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      panStart.current = {
        cx: e.clientX,
        cy: e.clientY,
        vx: view.x,
        vy: view.y,
      };
      dragMoved.current = false;
    }
  };

  const onSvgMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!panStart.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = view.w / rect.width;
    const scaleY = view.h / rect.height;
    const dx = (e.clientX - panStart.current.cx) * scaleX;
    const dy = (e.clientY - panStart.current.cy) * scaleY;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragMoved.current = true;
    setView(v => ({ ...v, x: panStart.current!.vx - dx, y: panStart.current!.vy - dy }));
  };

  const onSvgMouseUp = () => {
    panStart.current = null;
  };

  const onSvgClick = (e: MouseEvent<SVGSVGElement>) => {
    if (e.shiftKey || dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    const pt = screenToSvg(e.clientX, e.clientY);
    if (!pt) return;
    if (pt[0] < 0 || pt[1] < 0 || pt[0] > imageDims.w || pt[1] > imageDims.h) return;
    setCurrentPoints(prev => [...prev, pt]);
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

  const resetView = () => setView({ x: 0, y: 0, w: imageDims.w, h: imageDims.h });

  const closePolygon = () => {
    if (currentPoints.length < 3) {
      alert("Need at least 3 points before closing a polygon.");
      return;
    }
    const id = window.prompt(
      `Polygon ID. Examples:\n  ${floorId}-room-psc\n  ${floorId}-room-hawker\n  ${floorId}-corridor-festive-walk\n  ${floorId}-landmark-town-square\n  ${floorId}-void-atrium\n\nType is inferred from the prefix.`,
      `${floorId}-room-`,
    );
    if (!id) return;
    if (!id.startsWith(`${floorId}-`)) {
      alert(`ID must start with "${floorId}-".`);
      return;
    }
    if (polygons.some(p => p.id === id)) {
      alert(`Polygon with ID "${id}" already exists.`);
      return;
    }
    setPolygons(prev => [...prev, { id, type: inferType(id), points: currentPoints }]);
    setCurrentPoints([]);
  };

  const undoPoint = () => setCurrentPoints(prev => prev.slice(0, -1));
  const cancelCurrent = () => setCurrentPoints([]);
  const deletePoly = (i: number) =>
    setPolygons(prev => prev.filter((_, idx) => idx !== i));
  const clearAll = () => {
    if (!window.confirm("Delete all polygons?")) return;
    setPolygons([]);
    setCurrentPoints([]);
  };

  const exportJson = () => {
    const scaleX = widthM / imageDims.w;
    const scaleY = depthM / imageDims.h;
    const data = {
      id: floorId,
      bounds: { width: widthM, depth: depthM },
      polygons: polygons.map(p => ({
        id: p.id,
        type: p.type,
        heightMeters: HEIGHT_BY_TYPE[p.type],
        points: p.points.map(
          ([x, y]) =>
            [
              Math.round(x * scaleX * 100) / 100,
              Math.round(y * scaleY * 100) / 100,
            ] as Pt,
        ),
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${floorId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(text => {
      try {
        const data = JSON.parse(text);
        if (!Array.isArray(data.polygons)) {
          alert("Invalid floor JSON: missing polygons array.");
          return;
        }
        const scaleX = imageDims.w / (data.bounds?.width ?? widthM);
        const scaleY = imageDims.h / (data.bounds?.depth ?? depthM);
        const loaded: Poly[] = data.polygons.map((p: { id: string; type: PolyType; points: Pt[] }) => ({
          id: p.id,
          type: p.type,
          points: p.points.map(([x, y]) => [x * scaleX, y * scaleY] as Pt),
        }));
        setPolygons(loaded);
      } catch (err) {
        alert("Failed to parse JSON: " + (err instanceof Error ? err.message : String(err)));
      }
    });
  };

  const colorFor = (t: PolyType) =>
    t === "corridor"
      ? { fill: "rgba(217,180,80,0.45)", stroke: "#D9B450" }
      : t === "landmark"
      ? { fill: "rgba(242,163,60,0.55)", stroke: "#F2A33C" }
      : t === "void"
      ? { fill: "rgba(160,160,160,0.35)", stroke: "#777" }
      : { fill: "rgba(0,102,179,0.30)", stroke: "#0066B3" };

  const zoomPct = imageDims.w > 1 ? Math.round((imageDims.w / view.w) * 100) : 100;
  const strokeBase = Math.max(1.5, view.w / 600);
  const fontBase = Math.max(8, view.w / 80);

  return (
    <div className="grid grid-cols-[2fr_1fr] h-screen bg-neutral-100">
      <div className="relative bg-neutral-200 overflow-hidden">
        {imageUrl ? (
          <>
            <svg
              ref={svgRef}
              viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              onMouseDown={onSvgMouseDown}
              onMouseMove={onSvgMouseMove}
              onMouseUp={onSvgMouseUp}
              onMouseLeave={onSvgMouseUp}
              onClick={onSvgClick}
              onWheel={onSvgWheel}
              preserveAspectRatio="xMidYMid meet"
            >
              <image
                href={imageUrl}
                x={0}
                y={0}
                width={imageDims.w}
                height={imageDims.h}
              />
              {polygons.map((p, i) => {
                const c = colorFor(p.type);
                const cx = p.points.reduce((a, [x]) => a + x, 0) / p.points.length;
                const cy = p.points.reduce((a, [, y]) => a + y, 0) / p.points.length;
                return (
                  <g key={i}>
                    <polygon
                      points={p.points.map(([x, y]) => `${x},${y}`).join(" ")}
                      fill={c.fill}
                      stroke={c.stroke}
                      strokeWidth={strokeBase}
                    />
                    <text
                      x={cx}
                      y={cy}
                      fontSize={fontBase}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#111"
                      fontFamily="system-ui"
                      style={{ pointerEvents: "none" }}
                    >
                      {p.id.replace(`${floorId}-`, "")}
                    </text>
                  </g>
                );
              })}
              {currentPoints.length > 0 && (
                <polyline
                  points={currentPoints.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="rgba(242,163,60,0.20)"
                  stroke="#F2A33C"
                  strokeWidth={strokeBase * 1.2}
                  strokeDasharray={`${strokeBase * 4},${strokeBase * 3}`}
                />
              )}
              {currentPoints.map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={Math.max(3, view.w / 300)}
                  fill="#F2A33C"
                  stroke="#fff"
                  strokeWidth={strokeBase * 0.8}
                />
              ))}
            </svg>
            <div className="absolute bottom-3 left-3 bg-white/90 rounded-lg shadow px-3 py-2 text-xs space-y-1 pointer-events-none">
              <div>
                <span className="font-mono">{zoomPct}%</span> zoom
              </div>
              <div>scroll to zoom · shift+drag to pan</div>
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
            <div className="text-center p-8">
              <p className="mb-3 text-lg font-semibold">Load a floor plan image</p>
              <p className="text-sm mb-4">
                Use the JPGs in <code className="bg-neutral-300 px-1 rounded">images/</code>
                : <code className="bg-neutral-300 px-1 rounded">1st-Storey…jpg</code> or{" "}
                <code className="bg-neutral-300 px-1 rounded">2nd-Storey…jpg</code>
              </p>
              <input
                type="file"
                accept="image/*"
                onChange={onFile}
                className="block mx-auto"
              />
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

        <div className="flex flex-col gap-2 mb-4">
          <button
            onClick={closePolygon}
            disabled={currentPoints.length < 3}
            className="px-3 py-2 rounded bg-oth-primary text-white text-sm font-semibold disabled:opacity-40"
          >
            Close polygon ({currentPoints.length} pts)
          </button>
          <div className="flex gap-2">
            <button
              onClick={undoPoint}
              disabled={currentPoints.length === 0}
              className="flex-1 px-3 py-1 rounded bg-neutral-300 text-sm disabled:opacity-40"
            >
              Undo point
            </button>
            <button
              onClick={cancelCurrent}
              disabled={currentPoints.length === 0}
              className="flex-1 px-3 py-1 rounded bg-neutral-300 text-sm disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Polygons ({polygons.length})</h3>
            <button onClick={clearAll} className="text-xs text-red-600 underline">
              Clear all
            </button>
          </div>
          <ul className="space-y-1 text-xs max-h-72 overflow-auto">
            {polygons.map((p, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 p-1 rounded hover:bg-neutral-200"
              >
                <span className="font-mono truncate flex-1">{p.id}</span>
                <span className="text-neutral-500 text-[10px] uppercase">{p.type}</span>
                <button
                  onClick={() => deletePoly(i)}
                  className="text-red-600 text-base leading-none"
                  aria-label="Delete polygon"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={exportJson}
          disabled={polygons.length === 0}
          className="w-full px-3 py-2 rounded bg-green-600 text-white text-sm font-semibold disabled:opacity-40"
        >
          Download {floorId}.json
        </button>
        <label className="block mt-2 text-xs font-semibold text-neutral-700">
          Import existing {floorId}.json (resume work)
          <input
            type="file"
            accept="application/json"
            onChange={importJson}
            className="block w-full mt-1 text-xs"
          />
        </label>

        <details className="mt-4 text-xs text-neutral-600" open>
          <summary className="cursor-pointer font-semibold">How to use</summary>
          <ul className="list-disc pl-4 mt-2 space-y-1">
            <li>
              <strong>Scroll wheel</strong> on the image to zoom in/out (zooms to your cursor)
            </li>
            <li>
              <strong>Shift + click and drag</strong> to pan around when zoomed in
            </li>
            <li>
              <strong>Click</strong> (without shift) to add a corner point
            </li>
            <li>
              <strong>Close polygon</strong> when you've placed all corners; enter an ID
            </li>
            <li>
              Polygon type is inferred from the prefix in the ID:
              <ul className="list-[circle] pl-4">
                <li>
                  <code>-room-</code> → indoor space (counter, shop, library)
                </li>
                <li>
                  <code>-corridor-</code> → walkway / passage
                </li>
                <li>
                  <code>-landmark-</code> → atrium / town square / lift core (taller extrusion)
                </li>
                <li>
                  <code>-void-</code> → multi-storey opening (thin slab)
                </li>
              </ul>
            </li>
            <li>
              Use the legend printed on the floor plan! For L1: zone 5 is the Public
              Service Centre, zone 6 is the Hawker Centre, etc.
            </li>
          </ul>
        </details>
      </div>
    </div>
  );
}
