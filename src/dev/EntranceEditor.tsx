import { useState, useRef, useEffect, ChangeEvent, MouseEvent, WheelEvent } from "react";
import type { EntranceMap, FloorId, Pt } from "@/data/types";
import { BACKEND_SERVICE_CATALOG, SERVICE_LOCATION_MAP } from "@/data/retrieval";
import { saveDataFile } from "./saveData";

const STORAGE_KEY = "oth-entrance-editor";

type IdRow = {
  id: string;
  name: string;
  group: string;
  /** routing target room (backend rows only): set the entrance on this room. */
  targetRoom?: string;
  /** false when targetRoom isn't traced yet → falls back to ServiceSG at runtime. */
  targetExists?: boolean;
};

export function EntranceEditor() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [floorId, setFloorId] = useState<FloorId>("L1");
  const [widthM, setWidthM] = useState(210);
  const [depthM, setDepthM] = useState(130);
  const [overlay, setOverlay] = useState<{ id: string; points: Pt[] }[]>([]);
  const [entrances, setEntrances] = useState<EntranceMap>({});
  const [rows, setRows] = useState<IdRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customId, setCustomId] = useState("");
  const [view, setView] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [disk, setDisk] = useState<{ state: "idle" | "saving" | "ok" | "error"; msg?: string }>({
    state: "idle",
  });
  const svgRef = useRef<SVGSVGElement>(null);
  const diskTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panStart = useRef<{ cx: number; cy: number; vx: number; vy: number } | null>(null);
  const dragMoved = useRef(false);
  const restoring = useRef(true);

  // Build the id list once: backend service ids + app services + room/place ids.
  useEffect(() => {
    const build = async () => {
      // Load traced rooms first so we know which backend targets actually exist.
      const roomRows: IdRow[] = [];
      const existingRooms = new Set<string>();
      for (const f of ["L1", "L2", "L3"]) {
        try {
          const fl = await fetch(`/data/floors/${f}.json`).then(r => r.json());
          const roomIds: string[] = Array.from(
            new Set((fl.polygons ?? []).filter((p: { type: string }) => p.type === "room").map((p: { id: string }) => p.id)),
          );
          for (const id of roomIds) {
            existingRooms.add(id);
            roomRows.push({ id, name: id, group: `Rooms — ${f}` });
          }
        } catch {
          /* ignore */
        }
      }

      // Backend services: annotate each with the room routing resolves it to, so
      // overlapping ids (many services → one counter) are obvious. Place the
      // entrance on the room, not each id — ids inherit their room's entrance.
      const list: IdRow[] = BACKEND_SERVICE_CATALOG.map(s => {
        const room = SERVICE_LOCATION_MAP[s.id]?.roomId;
        return {
          id: s.id,
          name: s.name,
          group: "Backend services",
          targetRoom: room,
          targetExists: room ? existingRooms.has(room) : false,
        };
      });
      try {
        const svcs = await fetch("/data/services.json").then(r => r.json());
        for (const s of svcs) list.push({ id: s.id, name: s.nameEn, group: "App services" });
      } catch {
        /* ignore */
      }
      list.push(...roomRows);
      setRows(list);
    };
    build();
    // Restore saved entrances. The disk file (public/data/entrances.json) is
    // canonical — it's what the app reads and what Save writes — so prefer it,
    // falling back to the localStorage working copy only when the file is
    // missing/empty (which also recovers if a stray empty auto-save ever
    // clobbered it). Keep `restoring` true until this finishes so the auto-save
    // effects don't fire first and overwrite a good file with {}.
    const restore = async () => {
      let local: EntranceMap = {};
      let savedTs: number | null = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          local = data?.entrances ?? {};
          savedTs = data?.savedAt ?? null;
        }
      } catch {
        /* ignore */
      }
      let diskData: EntranceMap = {};
      try {
        diskData = await fetch("/data/entrances.json").then(r => (r.ok ? r.json() : {}));
      } catch {
        /* ignore */
      }
      setEntrances(Object.keys(diskData).length ? diskData : local);
      setSavedAt(savedTs);
      restoring.current = false;
    };
    restore();
  }, []);

  // Load floor overlay (polygons in metres) + bounds when the floor changes.
  useEffect(() => {
    fetch(`/data/floors/${floorId}.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) return;
        setOverlay(
          (data.polygons ?? [])
            .filter((p: { points?: Pt[] }) => Array.isArray(p?.points))
            .map((p: { id: string; points: Pt[] }) => ({ id: p.id, points: p.points })),
        );
        if (typeof data.bounds?.width === "number") setWidthM(data.bounds.width);
        if (typeof data.bounds?.depth === "number") setDepthM(data.bounds.depth);
      })
      .catch(() => {});
  }, [floorId]);

  useEffect(() => {
    if (imageDims.w > 1 && imageDims.h > 1) setView({ x: 0, y: 0, w: imageDims.w, h: imageDims.h });
  }, [imageDims]);

  // Autosave the entrance map (localStorage = live working copy).
  useEffect(() => {
    if (restoring.current) return;
    const data = { entrances, savedAt: Date.now() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setSavedAt(data.savedAt);
    } catch {
      /* ignore */
    }
  }, [entrances]);

  // Write straight to public/data/entrances.json so the app picks it up — no
  // download/move. Save the snapshot now and run it again whenever entrances
  // change (debounced), in addition to the explicit Save button.
  const saveToDisk = (map: EntranceMap) => {
    setDisk({ state: "saving" });
    saveDataFile("entrances.json", map)
      .then(p => setDisk({ state: "ok", msg: p }))
      .catch(e => setDisk({ state: "error", msg: String(e.message ?? e) }));
  };
  useEffect(() => {
    if (restoring.current) return;
    if (diskTimer.current) clearTimeout(diskTimer.current);
    diskTimer.current = setTimeout(() => saveToDisk(entrances), 700);
    return () => {
      if (diskTimer.current) clearTimeout(diskTimer.current);
    };
  }, [entrances]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.includes("3rd") || lower.includes("l3")) setFloorId("L3");
    else if (lower.includes("2nd") || lower.includes("l2")) setFloorId("L2");
    else if (lower.includes("1st") || lower.includes("l1")) setFloorId("L1");
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
  const pxToM = ([x, y]: Pt): Pt => [(x * widthM) / imageDims.w, (y * depthM) / imageDims.h];
  const mToPx = ([x, y]: Pt): Pt => [(x * imageDims.w) / widthM, (y * imageDims.h) / depthM];

  const onMouseDown = (e: MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      panStart.current = { cx: e.clientX, cy: e.clientY, vx: view.x, vy: view.y };
      dragMoved.current = false;
    }
  };
  const onMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!panStart.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((e.clientX - panStart.current.cx) * view.w) / rect.width;
    const dy = ((e.clientY - panStart.current.cy) * view.h) / rect.height;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragMoved.current = true;
    setView(v => ({ ...v, x: panStart.current!.vx - dx, y: panStart.current!.vy - dy }));
  };
  const onMouseUp = () => (panStart.current = null);
  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const pt = screenToSvg(e.clientX, e.clientY);
    if (!pt) return;
    const f = e.deltaY < 0 ? 0.85 : 1.18;
    setView(v => ({ x: pt[0] - (pt[0] - v.x) * f, y: pt[1] - (pt[1] - v.y) * f, w: v.w * f, h: v.h * f }));
  };

  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    if (e.shiftKey || dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    if (!selectedId) return;
    const pt = screenToSvg(e.clientX, e.clientY);
    if (!pt) return;
    if (pt[0] < 0 || pt[1] < 0 || pt[0] > imageDims.w || pt[1] > imageDims.h) return;
    setEntrances(prev => ({ ...prev, [selectedId]: { floorId, point: pxToM(pt) } }));
  };

  const clearEntrance = (id: string) =>
    setEntrances(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const addCustom = () => {
    const id = customId.trim();
    if (!id) return;
    if (!rows.some(r => r.id === id)) setRows(prev => [...prev, { id, name: id, group: "Custom" }]);
    setSelectedId(id);
    setCustomId("");
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(entrances, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "entrances.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const importJson = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(t => {
      try {
        const data = JSON.parse(t);
        if (data && typeof data === "object") setEntrances(data);
      } catch {
        alert("Invalid entrances JSON");
      }
    });
  };

  const strokeBase = Math.max(1.5, view.w / 600);
  const fontBase = Math.max(8, view.w / 95);
  const sx = imageDims.w / widthM;
  const sy = imageDims.h / depthM;
  const groups = Array.from(new Set(rows.map(r => r.group)));
  const setCount = Object.keys(entrances).length;

  return (
    <div className="grid grid-cols-[2fr_1fr] h-screen bg-neutral-100">
      <div className="relative bg-neutral-200 overflow-hidden">
        {imageUrl ? (
          <>
            <svg
              ref={svgRef}
              viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
              className={`absolute inset-0 w-full h-full ${selectedId ? "cursor-crosshair" : "cursor-default"}`}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onClick={onClick}
              onWheel={onWheel}
              preserveAspectRatio="xMidYMid meet"
            >
              <image href={imageUrl} x={0} y={0} width={imageDims.w} height={imageDims.h} />
              {overlay.map((p, i) => {
                const hit = p.id === selectedId;
                const cx = (p.points.reduce((a, [x]) => a + x, 0) / p.points.length) * sx;
                const cy = (p.points.reduce((a, [, y]) => a + y, 0) / p.points.length) * sy;
                return (
                  <g key={`${p.id}-${i}`} pointerEvents="none">
                    <polygon
                      points={p.points.map(([x, y]) => `${x * sx},${y * sy}`).join(" ")}
                      fill={hit ? "rgba(233,30,99,0.18)" : "rgba(0,102,179,0.05)"}
                      stroke={hit ? "#E91E63" : "rgba(0,102,179,0.4)"}
                      strokeWidth={hit ? strokeBase * 1.2 : strokeBase * 0.6}
                      strokeDasharray={hit ? undefined : `${strokeBase * 2},${strokeBase * 2}`}
                    />
                    <text
                      x={cx}
                      y={cy}
                      fontSize={fontBase * 0.82}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={hit ? "#9D174D" : "#0A3A63"}
                      fontFamily="ui-monospace, monospace"
                      fontWeight={hit ? 700 : 600}
                      stroke="#fff"
                      strokeWidth={strokeBase * 0.6}
                      paintOrder="stroke"
                    >
                      {p.id}
                    </text>
                  </g>
                );
              })}
              {Object.entries(entrances)
                .filter(([, e]) => e.floorId === floorId)
                .map(([id, e]) => {
                  const [px, py] = mToPx(e.point);
                  const sel = id === selectedId;
                  return (
                    <g key={id} pointerEvents="none">
                      <circle
                        cx={px}
                        cy={py}
                        r={Math.max(4, view.w / 180)}
                        fill={sel ? "#E91E63" : "#0E7C7B"}
                        stroke="#fff"
                        strokeWidth={strokeBase}
                      />
                      <text
                        x={px}
                        y={py - Math.max(6, view.w / 120)}
                        fontSize={fontBase}
                        textAnchor="middle"
                        fill="#0E2C2C"
                        fontFamily="system-ui"
                        fontWeight={700}
                        stroke="#fff"
                        strokeWidth={strokeBase * 0.5}
                        paintOrder="stroke"
                      >
                        {id}
                      </text>
                    </g>
                  );
                })}
            </svg>
            <div className="absolute bottom-3 left-3 bg-white/90 rounded-lg shadow px-3 py-2 text-xs pointer-events-none">
              {selectedId ? (
                <span className="text-pink-700 font-semibold">
                  Click the map to set entrance for “{selectedId}” on {floorId}
                </span>
              ) : (
                <span>Pick an id on the right, then click its entrance on the map</span>
              )}
              <div className="text-neutral-500 mt-0.5">scroll = zoom · shift+drag = pan</div>
            </div>
          </>
        ) : (
          <div className="grid place-items-center h-full text-neutral-500">
            <div className="text-center p-8 max-w-md">
              <p className="mb-3 text-lg font-semibold">Load the floor plan image</p>
              <p className="text-sm mb-4">
                Same image as the polygon editor. Traced rooms show as blue outlines for reference.
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
            <input type="file" accept="image/*" onChange={onFile} className="block w-full mt-1 text-xs" />
          </label>
        </div>

        {savedAt && (
          <div className="mb-3 px-2 py-1.5 rounded bg-green-50 border border-green-200 text-xs text-green-800">
            ✓ Auto-saved {new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
            {setCount} entrance{setCount === 1 ? "" : "s"} set
          </div>
        )}

        <div
          className={`mb-3 px-2 py-1.5 rounded text-xs border ${
            disk.state === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : disk.state === "saving"
                ? "bg-blue-50 border-blue-200 text-blue-800"
                : disk.state === "error"
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-neutral-100 border-neutral-200 text-neutral-600"
          }`}
        >
          {disk.state === "ok" && <>💾 Saved to <code>{disk.msg}</code> · auto-updates on every change</>}
          {disk.state === "saving" && <>💾 Saving to public/data/entrances.json…</>}
          {disk.state === "error" && <>⚠ Disk save failed: {disk.msg} (run the Vite dev server)</>}
          {disk.state === "idle" && <>💾 Edits auto-save to <code>public/data/entrances.json</code></>}
        </div>

        <div className="flex gap-2 mb-3">
          <input
            value={customId}
            onChange={e => setCustomId(e.target.value)}
            placeholder="custom id (match backend)…"
            className="flex-1 min-w-0 px-2 py-1 rounded border border-neutral-300 text-xs font-mono"
          />
          <button onClick={addCustom} className="px-3 py-1 rounded bg-oth-primary text-white text-xs font-semibold">
            Add
          </button>
        </div>

        {groups.map(group => (
          <div key={group} className="mb-3">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">{group}</div>
            <ul className="space-y-1 text-xs">
              {rows
                .filter(r => r.group === group)
                .map(r => {
                  const ent = entrances[r.id];
                  const sel = r.id === selectedId;
                  return (
                    <li
                      key={r.id}
                      className={`flex items-center gap-2 p-1 rounded ${
                        sel ? "bg-pink-100 ring-1 ring-pink-400" : "hover:bg-neutral-200"
                      }`}
                    >
                      <button
                        onClick={() => setSelectedId(sel ? null : r.id)}
                        className="flex-1 text-left min-w-0"
                        title="Select, then click the map to set its entrance"
                      >
                        <span className="font-mono text-[10px] text-oth-primary">{r.id}</span>
                        <span className="block truncate text-neutral-700">{r.name}</span>
                        {r.targetRoom && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={ev => {
                              ev.stopPropagation();
                              setSelectedId(r.targetRoom!);
                            }}
                            title={
                              r.targetExists
                                ? `Routes to ${r.targetRoom} — pin the entrance on that room instead`
                                : `${r.targetRoom} isn't traced yet → falls back to ServiceSG (L1-room-psc)`
                            }
                            className={`mt-0.5 inline-block font-mono text-[9px] px-1 rounded cursor-pointer ${
                              r.targetExists
                                ? "bg-teal-50 text-teal-700 hover:bg-teal-100"
                                : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                            }`}
                          >
                            → {r.targetRoom}
                            {!r.targetExists && " (stub)"}
                          </span>
                        )}
                      </button>
                      {ent ? (
                        <span className="text-[10px] text-green-700 font-semibold whitespace-nowrap">
                          ✓ {ent.floorId}
                        </span>
                      ) : (
                        <span className="text-[10px] text-neutral-400">—</span>
                      )}
                      {ent && (
                        <button
                          onClick={() => clearEntrance(r.id)}
                          className="text-red-600 text-base leading-none"
                          aria-label="Clear entrance"
                        >
                          ×
                        </button>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}

        <button
          onClick={() => saveToDisk(entrances)}
          disabled={disk.state === "saving"}
          className="w-full px-3 py-2 rounded bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {disk.state === "saving" ? "Saving…" : "Save entrances.json"}
        </button>
        <button
          onClick={exportJson}
          disabled={setCount === 0}
          className="w-full mt-2 px-3 py-1.5 rounded border border-neutral-300 text-neutral-600 text-xs font-semibold disabled:opacity-40"
        >
          Download a copy (fallback)
        </button>
        <label className="block mt-2 text-xs font-semibold text-neutral-700">
          Import entrances.json
          <input type="file" accept="application/json" onChange={importJson} className="block w-full mt-1 text-xs" />
        </label>

        <details className="mt-4 text-xs text-neutral-600" open>
          <summary className="cursor-pointer font-semibold">How to use</summary>
          <ul className="list-disc pl-4 mt-2 space-y-1">
            <li>Load the floor image; pick the floor the entrance is on.</li>
            <li>
              Click an id on the right (or add a custom one matching the backend), then click the
              spot on the map where people enter — put it on a walkway/open area in front of the door.
            </li>
            <li>The id is the official key routing uses. Keep it identical to the backend's id.</li>
            <li>
              Export <code>entrances.json</code> into <code>public/data/</code>. Routing then targets
              the entrance instead of the building centre; unset ids fall back to the room centre.
            </li>
          </ul>
        </details>
      </div>
    </div>
  );
}
