import type { Level } from "@oth/model";
import { nextStepText, type FloorProgress } from "../flow/floorProgress";
import { pickTab } from "../flow/floors";
import { onMapLine } from "../places/rows";
import { followLink, href } from "../route";
import type { Saver } from "../state/save";
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

/** One floor: whose it is, how far along, and what to do next. The whole card opens it. */
export function FloorCard({ level, progress, mine, saver }: {
  level: Level; progress: FloorProgress; mine: boolean; saver: Pick<Saver, "update">;
}) {
  const tab = pickTab(recall(`lastTab.${level.code}`), progress.survey.total > 0);
  const to = href({ name: "floor", code: level.code, tab, params: {} });
  const reviewTotal = progress.review.confirmed + progress.review.proposed;

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
      {/* The Places tab's heading, repeated here (spec §4). */}
      {progress.places.confirmed > 0 && (
        <p className="text-xs text-stone-600">{onMapLine(progress.places.onMap, progress.places.confirmed)}</p>
      )}
      <p className="mt-auto pt-1 text-xs font-medium text-stone-700">{nextStepText(progress)}</p>
    </article>
  );
}
