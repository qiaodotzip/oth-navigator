import type { Level, MapModel } from "@oth/model";
import { useEffect, useMemo } from "react";
import type { Api } from "../api/client";
import { floorUnits } from "../flow/buildSteps";
import { followLink, href, setParams } from "../route";
import { recheck } from "../state/recheck";
import { useEditorStore } from "../state/store";
import { Chip } from "../ui/Chip";
import { BoxedFrame } from "./BoxedFrame";
import { imageWidthFor } from "./evidence";
import {
  FILTER_LABEL, GAP_LABEL, PLACES_FILTERS, filterRows, onMapLine, placeRows, placesSummary, readPlacesFilter,
  rowAction, whereText, type PlaceRow, type PlacesFilter,
} from "./rows";

/** Thumbnails are 112 px wide, at 2x. */
const THUMB_PX = 224;

const EMPTY: Record<PlacesFilter, string> = {
  gaps: "No gaps: every confirmed place here is on the map, with a confirmed photo.",
  "on-map": "None of this floor's confirmed places is on the map yet. Bind them on Build's Bind places step.",
  all: "No confirmed places here yet. Places are confirmed in Review.",
};

/**
 * The checklist of every confirmed place on a floor (spec §4): is each on the
 * map, and what is missing if not. It reads across Review and Build, so it is
 * a tab of its own. Proposals are counted, not listed, because they are
 * claims until Review decides them.
 */
export function PlacesWorkspace({ api, level, params }: { api: Api; level: Level; params: Record<string, string> }) {
  const model = useEditorStore(s => s.model);
  const report = useEditorStore(s => s.report);
  const filter = readPlacesFilter(params);
  const rows = useMemo(() => (model ? placeRows(model, report, level.id) : []), [model, report, level.id]);
  const summary = useMemo(() => (model ? placesSummary(model, rows, level.id) : null), [model, rows, level.id]);
  // Confirmed units that no floor claims: no floor of their own, filmed on
  // footage filed under none, and no room yet. No floor's rows count them and
  // no floor's to-do names them, yet Bind places offers them on every floor,
  // so every floor points to them. The link takes the first in hand, as Bind
  // it does; any others are under "Places with no floor" in the picker.
  const floorless = useMemo(
    () =>
      model
        ? [...floorUnits(model, undefined).waiting].sort(
          (a, b) => a.nameEn.localeCompare(b.nameEn) || a.id.localeCompare(b.id),
        )
        : [],
    [model],
  );

  // Survey and Review save without validating, so "Photos disagree" can be
  // older than the last tag. Checked once per visit.
  useEffect(() => {
    let mounted = true;
    void recheck(api, "check the places again", () => mounted);
    return () => {
      mounted = false;
    };
  }, [api]);

  if (!model || !summary) return <p className="p-8 text-sm text-stone-500">Loading the places…</p>;

  const shown = filterRows(rows, filter);
  const counts: Record<PlacesFilter, number> = { gaps: summary.gaps, "on-map": summary.onMap, all: summary.confirmed };
  const review = href({ name: "floor", code: level.code, tab: "review", params: {} });
  const bindStep = href({ name: "floor", code: level.code, tab: "build", params: { step: "bind" } });
  const bindFloorless = floorless[0]
    ? href({ name: "floor", code: level.code, tab: "build", params: { step: "bind", place: floorless[0].id } })
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">
          {summary.confirmed === 0 ? `No confirmed places on ${level.code} yet` : onMapLine(summary.onMap, summary.confirmed)}
        </h1>
        <p className="flex flex-wrap gap-x-4 text-xs text-stone-600">
          {summary.waiting > 0 && (
            <a href={review} onClick={followLink(review)} className="underline">{summary.waiting} waiting in Review →</a>
          )}
          {summary.unfilmedRooms > 0 && (
            <a href={bindStep} onClick={followLink(bindStep)} className="underline">Rooms nobody filmed: {summary.unfilmedRooms}</a>
          )}
          {bindFloorless && (
            <a href={bindFloorless} onClick={followLink(bindFloorless)} className="underline">
              Places with no floor: {floorless.length}
            </a>
          )}
        </p>
      </header>

      <div role="group" aria-label="Show places" className="flex gap-2">
        {PLACES_FILTERS.map(f => (
          <Chip key={f} selected={f === filter} count={counts[f]} onClick={() => setParams({ filter: f })}>
            {FILTER_LABEL[f]}
          </Chip>
        ))}
      </div>

      {shown.length > 0 ? (
        <ul aria-label="Confirmed places" className="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
          {shown.map(row => <PlaceRowItem key={row.place.id} api={api} model={model} row={row} levelCode={level.code} />)}
        </ul>
      ) : (
        <p className="text-sm text-stone-600">{summary.confirmed === 0 ? EMPTY.all : EMPTY[filter]}</p>
      )}
    </div>
  );
}

function PlaceRowItem({ api, model, row, levelCode }: { api: Api; model: MapModel; row: PlaceRow; levelCode: string }) {
  const action = rowAction(model, row, levelCode);
  return (
    <li data-testid={`place-row-${row.place.id}`} className="flex items-center gap-3 p-2">
      {row.best ? (
        <BoxedFrame
          className="w-28 shrink-0"
          src={api.keyframeFileUrl(row.best.frame.id, imageWidthFor(THUMB_PX, row.best.sighting.box))}
          frame={row.best.frame}
          box={row.best.sighting.box}
          tone={row.best.sighting.status}
          alt=""
        />
      ) : (
        <span className="flex h-16 w-28 shrink-0 items-center justify-center rounded bg-stone-100 text-xs text-stone-600">No photo</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-stone-900">
          {row.place.nameEn} <span className="text-xs font-normal text-stone-500">{row.place.category}</span>
        </p>
        <p className="truncate text-xs text-stone-600">{whereText(model, row)}</p>
        {row.gaps.length > 0 && (
          <ul aria-label="Gaps" className="mt-1 flex flex-wrap gap-1">
            {row.gaps.map(gap => (
              <li key={gap} className="rounded-full border border-stone-300 bg-stone-100 px-2 text-xs text-stone-800">
                {GAP_LABEL[gap]}
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* Named for its place, since every row has one; the name starts with the words on it. */}
      <a
        href={action.to}
        onClick={followLink(action.to)}
        aria-label={`${action.label}: ${row.place.nameEn}`}
        className="shrink-0 rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-stone-100"
      >
        {action.label}
      </a>
    </li>
  );
}
