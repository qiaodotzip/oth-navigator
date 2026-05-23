import { useStore } from "@/store";
import { MapPin, X } from "phosphor-react";

export function SetLocationControl() {
  const picking = useStore(s => s.pickingLocation);
  const setPicking = useStore(s => s.setPickingLocation);
  const activeRoute = useStore(s => s.activeRoute);
  const tileSizeM = useStore(s => s.tileSizeM);
  const setTileSize = useStore(s => s.setTileSize);

  return (
    <div className="absolute left-2 bottom-2 z-30 flex flex-col gap-2 items-start">
      <label className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-oth-ink shadow">
        Tile
        <input
          type="number"
          step={0.1}
          min={0.3}
          max={20}
          value={tileSizeM}
          onChange={e => setTileSize(parseFloat(e.target.value) || tileSizeM)}
          className="w-12 rounded bg-neutral-100 px-1 py-0.5 text-[11px]"
        />
        m
      </label>
      {activeRoute ? null : picking ? (
        <div className="flex items-center gap-2 rounded-lg bg-oth-primary px-3 py-2 text-xs font-semibold text-white shadow-lg">
          <MapPin size={16} weight="fill" />
          Tap the map to set where you are
          <button
            onClick={() => setPicking(false)}
            aria-label="Cancel"
            className="ml-1 rounded-full bg-white/20 p-0.5"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setPicking(true)}
          className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-2 text-xs font-semibold text-oth-ink shadow-lg active:scale-95 transition"
        >
          <MapPin size={16} weight="fill" className="text-oth-primary" />
          Set my location
        </button>
      )}
    </div>
  );
}
