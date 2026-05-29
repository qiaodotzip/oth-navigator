import { useEffect, useRef, useState } from "react";
import { Play, ArrowClockwise, ArrowUpRight, Quotes, FastForward, Lightning } from "phosphor-react";
import { useStore } from "@/store";
import { Scene } from "@/world/Scene";
import { loadDataBundle } from "@/data/loaders";
import { buildRoute, DEFAULT_START, routeArrivalLocation } from "@/routing/buildRoute";
import type { AccessibilityProfile } from "@/data/types";
import { PERSONAS, SERVICES, RECS, moodFor, Avatar, type Persona } from "./cast";

/**
 * Service Fragmentation Lens — dashboard as a LIVE SWARM SIMULATION.
 * Press Run → N agents (VITE_SIM_AGENTS) are simulated in parallel, drawn from
 * the 4 resident archetypes. The camera follows ONE hero through the real 3D
 * model while a live feed ticks off every agent that finishes and per-archetype
 * tallies climb → verdict + report. Persona stats are MOCK; the hero replay is
 * real routing.
 */

const N = (() => {
  const raw = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SIM_AGENTS;
  const n = raw ? parseInt(raw, 10) : 24;
  return Number.isFinite(n) ? Math.max(4, Math.min(500, n)) : 24;
})();

const NAMES = ["Mei", "Kumar", "Fatimah", "Wei Ming", "Devi", "Hafiz", "Siew Ling", "Arun", "Noraini", "Jun Jie", "Lakshmi", "Aishah", "Boon Hwee", "Rajesh", "Halimah", "Xiao Hui"];
const barTone = (v: number) => (v > 70 ? "bg-rose-400" : v > 45 ? "bg-amber-400" : "bg-emerald-400");
const topFix = RECS.find(r => r.severity === "high") ?? RECS[0];
const HERO = [...PERSONAS].sort((a, b) => b.effort - a.effort)[0]; // worst journey = most cinematic
const jitter = (base: number, spread: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(base + (Math.random() * 2 - 1) * spread)));

type FeedItem = { key: number; persona: Persona; name: string; effort: number };
type Tally = Record<string, { count: number; sumEffort: number }>;

export function Dashboard() {
  const floors = useStore(s => s.floors);
  const ready = floors.length > 0;

  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [count, setCount] = useState(0);
  const [avgEffort, setAvgEffort] = useState(0);
  const [totalWait, setTotalWait] = useState(0);
  const [tally, setTally] = useState<Tally>({});
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [selectedId, setSelectedId] = useState(HERO.id);
  const [replaying, setReplaying] = useState(false);

  // streaming accumulators (source of truth; mirrored to state each tick)
  const cRef = useRef(0);
  const sumEffRef = useRef(0);
  const sumWaitRef = useRef(0);
  const tallyRef = useRef<Tally>({});
  const feedRef = useRef<FeedItem[]>([]);
  const keyRef = useRef(0);
  const swarm = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);

  // hero map replay
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const rep = useRef<{ persona: Persona; stopIdx: number; arrival: { floorId: typeof DEFAULT_START.floorId; point: [number, number] } } | null>(null);
  const loopHero = useRef(false);

  const focus = PERSONAS.find(p => p.id === selectedId)!;

  useEffect(() => {
    if (useStore.getState().floors.length) return;
    loadDataBundle().then(b => { useStore.getState().setBundle(b); useStore.getState().setEntrances(b.entrances ?? {}); }).catch(() => {});
  }, []);

  // ---- hero map replay (one agent, looped while running) ----
  const startStop = (persona: Persona, i: number, start: { floorId: typeof DEFAULT_START.floorId; point: [number, number] }): boolean => {
    const st = useStore.getState();
    const svc = st.services.find(s => s.id === persona.stops[i].serviceId);
    if (!svc) return false;
    const profile: AccessibilityProfile = persona.mobility === "low" ? "stepFree" : "default";
    const v = buildRoute(start, svc, profile, st.floors, st.entrances, st.counterLoads);
    if (!v) return false;
    useStore.setState({ activeFloor: v.steps[0].floorId });
    st.startRoute(v);
    rep.current = { persona, stopIdx: i, arrival: routeArrivalLocation(v) };
    return true;
  };
  const stopHero = () => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    setReplaying(false);
    rep.current = null;
    useStore.getState().endRoute();
    useStore.setState({ cameraFollow: false, inspectMode: true });
  };
  const beginHero = (persona: Persona, loop: boolean) => {
    stopHero();
    loopHero.current = loop;
    if (!useStore.getState().floors.length) return;
    useStore.setState({ cameraFollow: true, inspectMode: false, firstPerson: false });
    if (!startStop(persona, 0, DEFAULT_START)) return;
    setReplaying(true);
  };
  useEffect(() => {
    if (!replaying) return;
    tick.current = setInterval(() => {
      const st = useStore.getState();
      const r = st.activeRoute;
      const cur = rep.current;
      if (!r || !cur) return;
      if (r.currentWaypointIndex < r.variant.steps.length - 1) { st.advanceRoute(); return; }
      const nextStop = cur.stopIdx + 1;
      if (nextStop < cur.persona.stops.length) { startStop(cur.persona, nextStop, cur.arrival); return; }
      // journey complete
      if (loopHero.current && runningRef.current) startStop(cur.persona, 0, DEFAULT_START);
      else stopHero();
    }, 1400);
    return () => { if (tick.current) clearInterval(tick.current); };
  }, [replaying]);

  // ---- the swarm ----
  const completeOne = () => {
    const arch = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
    const effort = jitter(arch.effort, 14, 5, 100);
    const wait = jitter(arch.waitMinutes, 5, 0, 40);
    cRef.current += 1;
    sumEffRef.current += effort;
    sumWaitRef.current += wait;
    const t = tallyRef.current[arch.id] ?? { count: 0, sumEffort: 0 };
    tallyRef.current[arch.id] = { count: t.count + 1, sumEffort: t.sumEffort + effort };
    feedRef.current = [{ key: keyRef.current++, persona: arch, name: NAMES[Math.floor(Math.random() * NAMES.length)], effort }, ...feedRef.current].slice(0, 7);
  };
  const mirror = () => {
    setCount(cRef.current);
    setAvgEffort(cRef.current ? Math.round(sumEffRef.current / cRef.current) : 0);
    setTotalWait(sumWaitRef.current);
    setTally({ ...tallyRef.current });
    setFeed([...feedRef.current]);
  };
  const finishSim = () => {
    if (swarm.current) clearInterval(swarm.current);
    swarm.current = null;
    runningRef.current = false;
    stopHero();
    mirror();
    setSelectedId(HERO.id);
    setPhase("done");
  };
  const runSimulation = () => {
    if (!ready) return;
    if (swarm.current) clearInterval(swarm.current);
    cRef.current = 0; sumEffRef.current = 0; sumWaitRef.current = 0; tallyRef.current = {}; feedRef.current = []; keyRef.current = 0;
    mirror();
    setPhase("running");
    runningRef.current = true;
    beginHero(HERO, true);
    const targetMs = Math.max(6000, Math.min(15000, N * 60));
    const interval = Math.max(30, Math.min(350, Math.round(targetMs / N)));
    swarm.current = setInterval(() => {
      completeOne();
      mirror();
      if (cRef.current >= N) finishSim();
    }, interval);
  };
  const skip = () => {
    while (cRef.current < N) completeOne();
    finishSim();
  };

  useEffect(() => () => { if (swarm.current) clearInterval(swarm.current); stopHero(); }, []);

  return (
    <div className="min-h-screen bg-[#F7F7F8] text-oth-ink antialiased">
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}} @keyframes feedIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}`}</style>

      {/* Header */}
      <header className="border-b border-neutral-200/80 bg-white px-8 py-6">
        <div className="mx-auto flex max-w-6xl items-end justify-between gap-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">One Tampines Hub</div>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Service Fragmentation Lens</h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-neutral-500">
              Simulate {N} Tampines residents moving through the Hub and watch where reaching a service breaks down.
            </p>
          </div>
          <button
            onClick={() => window.open(`${location.origin}${location.pathname}#report`, "_blank", "noopener")}
            disabled={phase !== "done"}
            className="flex flex-shrink-0 items-center gap-2 rounded-full bg-oth-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Generate report <ArrowUpRight size={16} weight="bold" />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-8">
        {/* Run control strip */}
        <section className="mt-6 rounded-3xl border border-neutral-200/80 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {phase === "idle" && (
                <button onClick={runSimulation} disabled={!ready} className="flex items-center gap-2.5 rounded-full bg-oth-primary px-6 py-3 text-base font-bold text-white shadow-md transition hover:brightness-110 active:scale-95 disabled:opacity-50">
                  <Play size={18} weight="fill" /> Run simulation
                </button>
              )}
              {phase === "running" && (
                <div className="flex items-baseline gap-2.5">
                  <span className="relative flex h-2.5 w-2.5 self-center"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-oth-primary opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-oth-primary" /></span>
                  <span className="text-3xl font-extrabold tabular-nums tracking-tight">{count.toLocaleString()}</span>
                  <span className="text-base font-semibold text-neutral-400">/ {N} residents</span>
                </div>
              )}
              {phase === "done" && (
                <div className="flex items-center gap-3">
                  <button onClick={runSimulation} className="flex items-center gap-2 rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-50 active:scale-95">
                    <ArrowClockwise size={16} weight="bold" /> Run again
                  </button>
                  <span className="text-sm font-semibold text-neutral-400"><span className="font-extrabold text-oth-ink">{count.toLocaleString()}</span> residents simulated</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right"><div className="text-2xl font-extrabold tabular-nums tracking-tight">{count ? avgEffort : "—"}</div><div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">avg effort</div></div>
              <div className="text-right"><div className="text-2xl font-extrabold tabular-nums tracking-tight">{count ? totalWait.toLocaleString() : "—"}<span className="text-sm">m</span></div><div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">total queued</div></div>
              {phase === "running" && (
                <button onClick={skip} className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-4 py-2 text-xs font-bold text-neutral-500 transition hover:bg-neutral-200"><FastForward size={13} weight="fill" /> Skip</button>
              )}
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-neutral-400"><span>Fragmentation</span><span>{Math.round((count / N) * 100)}%</span></div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100"><div className={`h-full rounded-full transition-all duration-300 ${barTone(avgEffort)}`} style={{ width: `${count ? avgEffort : 0}%` }} /></div>
          </div>
        </section>

        {/* Archetype tallies */}
        <section className="mt-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {PERSONAS.map(p => {
              const t = tally[p.id];
              const avg = t ? Math.round(t.sumEffort / t.count) : p.effort;
              const mood = moodFor(avg);
              return (
                <button key={p.id} onClick={() => phase === "done" && (setSelectedId(p.id), beginHero(p, false))} disabled={phase !== "done"}
                  className={`flex items-center gap-3.5 rounded-2xl border bg-white p-4 text-left transition-all duration-300 ${p.id === selectedId && phase !== "idle" ? "border-oth-primary/40 ring-1 ring-oth-primary/20" : "border-neutral-200/80"} ${phase === "done" ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""}`}>
                  <Avatar p={p} size="h-12 w-12 text-2xl" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-bold leading-tight">{p.archetype.split(" · ")[0]}</div>
                    <div className="truncate text-[11px] font-medium text-neutral-400">like {p.name}</div>
                    {phase === "idle" ? (
                      <div className="mt-1 text-[11px] font-medium text-neutral-300">ready</div>
                    ) : (
                      <div className={`mt-1 flex items-center gap-1.5 text-[11px] font-bold ${mood.tone}`}>
                        <span className="tabular-nums">×{t?.count ?? 0}</span><span className="text-neutral-300">·</span><span>avg {avg}</span> {mood.face}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Stage: map + (live feed while running / story when done) */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
          <div className="relative h-[480px] overflow-hidden rounded-3xl bg-neutral-100 ring-1 ring-neutral-200/80">
            {ready ? <Scene /> : <div className="grid h-full place-items-center text-sm font-medium text-neutral-400">Loading the building…</div>}
            {phase === "idle" && ready && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-white/30 backdrop-blur-[1px]">
                <div className="rounded-2xl bg-white/90 px-5 py-3 text-center shadow-lg"><div className="text-sm font-bold">Press <span className="text-oth-primary">Run simulation</span></div><div className="text-xs text-neutral-500">to send {N} residents through the Hub</div></div>
              </div>
            )}
            {phase !== "idle" && (
              <div className="absolute left-4 top-4 rounded-full bg-white/85 px-3.5 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur">
                {replaying ? `Following ${focus.name} ${focus.emoji}` : `${focus.name}`}{phase === "running" ? " · + " + (count > 0 ? count - 1 : 0).toLocaleString() + " more" : ""}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {phase === "running" ? (
              <div className="rounded-3xl border border-neutral-200/80 bg-white p-5">
                <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-oth-primary opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-oth-primary" /></span>Live results</div>
                <ul className="space-y-1.5">
                  {feed.map(f => {
                    const m = moodFor(f.effort);
                    return (
                      <li key={f.key} className="flex items-center gap-2.5 rounded-xl bg-neutral-50 px-2.5 py-2" style={{ animation: "feedIn 0.25s ease" }}>
                        <Avatar p={f.persona} size="h-7 w-7 text-sm" />
                        <div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{f.name}</div><div className="truncate text-[10px] text-neutral-400">{f.persona.archetype.split(" · ")[0]}</div></div>
                        <span className={`text-xs font-bold tabular-nums ${m.tone}`}>{f.effort}</span>
                        <span className="text-sm">{m.face}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <>
                <div className="rounded-3xl border border-neutral-200/80 bg-white p-5">
                  <div className="flex items-center gap-3.5"><Avatar p={focus} size="h-14 w-14 text-3xl" /><div><div className="text-lg font-extrabold tracking-tight">{focus.name}</div><div className="text-xs font-medium text-neutral-400">{focus.age} · {focus.archetype} · {focus.langFirst}</div></div></div>
                  <blockquote className="mt-4 border-l-2 border-oth-primary/30 pl-3.5 text-[15px] italic leading-relaxed text-neutral-600">{focus.intent}</blockquote>
                  <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-neutral-200/70 text-center">
                    {[[`${focus.walkMetres} m`, "walked"], [`${focus.floorChanges}`, "floor changes"], [`${focus.waitMinutes} min`, "queueing"], [`~${focus.wallClockMin} min`, "total"]].map(([v, l], i) => (
                      <div key={i} className="bg-white py-2.5"><div className="text-base font-extrabold tracking-tight">{v}</div><div className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">{l}</div></div>
                    ))}
                  </div>
                </div>
                {phase === "done" && (
                  <div className="rounded-3xl border border-neutral-200/80 bg-white p-5"><div className="mb-1.5 flex items-center gap-2"><span className="text-xl">{moodFor(focus.effort).face}</span><span className={`text-xs font-bold ${moodFor(focus.effort).tone}`}>{moodFor(focus.effort).label}</span></div><p className="flex gap-2 text-[15px] leading-relaxed text-neutral-600"><Quotes size={18} weight="fill" className="mt-1 flex-shrink-0 text-neutral-200" />{focus.review}</p></div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Results */}
        {phase === "done" && (
          <div className="mt-6 space-y-5" style={{ animation: "fadeIn 0.5s ease" }}>
            <div className="overflow-hidden rounded-3xl border border-oth-primary/20 bg-gradient-to-br from-oth-primary/5 to-white p-6">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-oth-primary"><Lightning size={14} weight="fill" /> The verdict</div>
              <p className="mt-2 max-w-2xl text-xl font-extrabold leading-snug tracking-tight">Across {count.toLocaleString()} residents, {topFix.service} is the biggest barrier.</p>
              <p className="mt-1.5 max-w-2xl text-sm text-neutral-500">{topFix.evidence}</p>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-neutral-700">{topFix.action}</p>
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="rounded-3xl border border-neutral-200/80 bg-white p-6">
                <h3 className="mb-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Hardest services to reach</h3>
                <div className="space-y-4">
                  {[...SERVICES].sort((a, b) => b.avgEffort - a.avgEffort).map(s => (
                    <div key={s.name}>
                      <div className="mb-1.5 flex items-baseline justify-between text-sm"><span className="font-semibold">{s.name} <span className="font-normal text-neutral-400">· {s.floorLabel}</span></span><span className="text-xs font-bold tabular-nums text-neutral-400">{s.avgEffort}</span></div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100"><div className={`h-full rounded-full ${barTone(s.avgEffort)}`} style={{ width: `${s.avgEffort}%` }} /></div>
                      {s.flag && <div className="mt-1 text-[11px] font-medium text-neutral-400">{s.flag}</div>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {RECS.map(r => (
                  <div key={r.id} className="rounded-2xl border border-neutral-200/80 bg-white p-4">
                    <div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${r.severity === "high" ? "bg-rose-500" : "bg-amber-500"}`} /><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{r.severity} · {r.service}</span></div>
                    <p className="mt-1.5 text-sm font-semibold leading-snug">{r.action}</p>
                    <div className="mt-2 flex items-center gap-1.5"><span className="text-[10px] font-medium text-neutral-400">Helps</span>{r.affected.map(id => { const p = PERSONAS.find(x => x.id === id); return p ? <Avatar key={id} p={p} size="h-5 w-5 text-[11px]" /> : null; })}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="py-8 text-center text-[10px] text-neutral-400">Persona stats &amp; reviews are mock; the hero replay drives the real routing engine. Set <code>VITE_SIM_AGENTS</code> to change the crowd size.</div>
      </div>
    </div>
  );
}
