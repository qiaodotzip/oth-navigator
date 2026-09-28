import type { Placement } from "@oth/model";
import { useEditorStore } from "../state/store";

export function PlacementInspector({
  onChange,
}: {
  onChange: (placement: Placement, patch: Record<string, unknown>) => void;
}) {
  const model = useEditorStore(s => s.model);
  const selection = useEditorStore(s => s.selection);

  if (!model || selection?.type !== "placement") return null;
  const placement = model.placements.find(p => p.id === selection.id);
  if (!placement) return null;

  const asset = model.assets.find(a => a.id === placement.assetId);

  const axis = (index: 0 | 1 | 2, label: string) => (
    <label className="block flex-1 text-xs">
      {label}
      <input
        key={placement.id}
        aria-label={label}
        className="mt-1 w-full rounded border px-2 py-1"
        inputMode="decimal"
        defaultValue={placement.position[index]}
        onBlur={e => {
          const value = Number.parseFloat(e.target.value);
          if (!Number.isFinite(value)) return;
          const position = [...placement.position] as [number, number, number];
          position[index] = value;
          onChange(placement, { position });
        }}
      />
    </label>
  );

  return (
    <div className="space-y-3 border-b p-3 text-sm">
      <div>
        <div className="text-xs uppercase tracking-wide text-stone-500">Placement</div>
        <div>{asset?.filename ?? placement.assetId}</div>
      </div>

      <div className="flex gap-2">
        {axis(0, "East (m)")}
        {axis(1, "North (m)")}
        {axis(2, "Up (m)")}
      </div>

      <div className="flex gap-2">
        <label className="block flex-1 text-xs">
          Rotation (deg)
          <input
            key={placement.id}
            aria-label="Rotation in degrees"
            className="mt-1 w-full rounded border px-2 py-1"
            inputMode="decimal"
            defaultValue={placement.rotationDeg}
            onBlur={e => {
              const value = Number.parseFloat(e.target.value);
              if (!Number.isFinite(value)) return;
              onChange(placement, { rotationDeg: value });
            }}
          />
        </label>
        <label className="block flex-1 text-xs">
          Scale
          <input
            key={placement.id}
            aria-label="Scale"
            className="mt-1 w-full rounded border px-2 py-1"
            inputMode="decimal"
            defaultValue={placement.scale}
            onBlur={e => {
              const value = Number.parseFloat(e.target.value);
              // The model rejects a non-positive scale; refuse before the round trip.
              if (!Number.isFinite(value) || value <= 0) return;
              onChange(placement, { scale: value });
            }}
          />
        </label>
      </div>
    </div>
  );
}
