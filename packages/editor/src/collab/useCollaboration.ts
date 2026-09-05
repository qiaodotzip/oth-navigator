import { useEffect } from "react";
import type { Api } from "../api/client";
import { useEditorStore } from "../state/store";

/** Well inside the server's 30 s presence TTL and 300 s lock TTL. */
const POLL_MS = 5_000;

/**
 * Everything the editor does to stay aware of other people, on one timer.
 *
 * The server also offers an SSE presence stream, and it stays there. This polls
 * instead: a heartbeat timer has to exist regardless, so one timer that also
 * fetches presence and locks is a single code path rather than two — and one
 * that works in jsdom, which has no EventSource. Five seconds of staleness is
 * invisible for a team of four. Wire the stream when that stops being true.
 */
export function useCollaboration(api: Api): void {
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const selection = useEditorStore(s => s.selection);
  const setPresence = useEditorStore(s => s.setPresence);
  const setLocks = useEditorStore(s => s.setLocks);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        await api.heartbeat(activeLevelId);
        const [presence, locks] = await Promise.all([api.listPresence(), api.listLocks()]);
        if (cancelled) return;
        setPresence(presence);
        setLocks(locks);
      } catch {
        // Awareness is a nicety. A blip must never surface as an error to
        // someone who is mid-edit.
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [api, activeLevelId, setPresence, setLocks]);

  useEffect(() => {
    if (!selection) return;
    const { type, id } = selection;
    // Refusal is fine: the lock only warns, and the next poll shows who holds it.
    void api.acquireLock(type, id).catch(() => {});
    return () => {
      void api.releaseLock(type, id).catch(() => {});
    };
  }, [api, selection]);
}
