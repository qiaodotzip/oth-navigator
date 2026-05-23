import { useStore } from "@/store";
import { Tag, ArrowsClockwise } from "phosphor-react";

const FLOORS = ["L1", "L2"] as const;

export function FloorSelector() {
  const activeFloor = useStore(s => s.activeFloor);
  const setActiveFloor = useStore(s => s.setActiveFloor);
  const inspectMode = useStore(s => s.inspectMode);
  const showLabels = useStore(s => s.showLabels);
  const toggleInspectMode = useStore(s => s.toggleInspectMode);
  const toggleLabels = useStore(s => s.toggleLabels);

  return (
    <div className="absolute right-2 top-2 flex flex-col gap-1">
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
    </div>
  );
}
