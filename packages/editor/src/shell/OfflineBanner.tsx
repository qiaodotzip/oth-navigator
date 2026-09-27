import { useEffect, useState } from "react";
import type { Api } from "../api/client";

const POLL_MS = 15_000;

/**
 * Says when the server cannot be reached, while it cannot. Without it a lost
 * connection looks like buttons that silently do nothing.
 */
export function OfflineBanner({ api, pollMs = POLL_MS }: { api: Pick<Api, "health">; pollMs?: number }) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ok = await api.health();
      if (!cancelled) setOffline(!ok);
    };
    void check();
    const timer = setInterval(() => void check(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [api, pollMs]);

  if (!offline) return null;
  return (
    <div role="alert" className="border-b border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
      Can't reach the server. Your last change may not have saved — this clears when the connection is back.
    </div>
  );
}
