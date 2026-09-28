import type { Level, MapModel } from "@oth/model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isUnauthorized, type Api } from "../api/client";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { reportFailure } from "../ui/failure";
import { relativeTime } from "../ui/relativeTime";
import { toast } from "../ui/toast";
import { checkSections, objectFrames, showTarget, undoRefusal } from "./check";
import { EPOCH } from "./progress";
import { SetupMap, type MapFocus } from "./SetupMap";
import type { ClaudeChange, SetupApi } from "./types";

/** Frame thumbnails are 64 px wide; 160 covers a 2x screen. */
const THUMB_PX = 160;

type CheckApi = Pick<Api, "keyframeFileUrl" | "levelImageFileUrl"> & Pick<SetupApi, "listClaudeChanges" | "undoChange">;

/**
 * Step 8 (spec §8): everything Claude changed on the floor in this run, in
 * groups, with the map beside it. Show selects a change on the map, and Undo
 * takes it back, or says why it can't. Looks right finishes the step; what is
 * left in the list stays on the map.
 */
export function CheckStep({ api, saver, level, since, onLooksRight }: {
  api: CheckApi;
  saver: Pick<Saver, "refresh">;
  level: Level;
  since: string;
  onLooksRight: () => void;
}) {
  const model = useEditorStore(s => s.model);
  const [changes, setChanges] = useState<ClaudeChange[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [undone, setUndone] = useState<ReadonlySet<string>>(new Set());
  const [refused, setRefused] = useState<ReadonlyMap<string, string>>(new Map());
  // Undos under way. A ref, so a second press that lands before the redraw is still turned away.
  const undoing = useRef(new Set<string>());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setChanges(await api.listClaudeChanges(level.id, since));
    } catch (err) {
      if (!isUnauthorized(err)) setFailed(true);
    }
  }, [api, level.id, since]);

  useEffect(() => {
    void load();
  }, [load]);

  const { sections, labels } = useMemo(() => checkSections(changes ?? []), [changes]);

  function show(change: ClaudeChange): void {
    const target = showTarget(useEditorStore.getState().model, change, level.id);
    if (!target) return;
    useEditorStore.getState().select(target);
    setFocus(f => ({ target, seq: (f?.seq ?? 0) + 1 }));
  }

  async function undo(change: ClaudeChange): Promise<void> {
    const id = change.auditId;
    if (undoing.current.has(id)) return;
    undoing.current.add(id);
    setBusy(new Set(undoing.current));
    try {
      await api.undoChange(id);
      setUndone(s => new Set(s).add(id));
      setRefused(m => {
        const next = new Map(m);
        next.delete(id);
        return next;
      });
      toast({ tone: "success", message: `Undone: ${change.summary.replace(/\.$/, "")}.` });
      // The undo landed; only the reload after it can fail here, and its Retry is the reload.
      await saver.refresh().catch(err => reportFailure(err, {
        doing: "reload the map after the undo",
        retry: async () => {
          await saver.refresh().catch(() => {});
        },
      }));
    } catch (err) {
      const why = undoRefusal(err);
      if (why) setRefused(m => new Map(m).set(id, why));
      else reportFailure(err, { doing: "undo Claude's change", retry: () => undo(change) });
    } finally {
      undoing.current.delete(id);
      setBusy(new Set(undoing.current));
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <section aria-label="Claude's changes" className="flex w-[28rem] shrink-0 flex-col border-r border-stone-200 bg-white">
        <header className="space-y-1 border-b border-stone-200 p-4">
          <h1 className="text-lg font-semibold">Check Claude's work</h1>
          <p className="text-sm text-stone-600">
            {since === EPOCH
              ? `Everything Claude has changed on ${level.code}.`
              : `Everything Claude changed on ${level.code} since this setup began, ${relativeTime(since)}.`}{" "}
            Show finds it on the map. Undo takes it back.
          </p>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {failed && (
            <div role="alert" className="space-y-2 text-sm text-danger">
              <p>Couldn't load Claude's changes. Check your connection, then try again.</p>
              <Button size="sm" onClick={() => void load()}>Try again</Button>
            </div>
          )}
          {!failed && changes === null && <p className="text-sm text-stone-500">Loading Claude's changes…</p>}
          {changes !== null && sections.length === 0 && (
            <p className="text-sm text-stone-600">Nothing from Claude on {level.code} to check.</p>
          )}
          {sections.map(section => (
            <section key={section.group} aria-label={section.label}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                {section.label} <span className="font-normal">{section.rows.length}</span>
              </h2>
              <ul className="mt-1 divide-y divide-stone-100">
                {section.rows.map(change => (
                  <ChangeRow
                    key={change.auditId}
                    api={api}
                    model={model}
                    levelId={level.id}
                    change={change}
                    undone={undone.has(change.auditId) || change.undone === true}
                    refusal={refused.get(change.auditId) ?? null}
                    busy={busy.has(change.auditId)}
                    onShow={() => show(change)}
                    onUndo={() => void undo(change)}
                  />
                ))}
              </ul>
            </section>
          ))}
          {labels > 0 && (
            <p className="text-xs text-stone-600">
              {labels === 1 ? "Claude's 1 survey label isn't listed here" : `Claude's ${labels} survey labels aren't listed here`}
              : Review is where they're checked.
            </p>
          )}
        </div>
        <footer className="space-y-1 border-t border-stone-200 p-4">
          <Button variant="primary" onClick={onLooksRight}>Looks right</Button>
          <p className="text-xs text-stone-600">Anything still in the list stays on the map.</p>
        </footer>
      </section>
      <SetupMap api={api} focus={focus} />
    </div>
  );
}

function ChangeRow({ api, model, levelId, change, undone, refusal, busy, onShow, onUndo }: {
  api: Pick<Api, "keyframeFileUrl">;
  model: MapModel | null;
  levelId: string;
  change: ClaudeChange;
  undone: boolean;
  refusal: string | null;
  busy: boolean;
  onShow: () => void;
  onUndo: () => void;
}) {
  const target = showTarget(model, change, levelId);
  const frames = objectFrames(model, change);
  return (
    <li data-testid={`change-${change.auditId}`} className="flex items-start gap-2 py-2">
      {frames.length > 0 && (
        <div className="flex shrink-0 gap-1">
          {frames.map(f => (
            <img key={f.id} src={api.keyframeFileUrl(f.id, THUMB_PX)} alt="" className="h-12 w-16 rounded object-cover" />
          ))}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${undone ? "text-stone-500 line-through" : "text-stone-900"}`}>{change.summary}</p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
          {change.confidence === "low" && (
            <span className="rounded-full border border-yours px-1.5 text-yours">Low confidence</span>
          )}
          {undone && <span className="font-medium text-stone-700">Undone</span>}
          <span>{relativeTime(change.at)}</span>
        </p>
        {refusal && <p role="alert" className="text-xs text-danger">Can't undo: {refusal}.</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          size="sm" variant="ghost" disabled={!target} onClick={onShow}
          aria-label={`Show: ${change.summary}`}
        >
          Show
        </Button>
        <Button size="sm" disabled={undone || busy} onClick={onUndo} aria-label={`Undo: ${change.summary}`}>
          Undo
        </Button>
      </div>
    </li>
  );
}
