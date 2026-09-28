import { live, placementModelAsset, type Placement } from "@oth/model";
import { followLink, href } from "../route";
import { sizeText } from "../survey/tagging";
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

  const kind = placement.objectKindId ? live(model.objectKinds).find(k => k.id === placement.objectKindId) : undefined;
  const asset = placement.assetId ? model.assets.find(a => a.id === placement.assetId) : undefined;
  // What it shows (spec §5.3): its own model, its kind's, or its kind's box.
  const shows = asset ? `its own model, ${asset.filename}`
    : placementModelAsset(model, placement) ? "its kind's model"
    : "a box until its kind has a model";
  // The frames Claude placed it from: one tag per frame, as a rule, but counted by frame.
  const tagged = new Set(placement.sightingIds);
  const frames = new Set(live(model.sightings).filter(s => tagged.has(s.id)).map(s => s.keyframeId)).size;
  // Its kind's row, where the size and the model are changed for every one
  // of them: in Places, whose Objects section lists every kind on each floor.
  const floor = model.levels.find(l => l.id === placement.levelId);
  const kindRow = kind && floor ? href({ name: "floor", code: floor.code, tab: "places", params: {} }) : null;

  // Each field is keyed by the value it shows as well as the placement. Keyed
  // by the placement alone, an uncontrolled field keeps showing where it was
  // before a drag on the plan moved it, and the next blur writes that back.
  // Writes skip an unchanged value for the same reason.
  const axis = (index: 0 | 1 | 2, label: string) => (
    <label className="block flex-1 text-xs">
      {label}
      <input
        key={`${placement.id}:${placement.position[index]}`}
        aria-label={label}
        className="mt-1 w-full rounded border px-2 py-1"
        inputMode="decimal"
        defaultValue={placement.position[index]}
        onBlur={e => {
          const value = Number.parseFloat(e.target.value);
          if (!Number.isFinite(value) || value === placement.position[index]) return;
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
        <div className="text-xs uppercase tracking-wide text-stone-500">{placement.objectKindId ? "Object" : "Placement"}</div>
        <div>{kind?.nameEn ?? asset?.filename ?? placement.assetId ?? "A kind since deleted"}</div>
        {kind && <p className="text-xs text-stone-600">{sizeText(kind.size)} · shows {shows}</p>}
        {frames > 0 && <p className="text-xs text-stone-600">From {frames} frame{frames === 1 ? "" : "s"}</p>}
        {kind && kindRow && (
          <p className="text-xs">
            <a href={kindRow} onClick={followLink(kindRow)} className="underline">Edit {kind.nameEn} in Places</a>
          </p>
        )}
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
            key={`${placement.id}:${placement.rotationDeg}`}
            aria-label="Rotation in degrees"
            className="mt-1 w-full rounded border px-2 py-1"
            inputMode="decimal"
            defaultValue={placement.rotationDeg}
            onBlur={e => {
              const value = Number.parseFloat(e.target.value);
              if (!Number.isFinite(value) || value === placement.rotationDeg) return;
              onChange(placement, { rotationDeg: value });
            }}
          />
        </label>
        <label className="block flex-1 text-xs">
          Scale
          <input
            key={`${placement.id}:${placement.scale}`}
            aria-label="Scale"
            className="mt-1 w-full rounded border px-2 py-1"
            inputMode="decimal"
            defaultValue={placement.scale}
            onBlur={e => {
              const value = Number.parseFloat(e.target.value);
              // The model rejects a non-positive scale; refuse before the round trip.
              if (!Number.isFinite(value) || value <= 0 || value === placement.scale) return;
              onChange(placement, { scale: value });
            }}
          />
        </label>
      </div>
    </div>
  );
}
