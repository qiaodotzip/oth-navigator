import type { Level } from "@oth/model";
import { useEffect, useRef, useState } from "react";
import { nextStepText, type FloorProgress } from "../flow/floorProgress";
import { pickTab } from "../flow/floors";
import { toBindLine } from "../places/rows";
import { followLink, href } from "../route";
import type { SetupLink } from "../setup/progress";
import type { Saver } from "../state/save";
import { Button } from "../ui/Button";
import { Progress } from "../ui/Progress";
import { recall } from "../ui/remember";
import { YoursTag } from "../ui/YoursTag";
import { OwnerPicker } from "./OwnerPicker";

function Bar({ label, value, max, empty, tone }: {
  label: string; value: number; max: number; empty: string; tone: "accent" | "confirmed";
}) {
  return (
    <div>
      <div className="flex justify-between text-xs text-stone-500">
        <span>{label}</span>
        <span>{max === 0 ? empty : `${value} / ${max}`}</span>
      </div>
      <Progress value={value} max={max} label={`${label} progress`} tone={tone} />
    </div>
  );
}

/** Above the card's stretched link, as the owner picker is, so it is a target of its own. */
const SETUP_LINK =
  "relative z-10 self-start rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-900 hover:bg-stone-100";

/** One floor: whose it is, how far along, and what to do next. The whole card opens it. */
export function FloorCard({ level, progress, mine, saver, setup, onRestart }: {
  level: Level; progress: FloorProgress; mine: boolean; saver: Pick<Saver, "update">;
  /** The way into the floor's setup wizard (spec §4.2). */
  setup: SetupLink;
  /** Set up again: opens every step, then goes to step 1. */
  onRestart: () => Promise<void>;
}) {
  const tab = pickTab(recall(`lastTab.${level.code}`), progress.survey.total > 0);
  const to = href({ name: "floor", code: level.code, tab, params: {} });
  const reviewTotal = progress.review.confirmed + progress.review.proposed;

  // Set up again asks first: it opens all nine steps, and a stray press
  // shouldn't. The question takes the focus as it opens, and Cancel gives it
  // back to Set up again.
  const [asking, setAsking] = useState(false);
  const question = useRef<HTMLParagraphElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);
  useEffect(() => {
    if (asking) question.current?.focus();
    else if (wasAsking.current) trigger.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  // Guards Set up again the way OwnerPicker guards a toggle: a second press
  // while the nine calls are in flight must not send nine more.
  const [restarting, setRestarting] = useState(false);
  const restart = async () => {
    if (restarting) return;
    setRestarting(true);
    try {
      await onRestart();
    } finally {
      setRestarting(false);
    }
  };

  return (
    <article
      className={`relative flex h-full flex-col gap-2.5 rounded-lg border bg-white p-4 ${
        mine ? "border-yours ring-1 ring-yours" : "border-stone-200"
      }`}
    >
      <div className="flex items-center gap-2">
        {/* The stretched link makes the whole card a target without nesting controls inside a link. */}
        <a href={to} onClick={followLink(to)} className="text-2xl font-bold after:absolute after:inset-0 after:content-['']">
          {level.code}
        </a>
        {mine && <YoursTag />}
        <span className="ml-auto">
          <OwnerPicker level={level} saver={saver} />
        </span>
      </div>
      <div className="-mt-2 text-xs text-stone-500">{level.nameEn}</div>
      <Bar label="Survey" value={progress.survey.tagged} max={progress.survey.total} empty="no footage yet" tone="accent" />
      <Bar label="Review" value={progress.review.confirmed} max={reviewTotal} empty="nothing to review" tone="confirmed" />
      <Bar label="Build" value={progress.build.done} max={progress.build.total} empty="" tone="accent" />
      {/* The Places tab's numbers (spec §4), worded apart from Review's bar, which counts walkways too. */}
      {progress.places.confirmed > 0 && (
        <p className="text-xs text-stone-600">{toBindLine(progress.places.onMap, progress.places.confirmed)}</p>
      )}
      <p className="mt-auto pt-1 text-xs font-medium text-stone-700">{nextStepText(progress)}</p>
      {setup.restart && asking ? (
        <div className="relative z-10 space-y-2 rounded border border-yours/30 bg-yours-soft p-2">
          <p ref={question} tabIndex={-1} className="text-xs text-yours outline-none">
            Set up {level.code} again? All nine steps open again; the map keeps everything.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={restarting} onClick={() => void restart()}>Set up again</Button>
            <Button size="sm" disabled={restarting} onClick={() => setAsking(false)}>Cancel</Button>
          </div>
        </div>
      ) : setup.restart ? (
        <button ref={trigger} type="button" onClick={() => setAsking(true)} className={SETUP_LINK}>
          {setup.label}
        </button>
      ) : (
        <a href={setup.to} onClick={followLink(setup.to)} className={SETUP_LINK}>{setup.label}</a>
      )}
    </article>
  );
}
