import { live, type Capture, type Level } from "@oth/model";
import { useMemo, useState } from "react";
import type { Api } from "../api/client";
import { followLink, href } from "../route";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { AddFootageDialog } from "../survey/AddFootageDialog";
import { Button } from "../ui/Button";

/**
 * Step 1 (spec §4.2): Survey's own Add footage dialog, and the footage already
 * filed under this floor. Any of it can be looked through again for frames it
 * missed, and each opens in Survey. New footage is filed under this floor as
 * it is made, so the list shows it as the model reloads.
 *
 * A walkthrough that crossed floors has no `levelId` (Survey's own `unfiled`,
 * surveyView.ts): Survey's own File under is offered for it here too, so it
 * is never simply missing from the step that is meant to show every footage.
 */
export function FootageStep({ api, saver, level }: {
  api: Pick<Api, "uploadKeyframe">;
  saver: Pick<Saver, "create" | "update" | "refresh">;
  level: Level;
}) {
  const model = useEditorStore(s => s.model);
  const [dialog, setDialog] = useState<{ captureId: string | null } | null>(null);
  // Guards a capture whose File under is on its way, the same as Survey's
  // own fileUnder: a second click before the first lands must not send the
  // update twice.
  const [filing, setFiling] = useState<ReadonlySet<string>>(new Set());
  const frameCounts = useMemo(() => {
    const frames = new Map<string, number>();
    if (model) for (const k of live(model.keyframes)) frames.set(k.captureId, (frames.get(k.captureId) ?? 0) + 1);
    return frames;
  }, [model]);
  const footage = useMemo(() => {
    if (!model) return [];
    return live(model.captures)
      .filter(c => c.levelId === level.id)
      .sort((a, b) => a.filename.localeCompare(b.filename))
      .map(capture => ({ capture, frames: frameCounts.get(capture.id) ?? 0 }));
  }, [model, level.id, frameCounts]);
  const unfiled = useMemo(() => {
    if (!model) return [];
    return live(model.captures)
      .filter(c => !c.levelId)
      .sort((a, b) => a.filename.localeCompare(b.filename))
      .map(capture => ({ capture, frames: frameCounts.get(capture.id) ?? 0 }));
  }, [model, frameCounts]);

  async function fileUnder(capture: Capture): Promise<void> {
    setFiling(s => new Set(s).add(capture.id));
    await saver.update("capture", capture.id, capture.version, { levelId: level.id });
    setFiling(s => {
      const left = new Set(s);
      left.delete(capture.id);
      return left;
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Add footage</h1>
        <p className="text-sm text-stone-600">
          Walk {level.code} filming with a phone, then add the video here. It stays on this computer: only the frames worth keeping are uploaded.
        </p>
      </header>
      <Button variant="primary" onClick={() => setDialog({ captureId: null })}>+ Add footage</Button>
      {footage.length === 0 ? (
        <p className="text-sm text-stone-600">No footage on {level.code} yet.</p>
      ) : (
        <ul aria-label={`Footage on ${level.code}`} className="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
          {footage.map(({ capture, frames }) => {
            const survey = href({ name: "floor", code: level.code, tab: "survey", params: { capture: capture.id } });
            return (
              <li key={capture.id} data-testid={`footage-${capture.id}`} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{capture.filename}</p>
                  <p className="text-xs text-stone-600">
                    {capture.kind === "video" ? "Video" : "Photos"} · {frames === 1 ? "1 frame" : `${frames} frames`}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setDialog({ captureId: capture.id })}>
                  Find more frames<span className="sr-only"> in {capture.filename}</span>
                </Button>
                <a
                  href={survey}
                  onClick={followLink(survey)}
                  aria-label={`Open in Survey: ${capture.filename}`}
                  className="text-xs font-medium text-accent underline"
                >
                  Open in Survey
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {unfiled.length > 0 && (
        <section aria-label="Footage not filed under a floor" className="space-y-2">
          <h2 className="text-sm font-semibold text-stone-700">Not filed under a floor yet</h2>
          <ul className="divide-y divide-stone-200 rounded border border-yours/30 bg-yours-soft">
            {unfiled.map(({ capture, frames }) => (
              <li
                key={capture.id}
                role="status"
                data-testid={`unfiled-${capture.id}`}
                className="flex items-center gap-3 p-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <strong>{capture.filename}</strong> ({frames === 1 ? "1 frame" : `${frames} frames`}) isn't filed
                  under a floor, so nothing in it counts toward one yet.
                </span>
                <Button size="sm" disabled={filing.has(capture.id)} onClick={() => void fileUnder(capture)}>
                  File under {level.code}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {dialog && (
        <AddFootageDialog
          key={dialog.captureId ?? "new"}
          api={api}
          saver={saver}
          level={level}
          captureId={dialog.captureId}
          open
          onOpenChange={next => {
            if (!next) setDialog(null);
          }}
          // The list shows new footage as the model reloads: there is no frame to follow here.
          onCapture={() => {}}
        />
      )}
    </div>
  );
}
