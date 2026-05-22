import { useState, useRef, ChangeEvent, MouseEvent } from "react";

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
  const containerRef = useRef<HTMLDivElement>(null);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    const img = new Image();
    img.onload = () => setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  };

  const onCanvasClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !imageUrl) return;
    const rect = containerRef.current.getBoundingClientRect();
    const imgAspect = imageDims.w / imageDims.h;
    const containerAspect = rect.width / rect.height;
    let renderedW = rect.width;
    let renderedH = rect.height;
    let offsetX = 0;
    let offsetY = 0;
    if (imgAspect > containerAspect) {
      renderedH = rect.width / imgAspect;
      offsetY = (rect.height - renderedH) / 2;
    } else {
      renderedW = rect.height * imgAspect;
      offsetX = (rect.width - renderedW) / 2;
    }
    const localX = e.clientX - rect.left - offsetX;
    const localY = e.clientY - rect.top - offsetY;
    if (localX < 0 || localX > renderedW || localY < 0 || localY > renderedH) return;
    const px = (localX / renderedW) * imageDims.w;
    const py = (localY / renderedH) * imageDims.h;
    setCurrentPoints(prev => [...prev, [px, py]]);
  };

  const closePolygon = () => {
    if (currentPoints.length < 3) {
      alert("Need at least 3 points before closing a polygon.");
      return;
    }
    const id = window.prompt(
      `Polygon ID. Examples:\n  ${floorId}-room-customer-service\n  ${floorId}-corridor-east\n  ${floorId}-landmark-atrium\n  ${floorId}-void-multistorey\n\nType is inferred from the prefix.`,
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
            ] as [number, number],
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

  const colorFor = (t: PolyType) =>
    t === "corridor"
      ? { fill: "rgba(217,180,80,0.45)", stroke: "#D9B450" }
      : t === "landmark"
      ? { fill: "rgba(242,163,60,0.55)", stroke: "#F2A33C" }
      : t === "void"
      ? { fill: "rgba(160,160,160,0.35)", stroke: "#777" }
      : { fill: "rgba(0,102,179,0.30)", stroke: "#0066B3" };

  return (
    <div className="grid grid-cols-[2fr_1fr] h-screen bg-neutral-100">
      <div
        ref={containerRef}
        className="relative bg-neutral-200 overflow-hidden cursor-crosshair"
        onClick={onCanvasClick}
      >
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              className="w-full h-full object-contain pointer-events-none select-none"
              alt="floor plan"
              draggable={false}
            />
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox={`0 0 ${imageDims.w} ${imageDims.h}`}
              preserveAspectRatio="xMidYMid meet"
            >
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
                      strokeWidth={Math.max(2, imageDims.w / 600)}
                    />
                    <text
                      x={cx}
                      y={cy}
                      fontSize={Math.max(12, imageDims.w / 120)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#111"
                      fontFamily="system-ui"
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
                  strokeWidth={Math.max(2, imageDims.w / 500)}
                  strokeDasharray="8,5"
                />
              )}
              {currentPoints.map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={Math.max(4, imageDims.w / 350)}
                  fill="#F2A33C"
                  stroke="#fff"
                  strokeWidth={2}
                />
              ))}
            </svg>
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
                onClick={e => e.stopPropagation()}
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
              onClick={e => e.stopPropagation()}
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

        <details className="mt-4 text-xs text-neutral-600">
          <summary className="cursor-pointer font-semibold">How to use</summary>
          <ol className="list-decimal pl-4 mt-2 space-y-1">
            <li>Pick a floor (L1 or L2) from the dropdown.</li>
            <li>
              Click the file input and pick the JPG from <code>images/</code>{" "}
              (<code>1st-Storey…jpg</code> for L1, <code>2nd-Storey…jpg</code> for L2).
            </li>
            <li>
              Set the metres width × depth. OTH is ~210m × 130m by default. Tune later
              if needed.
            </li>
            <li>
              Click corners on the floor plan to define a polygon. Polygons are room
              outlines (walls / counters), corridors, landmarks (atrium, lifts), or
              voids (multi-storey openings).
            </li>
            <li>
              Click <strong>Close polygon</strong> when you've placed all corners.
              Give it an ID like <code>L1-room-customer-service</code>. The type is
              inferred from the prefix (<code>-room-</code>, <code>-corridor-</code>,{" "}
              <code>-landmark-</code>, <code>-void-</code>).
            </li>
            <li>Repeat for every room / corridor / landmark.</li>
            <li>
              Click <strong>Download {floorId}.json</strong> and drop the downloaded
              file into <code>public/data/floors/</code>.
            </li>
            <li>Switch to L2 and do it again with the L2 image.</li>
          </ol>
          <p className="mt-2">
            Aim for 20-40 polygons per floor. Be approximate — for the demo, polygons
            don't need to be pixel-perfect to the floor plan.
          </p>
        </details>
      </div>
    </div>
  );
}
