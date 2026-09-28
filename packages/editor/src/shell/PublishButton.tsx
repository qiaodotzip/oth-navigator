import { useState } from "react";
import { isUnauthorized, type Api } from "../api/client";
import { publishBlockers } from "../flow/publishBlockers";
import { followLink } from "../route";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { Popover } from "../ui/Popover";
import { toast } from "../ui/toast";

const SHOWN_PER_FLOOR = 5;

/**
 * Publish, for the whole building. While something blocks it, the button opens
 * the list of what — by floor, each linked to the step that fixes it — instead
 * of sitting greyed out with a tooltip nobody finds.
 */
export function PublishButton({ api }: { api: Api }) {
  const model = useEditorStore(s => s.model);
  const report = useEditorStore(s => s.report);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (!report || !report.ok) {
    const groups = publishBlockers(model, report);
    const count = groups.reduce((n, g) => n + g.items.length, 0);
    return (
      <Popover align="end" open={open} onOpenChange={setOpen} trigger={<Button size="sm">Publish ▾</Button>}>
        <div className="w-96">
          <p className="px-2 pb-2 text-xs text-stone-500">
            {report ? `Fix ${count === 1 ? "this" : `these ${count}`} before publishing:` : "Checking the map…"}
          </p>
          {groups.map(group => (
            <section key={group.key} className="pb-1">
              <h3 className="px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{group.label}</h3>
              <ul>
                {group.items.slice(0, SHOWN_PER_FLOOR).map((item, i) => (
                  <li key={i}>
                    {item.link ? (
                      <a
                        href={item.link}
                        onClick={event => {
                          // Closed by hand: followLink's preventDefault also stops
                          // PopoverClose, which left the list open over the fix.
                          followLink(item.link!)(event);
                          setOpen(false);
                        }}
                        className="block rounded px-2 py-1 hover:bg-stone-100"
                      >
                        {item.message}
                        <span className="text-accent"> → {item.stepLabel}</span>
                      </a>
                    ) : (
                      <span className="block px-2 py-1">{item.message}</span>
                    )}
                  </li>
                ))}
              </ul>
              {group.items.length > SHOWN_PER_FLOOR && (
                <p className="px-2 text-xs text-stone-500">and {group.items.length - SHOWN_PER_FLOOR} more</p>
              )}
            </section>
          ))}
        </div>
      </Popover>
    );
  }

  // Unblocked with the list open: forget it, or the next blocker reopens it.
  if (open) setOpen(false);

  return (
    <Button
      variant="primary"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const result = await api.publish();
          const n = result.warningCount;
          // No version id: it is a raw timestamp nobody reads, and the date
          // of a publish made just now adds nothing. Not "live for visitors"
          // either: the visitor app that reads published versions isn't built yet.
          toast({
            tone: "success",
            message: `Published${n ? ` with ${n} warning${n === 1 ? "" : "s"}` : ""}. This is now the latest version of the map.`,
          });
        } catch (err) {
          // A 401 here means the session expired; the sign-in dialog over the
          // page says so, and this would only contradict it.
          if (!isUnauthorized(err)) {
            toast({ tone: "error", message: "Publishing failed. Check your connection and try again." });
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Publishing…" : "Publish"}
    </Button>
  );
}
