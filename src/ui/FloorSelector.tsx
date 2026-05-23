import { useStore } from "@/store";
import {
  Tag,
  ArrowsClockwise,
  Sun,
  SunHorizon,
  MoonStars,
  PersonSimpleWalk,
  Sparkle,
} from "phosphor-react";

const FLOORS = ["L1", "L2"] as const;

const TIME_ICON = {
  morning: { Icon: Sun, label: "Morning" },
  evening: { Icon: SunHorizon, label: "Evening" },
  night: { Icon: MoonStars, label: "Night" },
} as const;

export function FloorSelector() {
  const activeFloor = useStore(s => s.activeFloor);
  const setActiveFloor = useStore(s => s.setActiveFloor);
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
  const TimeIcon = TIME_ICON[timeOfDay].Icon;

  return (
    <>
    <div className="absolute right-2 top-2 z-30 flex flex-col gap-1">
      {FLOORS.map(f => (
        <button
          key={f}
          onClick={() => setActiveFloor(f)}
          className={`w-10 h-10 rounded-full font-semibold text-sm ${
            activeFloor === f
              ? "bg-oth-primary text-white"
              : "bg-white/80 text-oth-ink"
          }`}
        >
          {f}
        </button>
      ))}
      <button
        onClick={toggleInspectMode}
        title={inspectMode ? "Lock to top-down" : "Free rotate"}
        aria-label="Toggle camera rotation"
        className={`w-10 h-10 rounded-full grid place-items-center ${
          inspectMode ? "bg-oth-warm text-oth-ink" : "bg-white/80 text-oth-ink"
        }`}
      >
        <ArrowsClockwise size={18} weight="bold" />
      </button>
      <button
        onClick={toggleLabels}
        title={showLabels ? "Hide labels" : "Show labels"}
        aria-label="Toggle polygon labels"
        className={`w-10 h-10 rounded-full grid place-items-center ${
          showLabels ? "bg-oth-warm text-oth-ink" : "bg-white/80 text-oth-ink"
        }`}
      >
        <Tag size={18} weight="bold" />
      </button>
      <button
        onClick={cycleTimeOfDay}
        title={`Time: ${TIME_ICON[timeOfDay].label} (tap to change)`}
        aria-label="Cycle time of day"
        className="w-10 h-10 rounded-full grid place-items-center bg-white/80 text-oth-ink"
      >
        <TimeIcon size={18} weight="bold" />
      </button>
      <button
        onClick={toggleEffects}
        title={effectsEnabled ? "Effects on (tap for performance mode)" : "Performance mode (tap for effects)"}
        aria-label="Toggle visual effects"
        className={`w-10 h-10 rounded-full grid place-items-center ${
          effectsEnabled ? "bg-oth-warm text-oth-ink" : "bg-white/80 text-neutral-400"
        }`}
      >
        <Sparkle size={18} weight={effectsEnabled ? "fill" : "bold"} />
      </button>
      <button
        onClick={toggleFirstPerson}
        title={firstPerson ? "Exit walk mode" : "Walk in first person"}
        aria-label="Toggle first-person walk mode"
        className={`w-10 h-10 rounded-full grid place-items-center ${
          firstPerson ? "bg-oth-primary text-white" : "bg-white/80 text-oth-ink"
        }`}
      >
        <PersonSimpleWalk size={18} weight="bold" />
      </button>
    </div>
    {firstPerson && (
      <div className="pointer-events-none absolute bottom-2 left-1/2 z-30 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
        Click to look · WASD move · Shift sprint · Esc to exit
      </div>
    )}
    </>
  );
}
