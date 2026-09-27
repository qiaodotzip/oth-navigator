import type { PathwayKind } from "@oth/model";
import { useState } from "react";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";

/** A starting colour per new kind, so two types never look the same by default. */
const PALETTE = ["#38bdf8", "#f2a33c", "#a78bfa", "#34d399", "#f472b6", "#facc15", "#fb7185"];

/**
 * The team's own walkway types.
 *
 * Which distinctions matter — covered against open, ramp against steps, public
 * against service — is a judgement the people drawing the map make, so these
 * are rows they create rather than an enum in the code. The modelling note is
 * the point: it is what a type means when someone builds it in 3D.
 */
export function PathwayKindsPanel({ saver }: { saver: Saver }) {
  const model = useEditorStore(s => s.model);
  const kinds: PathwayKind[] = model?.pathwayKinds ?? [];
  const pathways = model?.pathways ?? [];
  const [name, setName] = useState("");

  const used = (kindId: string) => pathways.filter(p => p.kindId === kindId).length;

  async function add() {
    const trimmed = name.trim();
    if (trimmed === "") return;
    setName("");
    await saver.create("pathwayKind", {
      id: `pk-${Date.now()}`,
      nameEn: trimmed,
      colorHex: PALETTE[kinds.length % PALETTE.length],
    });
  }

  async function remove(kind: PathwayKind) {
    const n = used(kind.id);
    if (n > 0) {
      useEditorStore.getState().setStatus(
        `"${kind.nameEn}" is on ${n} walkway(s). Change those first, so none is left pointing at a type that is gone.`,
      );
      return;
    }
    await saver.remove("pathwayKind", kind.id, kind.version);
  }

  return (
    <div className="space-y-2 p-3 text-sm">
      <p className="text-xs text-stone-500">
        Your own walkway types. The modelling note travels with the type, so
        whoever builds it in 3D knows what it is meant to be.
      </p>

      {kinds.length === 0 && (
        <p className="text-xs italic text-stone-400">
          None yet. Add one — &ldquo;Covered link&rdquo;, &ldquo;Ramp&rdquo;, &ldquo;Service corridor&rdquo;.
        </p>
      )}

      {kinds.map(kind => (
        <div key={kind.id} data-testid={`kind-${kind.id}`} className="rounded border p-2">
          <div className="flex items-center gap-2">
            <input
              aria-label={`Colour for ${kind.nameEn}`}
              type="color"
              className="h-6 w-8 shrink-0"
              value={kind.colorHex}
              onChange={e =>
                void saver.update("pathwayKind", kind.id, kind.version, { colorHex: e.target.value })
              }
            />
            <input
              aria-label={`Name for ${kind.nameEn}`}
              className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
              defaultValue={kind.nameEn}
              onBlur={e => {
                const next = e.target.value.trim();
                if (next && next !== kind.nameEn) {
                  void saver.update("pathwayKind", kind.id, kind.version, { nameEn: next });
                }
              }}
            />
            <button
              aria-label={`Delete ${kind.nameEn}`}
              className="shrink-0 rounded border px-2 py-1 text-xs"
              onClick={() => void remove(kind)}
            >
              Delete
            </button>
          </div>

          <textarea
            aria-label={`Modelling note for ${kind.nameEn}`}
            rows={2}
            placeholder="How should this be built in 3D? Covered or open, ramp or steps, surface…"
            className="mt-1 w-full rounded border px-2 py-1 text-xs"
            defaultValue={kind.modellingNote}
            onBlur={e => {
              if (e.target.value !== kind.modellingNote) {
                void saver.update("pathwayKind", kind.id, kind.version, {
                  modellingNote: e.target.value,
                });
              }
            }}
          />
          <p className="mt-1 text-xs text-stone-500">on {used(kind.id)} walkway(s)</p>
        </div>
      ))}

      <div className="flex gap-1">
        <input
          aria-label="New walkway type"
          className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
          placeholder="Add a type…"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") void add();
          }}
        />
        <button className="rounded bg-stone-800 px-3 py-1 text-sm text-white" onClick={() => void add()}>
          Add
        </button>
      </div>
    </div>
  );
}
