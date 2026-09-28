import { PortalKindSchema } from "@oth/model";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";

const KIND_LABELS: Record<(typeof PortalKindSchema.options)[number], string> = {
  lift: "Lift",
  escalator: "Escalator",
  stair: "Stairs",
  ramp: "Ramp",
};

/** The two kinds a wheelchair or pram can use; step-free routing depends on it. */
const STEP_FREE = new Set(["lift", "ramp"]);

/** Where people come in from outside: its name, and whether it is the main one. */
export function EntranceInspector({ saver }: { saver: Saver }) {
  const model = useEditorStore(s => s.model);
  const selection = useEditorStore(s => s.selection);

  const entrance = selection?.type === "entrance"
    ? model?.entrances.find(e => e.id === selection.id)
    : undefined;

  if (!entrance) {
    return (
      <p className="p-3 text-xs text-stone-500">
        Pick Entrance, then click inside an area where people come in from outside.
      </p>
    );
  }

  const set = (data: Record<string, unknown>) =>
    void saver.update("entrance", entrance.id, entrance.version, data);

  return (
    <div className="space-y-3 p-3 text-sm">
      <label className="block text-xs">
        Name
        <input
          key={entrance.id}
          aria-label="Entrance name"
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          placeholder="e.g. Gate 6…"
          defaultValue={entrance.nameEn}
          onBlur={e => {
            if (e.target.value !== entrance.nameEn) set({ nameEn: e.target.value });
          }}
        />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          aria-label="Main entrance"
          checked={entrance.isPrimary}
          onChange={e => set({ isPrimary: e.target.checked })}
        />
        Main entrance
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          aria-label="Step free"
          checked={entrance.stepFree}
          onChange={e => set({ stepFree: e.target.checked })}
        />
        Step free
      </label>
    </div>
  );
}

/**
 * A lift, escalator, stair or ramp, seen from one of its stops.
 *
 * Kind and name belong to the whole connection, not to the stop you clicked,
 * so they are saved on the portal.
 */
export function PortalInspector({ saver }: { saver: Saver }) {
  const model = useEditorStore(s => s.model);
  const selection = useEditorStore(s => s.selection);

  const endpoint = selection?.type === "portalEndpoint"
    ? model?.portalEndpoints.find(e => e.id === selection.id)
    : undefined;
  const portal = endpoint ? model?.portals.find(p => p.id === endpoint.portalId) : undefined;

  if (!endpoint || !portal) {
    return (
      <p className="p-3 text-xs text-stone-500">
        Pick Portal and click where the lift or stair is. On the next floor it shows
        as a dashed outline: click that to add its next stop.
      </p>
    );
  }

  const stops = (model?.portalEndpoints ?? [])
    .filter(e => e.portalId === portal.id && !e.deletedAt)
    .map(e => model?.levels.find(l => l.id === e.levelId))
    .filter(l => l !== undefined)
    .sort((a, b) => a.ordinal - b.ordinal)
    .map(l => l.code);

  const set = (data: Record<string, unknown>) =>
    void saver.update("portal", portal.id, portal.version, data);

  return (
    <div className="space-y-3 p-3 text-sm">
      <label className="block text-xs">
        Kind
        <select
          aria-label="Kind of connection"
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          value={portal.kind}
          onChange={e => set({ kind: e.target.value, stepFree: STEP_FREE.has(e.target.value) })}
        >
          {PortalKindSchema.options.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
        </select>
      </label>
      <label className="block text-xs">
        Name
        <input
          key={portal.id}
          aria-label="Lift or stair name"
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          placeholder="e.g. Lift A…"
          defaultValue={portal.nameEn}
          onBlur={e => {
            if (e.target.value !== portal.nameEn) set({ nameEn: e.target.value });
          }}
        />
      </label>
      <p data-testid="portal-stops" className="text-xs text-stone-600">
        Stops on {stops.join(", ")}
      </p>
      {stops.length < 2 && (
        <p className="text-xs text-amber-700">
          Only one stop so far. Switch floor and click its dashed outline to add the next.
        </p>
      )}
    </div>
  );
}
