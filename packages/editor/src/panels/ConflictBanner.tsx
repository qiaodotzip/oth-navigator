import { useEditorStore } from "../state/store";

/**
 * A conflict is an editorial event, not an error to swallow. Someone else saved
 * this entity first; the only honest options are to look at their version or to
 * discard yours, so those are the only two offered.
 */
export function ConflictBanner({ onReload }: { onReload: () => void }) {
  const conflict = useEditorStore(s => s.conflict);
  const setConflict = useEditorStore(s => s.setConflict);
  if (!conflict) return null;

  return (
    <div role="alert" className="flex items-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <span>
        Someone else saved <strong>{conflict.entityId}</strong> while you were editing it.
        Your change was not applied.
      </span>
      <button
        className="rounded bg-amber-800 px-2 py-1 text-white"
        onClick={() => {
          setConflict(null);
          onReload();
        }}
      >
        Reload their version
      </button>
    </div>
  );
}
