import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";

/**
 * A conflict is an editorial event, not an error to swallow. Someone else saved
 * this first; the only honest options are to look at their version or to
 * discard yours, so reloading is the one offered — and the banner says who, by
 * name, since "someone else" on a team of six is somebody you can ask.
 */
export function ConflictBanner({ onReload }: { onReload: () => void }) {
  const conflict = useEditorStore(s => s.conflict);
  const setConflict = useEditorStore(s => s.setConflict);
  const team = useEditorStore(s => s.team);
  if (!conflict) return null;

  const by = conflict.current?.updatedBy;
  const who = (typeof by === "string" && team.find(m => m.id === by)?.displayName) || "Someone else";
  const name = conflict.current?.nameEn;
  const what = typeof name === "string" && name !== "" ? name : conflict.entityId;

  return (
    <div role="alert" className="flex items-center gap-3 border-b border-yours/30 bg-yours-soft px-4 py-2 text-sm">
      <span>
        {who} changed <strong>{what}</strong> while you were editing it. Your change was not saved.
      </span>
      <Button
        size="sm"
        onClick={() => {
          setConflict(null);
          onReload();
        }}
      >
        Reload
      </Button>
    </div>
  );
}
