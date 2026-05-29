import { useState, type ReactNode } from "react";
import { useStore } from "@/store";
import {
  Tag,
  ArrowsClockwise,
  Sun,
  SunHorizon,
  MoonStars,
  PersonSimpleWalk,
  Sparkle,
  Sliders,
  NavigationArrow,
  X,
} from "phosphor-react";

// Canonical bottom-to-top order; the rail shows only the floors actually loaded
// (so L3 appears automatically once its plan is traced, and not before).
const FLOOR_ORDER = ["L1", "L2", "L3"] as const;

const TIME_ICON = {
  morning: { Icon: Sun, label: "Morning" },
  evening: { Icon: SunHorizon, label: "Evening" },
  night: { Icon: MoonStars, label: "Night" },
} as const;

/** A labelled row inside the View options popover. */
function OptionRow({
  icon,
  label,
  value,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-neutral-100 active:scale-[0.98]"
    >
      <span
        className={`grid h-8 w-8 place-items-center rounded-lg ${
          active ? "bg-oth-primary text-white" : "bg-neutral-100 text-neutral-500"
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 text-sm font-semibold text-oth-ink">{label}</span>
      <span
        className={`text-xs font-bold ${active ? "text-oth-primary" : "text-neutral-400"}`}
      >
        {value}
      </span>
    </button>
  );
}

export function FloorSelector() {
  const activeFloor = useStore(s => s.activeFloor);
  const setActiveFloor = useStore(s => s.setActiveFloor);
  const floors = useStore(s => s.floors);
  const activeRoute = useStore(s => s.activeRoute);
  // Only floors that actually loaded — rendering a fixed fallback (e.g. L1/L2)
  // before the bundle resolves makes later floors like L3 "pop in" a beat late.
  const railFloors = FLOOR_ORDER.filter(id => floors.some(f => f.id === id));
  const cameraFollow = useStore(s => s.cameraFollow);
  const toggleCameraFollow = useStore(s => s.toggleCameraFollow);
  const inspectMode = useStore(s => s.inspectMode);
  const firstPerson = useStore(s => s.firstPerson);
  const showLabels = useStore(s => s.showLabels);
  const toggleInspectMode = useStore(s => s.toggleInspectMode);
  const toggleFirstPerson = useStore(s => s.toggleFirstPerson);
  const toggleLabels = useStore(s => s.toggleLabels);
  const timeOfDay = useStore(s => s.timeOfDay);
  const cycleTimeOfDay = useStore(s => s.cycleTimeOfDay);
  const effectsEnabled = useStore(s => s.effectsEnabled);
  const toggleEffects = useStore(s => s.toggleEffects);
  const tileSizeM = useStore(s => s.tileSizeM);
  const setTileSize = useStore(s => s.setTileSize);

  const [optionsOpen, setOptionsOpen] = useState(false);

  return (
    <>
      {/* Right rail: floor switch + a single options entry point. */}
      <div className="absolute right-2 top-2 z-30 flex flex-col items-end gap-2">
        <div className="flex flex-col overflow-hidden rounded-2xl bg-white/90 shadow-md backdrop-blur">
          {railFloors.map(f => (
            <button
              key={f}
              onClick={() => setActiveFloor(f)}
              aria-pressed={activeFloor === f}
              className={`h-11 w-11 text-base font-bold transition ${
                activeFloor === f
                  ? "bg-oth-primary text-white"
                  : "text-oth-ink hover:bg-neutral-100"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <button
          onClick={() => setOptionsOpen(o => !o)}
          aria-label="View options"
          aria-expanded={optionsOpen}
          className={`grid h-11 w-11 place-items-center rounded-full shadow-md backdrop-blur transition ${
            optionsOpen ? "bg-oth-primary text-white" : "bg-white/90 text-oth-ink"
          }`}
        >
          <Sliders size={20} weight="bold" />
        </button>

        {/* GPS-style follow camera — only meaningful while guiding. */}
        {activeRoute && (
          <button
            onClick={toggleCameraFollow}
            aria-label="Follow me (GPS view)"
            aria-pressed={cameraFollow}
            title="Follow me — close top-down view"
            className={`grid h-11 w-11 place-items-center rounded-full shadow-md backdrop-blur transition active:scale-95 ${
              cameraFollow ? "bg-oth-primary text-white" : "bg-white/90 text-oth-ink"
            }`}
          >
            <NavigationArrow size={20} weight={cameraFollow ? "fill" : "bold"} />
          </button>
        )}
      </div>

      {/* View options popover — every non-essential control lives here, with
          plain-language labels instead of mystery icons. */}
      {optionsOpen && (
        <div className="absolute right-2 top-2 z-40 w-60 rounded-2xl bg-white p-2 shadow-2xl ring-1 ring-black/5">
          <div className="flex items-center justify-between px-1.5 pb-1.5 pt-0.5">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              View options
            </span>
            <button
              onClick={() => setOptionsOpen(false)}
              aria-label="Close"
              className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
            >
              <X size={16} weight="bold" />
            </button>
          </div>

          <OptionRow
            icon={<Tag size={18} weight="bold" />}
            label="Map labels"
            value={showLabels ? "On" : "Off"}
            active={showLabels}
            onClick={toggleLabels}
          />
          <OptionRow
            icon={<ArrowsClockwise size={18} weight="bold" />}
            label="Rotate & tilt"
            value={inspectMode ? "On" : "Off"}
            active={inspectMode}
            onClick={toggleInspectMode}
          />
          <OptionRow
            icon={<PersonSimpleWalk size={18} weight="bold" />}
            label="Walk mode"
            value={firstPerson ? "On" : "Off"}
            active={firstPerson}
            onClick={toggleFirstPerson}
          />
          <OptionRow
            icon={(() => {
              const I = TIME_ICON[timeOfDay].Icon;
              return <I size={18} weight="bold" />;
            })()}
            label="Daylight"
            value={TIME_ICON[timeOfDay].label}
            active
            onClick={cycleTimeOfDay}
          />
          <OptionRow
            icon={<Sparkle size={18} weight={effectsEnabled ? "fill" : "bold"} />}
            label="Visual effects"
            value={effectsEnabled ? "On" : "Off"}
            active={effectsEnabled}
            onClick={toggleEffects}
          />

          <label className="mt-1 flex items-center gap-3 rounded-xl px-2.5 py-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-neutral-100 text-neutral-500 text-base font-bold">
              ▦
            </span>
            <span className="flex-1 text-sm font-semibold text-oth-ink">Floor tile size</span>
            <input
              type="number"
              step={0.1}
              min={0.3}
              max={20}
              value={tileSizeM}
              onChange={e => setTileSize(parseFloat(e.target.value) || tileSizeM)}
              className="w-14 rounded-lg bg-neutral-100 px-2 py-1 text-right text-sm font-semibold"
            />
            <span className="text-xs font-semibold text-neutral-400">m</span>
          </label>
        </div>
      )}

      {firstPerson && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-30 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
          Click to look · WASD move · Shift sprint · Esc to exit
        </div>
      )}
    </>
  );
}
