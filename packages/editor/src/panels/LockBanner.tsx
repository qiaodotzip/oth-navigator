import { lockFor } from "../collab/locks";
import { useEditorStore } from "../state/store";

/**
 * Warns that someone else is in the thing you just selected — and says plainly
 * that you may edit it anyway.
 *
 * The lock is advisory. `version` is what actually prevents a lost update, and
 * if you both save, the conflict banner catches it. Blocking here would add a
 * second, weaker correctness mechanism whose failure mode is a closed laptop
 * stranding a room for five minutes.
 */
export function LockBanner() {
  const locks = useEditorStore(s => s.locks);
  const selection = useEditorStore(s => s.selection);
  const me = useEditorStore(s => s.user);

  const held = lockFor(locks, selection, me?.id ?? null);
  if (!held) return null;

  return (
    <div role="status" className="border-b bg-amber-50 px-3 py-2 text-xs text-amber-900">
      🔒 {held.lockedByName} is editing this. You can still edit it — you will be
      warned if you both save.
    </div>
  );
}
