import { Printer, ArrowLeft } from "phosphor-react";
import { PERSONAS, SERVICES, RECS, moodFor, Avatar } from "./cast";

/**
 * Business-ready, print/PDF-friendly report. Editorial-clean aesthetic to match
 * the dashboard. Opened from "Generate report" at /#report. MOCK cast data.
 */

const SEV_ORDER = { high: 0, med: 1, low: 2 } as const;
const barTone = (v: number) => (v > 70 ? "bg-rose-400" : v > 45 ? "bg-amber-400" : "bg-emerald-400");

export function ReportView() {
  const residents = PERSONAS.length;
  const avgEffort = Math.round(PERSONAS.reduce((a, p) => a + p.effort, 0) / residents);
  const totalWaitMin = PERSONAS.reduce((a, p) => a + p.waitMinutes, 0);
  const hardest = [...SERVICES].sort((a, b) => b.avgEffort - a.avgEffort)[0];
  const recs = [...RECS].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const today = new Date().toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-[#F7F7F8] py-10 text-oth-ink antialiased print:bg-white print:py-0">
      <style>{`@media print { @page { margin: 16mm; } .no-print { display: none !important; } }`}</style>

      {/* Toolbar (screen only) */}
      <div className="no-print mx-auto mb-5 flex max-w-[840px] items-center justify-between px-4">
        <button onClick={() => { window.location.hash = "#dashboard"; window.location.reload(); }} className="flex items-center gap-1.5 text-sm font-semibold text-neutral-500 transition hover:text-oth-primary">
          <ArrowLeft size={16} weight="bold" /> Back to dashboard
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-full bg-oth-ink px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 active:scale-95">
          <Printer size={16} weight="bold" /> Print / Save as PDF
        </button>
      </div>

      {/* Document */}
      <article className="mx-auto max-w-[840px] rounded-2xl bg-white p-14 shadow-[0_2px_40px_rgba(0,0,0,0.06)] ring-1 ring-neutral-200/70 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0">
        {/* Letterhead */}
        <header>
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-sm bg-oth-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">One Tampines Hub · Accessibility Study</span>
          </div>
          <h1 className="mt-4 text-[40px] font-extrabold leading-[1.05] tracking-tight">Service Accessibility Report</h1>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-neutral-500">
            How real residents experience reaching government &amp; community services across the Hub — and where to fix the friction.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-1 border-t border-neutral-200 pt-4 text-xs font-medium text-neutral-400">
            <span><span className="text-neutral-300">Generated</span>&nbsp;&nbsp;{today}</span>
            <span><span className="text-neutral-300">Scenario</span>&nbsp;&nbsp;Weekday morning</span>
            <span><span className="text-neutral-300">Prepared for</span>&nbsp;&nbsp;Tampines Grassroots &amp; partner agencies</span>
          </div>
        </header>

        {/* Executive summary */}
        <section className="mt-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Executive summary</h2>
          <p className="mt-3 text-[17px] leading-[1.7] text-neutral-700">
            We simulated <strong className="font-bold text-oth-ink">{residents} representative Tampines residents</strong> — differing in age, mobility,
            language, and digital comfort — as they attempted real errands at One Tampines Hub. The average journey scored{" "}
            <strong className="font-bold text-oth-ink">{avgEffort}/100 on effort</strong>, with{" "}
            <strong className="font-bold text-oth-ink">{totalWaitMin} minutes</strong> of queueing across the group. The single greatest barrier is{" "}
            <strong className="font-bold text-oth-ink">{hardest.name}</strong> ({hardest.floorLabel}) — sitting outside OTH, it forces affected
            residents to leave and return. Our top recommendation is to bring an intake point for it <em>into</em> the Hub.
          </p>
        </section>

        {/* Key metrics */}
        <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { v: `${residents}`, l: "Residents simulated" },
            { v: `${avgEffort}`, l: "Avg effort / 100" },
            { v: `${totalWaitMin}`, l: "Minutes queued" },
            { v: hardest.floorLabel, l: `Hardest to reach` },
          ].map((m, i) => (
            <div key={i} className="rounded-2xl border border-neutral-200/80 p-4">
              <div className="text-3xl font-extrabold tracking-tight text-oth-primary tabular-nums">{m.v}</div>
              <div className="mt-1 text-[11px] font-medium leading-tight text-neutral-400">{m.l}</div>
            </div>
          ))}
        </section>

        {/* What we found */}
        <section className="mt-12">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-oth-primary" />
            <h2 className="text-xl font-extrabold tracking-tight">What we found</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-neutral-500">Effort to reach each service, averaged across the residents who needed it — higher is harder.</p>
          <div className="mt-5 space-y-4">
            {[...SERVICES].sort((a, b) => b.avgEffort - a.avgEffort).map(s => (
              <div key={s.name}>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="font-semibold">{s.name} <span className="font-normal text-neutral-400">· {s.floorLabel}{s.flag ? ` · ${s.flag}` : ""}</span></span>
                  <span className="text-xs font-bold tabular-nums text-neutral-400">{s.avgEffort}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div className={`h-full rounded-full ${barTone(s.avgEffort)}`} style={{ width: `${s.avgEffort}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recommended actions */}
        <section className="mt-12">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-oth-primary" />
            <h2 className="text-xl font-extrabold tracking-tight">Recommended actions</h2>
          </div>
          <ol className="mt-5 space-y-5">
            {recs.map((r, i) => (
              <li key={r.id} className="flex gap-4 break-inside-avoid">
                <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border border-oth-primary/30 text-sm font-extrabold text-oth-primary">{i + 1}</span>
                <div className="min-w-0 flex-1 border-b border-neutral-100 pb-5">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${r.severity === "high" ? "bg-rose-500" : "bg-amber-500"}`} />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{r.severity} priority</span>
                    <span className="text-[10px] font-semibold text-neutral-300">·</span>
                    <span className="text-xs font-bold text-neutral-500">{r.service}</span>
                  </div>
                  <p className="mt-1.5 text-[16px] font-semibold leading-snug">{r.action}</p>
                  <div className="mt-2.5 grid gap-1.5 text-xs leading-relaxed text-neutral-500 sm:grid-cols-[1fr_auto] sm:gap-6">
                    <p><span className="font-semibold uppercase tracking-wide text-neutral-400">Why · </span>{r.evidence}</p>
                    <p className="sm:text-right sm:whitespace-nowrap"><span className="font-semibold uppercase tracking-wide text-neutral-400">Effort · </span>{r.effort}</p>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-neutral-400">Helps</span>
                    {r.affected.map(id => {
                      const p = PERSONAS.find(x => x.id === id);
                      return p ? (
                        <span key={id} className="flex items-center gap-1.5 rounded-full bg-neutral-100 py-0.5 pl-0.5 pr-2.5 text-[11px] font-semibold text-neutral-600">
                          <Avatar p={p} size="h-5 w-5 text-[11px]" /> {p.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Who we simulated */}
        <section className="mt-12 break-inside-avoid">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-oth-primary" />
            <h2 className="text-xl font-extrabold tracking-tight">Who we simulated</h2>
          </div>
          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-[10px] uppercase tracking-[0.1em] text-neutral-400">
                <th className="pb-2 font-semibold">Resident</th>
                <th className="pb-2 font-semibold">Their errand</th>
                <th className="pb-2 text-right font-semibold">Effort</th>
                <th className="pb-2 pl-4 text-right font-semibold">Felt</th>
              </tr>
            </thead>
            <tbody>
              {PERSONAS.map(p => {
                const mood = moodFor(p.effort);
                return (
                  <tr key={p.id} className="border-b border-neutral-100 align-middle">
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar p={p} size="h-9 w-9 text-base" />
                        <div>
                          <div className="font-bold leading-tight">{p.name}</div>
                          <div className="text-[11px] text-neutral-400">{p.age} · {p.archetype}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-neutral-600">{p.intent}</td>
                    <td className="py-3 text-right font-bold tabular-nums text-neutral-500">{p.effort}</td>
                    <td className="py-3 pl-4 text-right whitespace-nowrap">{mood.face} <span className="text-[11px] text-neutral-500">{mood.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Methodology */}
        <section className="mt-10 rounded-2xl bg-neutral-50 p-5 text-[11px] leading-relaxed text-neutral-500 print:border print:border-neutral-200 print:bg-white">
          <span className="font-semibold uppercase tracking-wide text-neutral-400">Methodology · </span>
          Each resident is a representative persona with an intent. We route their errands through a 3D model of OTH and score every
          journey on an <em>effort</em> model — walking distance, floor changes, queue waiting, and trips out of the building — read against
          live service load. Recommendations are generated by rules that detect ranked friction patterns, then phrased from the evidence.
          <span className="mt-1 block italic text-neutral-400">Demo note: persona figures and reviews are illustrative placeholders pending the live simulation.</span>
        </section>

        <footer className="mt-6 text-[10px] text-neutral-300">OTH Navigator · Service Fragmentation Lens · {today}</footer>
      </article>
    </div>
  );
}
