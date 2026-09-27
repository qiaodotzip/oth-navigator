const FILL = { accent: "bg-accent", proposed: "bg-proposed", confirmed: "bg-confirmed" } as const;

/** A thin bar that carries its numbers for assistive tech, not just its colour. */
export function Progress({
  value,
  max,
  label,
  tone = "accent",
}: {
  value: number;
  max: number;
  label: string;
  tone?: keyof typeof FILL;
}) {
  const now = Math.min(value, max);
  const pct = max > 0 ? Math.round((now / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      className="h-1.5 overflow-hidden rounded-full bg-stone-200"
    >
      <div className={`h-full ${FILL[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
