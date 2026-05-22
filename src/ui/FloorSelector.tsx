import { useStore } from "@/store";

const FLOORS = ["L1", "L2"] as const;

export function FloorSelector() {
  const activeFloor = useStore(s => s.activeFloor);
  const setActiveFloor = useStore(s => s.setActiveFloor);
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
    </div>
  );
}
