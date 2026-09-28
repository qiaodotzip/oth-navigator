import { useEffect, useRef } from "react";
import { ignoreKey } from "../ui/keys";

type DraftKeys = { accept: () => void; reject: () => void; skip: () => void };

/**
 * Review's keys for a draft in hand (spec §5.2 step 7): A accepts, R rejects,
 * S skips. Build already uses A for Draw area and R for Draw room. So while a
 * draft is in hand, these are heard first, on the window's capture phase, and
 * each one they take is marked handled. `useKeys`, which Build's keys go
 * through, skips a handled key. With no draft in hand they are Build's again.
 * The same `ignoreKey` rules hold: never while typing, and never behind a
 * dialog.
 *
 * A held key decides once. Its repeats are still taken, so a hand lingering
 * on A after an accept never falls through to Draw area.
 */
export function useDraftKeys(handlers: DraftKeys | null): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const listen = (event: KeyboardEvent) => {
      const h = latest.current;
      if (!h || ignoreKey(event)) return;
      const act = ({ a: h.accept, r: h.reject, s: h.skip } as Record<string, (() => void) | undefined>)[event.key.toLowerCase()];
      if (!act) return;
      event.preventDefault();
      if (!event.repeat) act();
    };
    window.addEventListener("keydown", listen, { capture: true });
    return () => window.removeEventListener("keydown", listen, { capture: true });
  }, []);
}
