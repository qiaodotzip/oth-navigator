import type { Level } from "@oth/model";
import { useEffect, useState } from "react";
import type { Api, PublishedVersion } from "../api/client";
import { floorProgress } from "../flow/floorProgress";
import { pickTab, sortedLevels, yourFloor } from "../flow/floors";
import { followLink, href, navigate } from "../route";
import { cardLink } from "../setup/progress";
import { asSetupApi } from "../setup/setupApi";
import { loadSetup, useSetupStore } from "../setup/sync";
import { SETUP_STEP_IDS } from "../setup/types";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { reportFailure } from "../ui/failure";
import { relativeTime } from "../ui/relativeTime";
import { recall } from "../ui/remember";
import { FloorCard } from "./FloorCard";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "4 Sep 2026", on the reader's calendar. Spelled out here rather than by Intl,
 * whose en-GB September is "Sept" on newer ICU and "Sep" on older. Null when
 * the timestamp cannot be read, so the date is left out rather than shown as
 * "NaN undefined NaN".
 */
function calendarDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Where everyone lands: your floor one click away, and every floor's owners and
 * progress at a glance — which is what a new teammate otherwise has to ask for.
 */
export function FloorsHome({ api, saver }: { api: Api; saver: Pick<Saver, "update"> }) {
  const model = useEditorStore(s => s.model);
  const report = useEditorStore(s => s.report);
  const levelImages = useEditorStore(s => s.levelImages);
  const user = useEditorStore(s => s.user);
  const [latest, setLatest] = useState<PublishedVersion | null | undefined>(undefined);

  useEffect(() => {
    // A failed fetch must stay unknown, not read as "checked, and there is
    // none" — undefined already leaves the "published …" clause out below.
    api.latestPublished().then(setLatest).catch(() => {});
  }, [api]);

  const setups = useSetupStore(s => s.byLevel);
  const levelKey = sortedLevels(model).map(l => l.id).join(" ");

  // Each floor's setup, for its card's way in (spec §4.2). One that can't be
  // had leaves its card offering Set up: the wizard loads its own.
  useEffect(() => {
    const setupApi = asSetupApi(api);
    for (const id of levelKey.split(" ").filter(Boolean)) void loadSetup(setupApi, id);
  }, [api, levelKey]);

  if (!model) return <p className="p-8 text-sm text-stone-500">Loading the floors…</p>;

  /** Set up again: every step open, so the new run's check starts from now; then its step 1. */
  const restart = async (level: Level): Promise<void> => {
    const setupApi = asSetupApi(api);
    try {
      await Promise.all(SETUP_STEP_IDS.map(step => setupApi.setSetupStep(level.id, step, { status: "open" })));
    } catch (err) {
      reportFailure(err, { doing: `start ${level.code}'s setup again`, retry: () => restart(level) });
      return;
    }
    await loadSetup(setupApi, level.id);
    navigate(href({ name: "setup", code: level.code, step: 1, params: {} }));
  };

  const levels = sortedLevels(model);
  const progress = new Map(levels.map(l => [l.id, floorProgress(model, report, levelImages, l.id)]));
  const ready = levels.filter(l => progress.get(l.id)!.build.next === null).length;
  const mine = yourFloor(model, user?.id ?? null, recall("lastFloor"));
  const continueTo = mine
    ? href({
        name: "floor",
        code: mine.code,
        tab: pickTab(recall(`lastTab.${mine.code}`), progress.get(mine.id)!.survey.total > 0),
        params: {},
      })
    : null;
  const publishedOn = latest ? calendarDate(latest.createdAt) : null;
  const published =
    latest === undefined
      ? ""
      : latest
        ? ` · last published ${publishedOn ? `${publishedOn}, ` : ""}${relativeTime(latest.createdAt)}`
        : " · not published yet";

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-end gap-4">
        <div>
          <h1 className="text-xl font-semibold">Floors</h1>
          <p className="text-xs text-stone-500">
            {ready} of {levels.length} floors ready{published}
          </p>
        </div>
        {mine && continueTo && (
          <a
            href={continueTo}
            onClick={followLink(continueTo)}
            className="ml-auto inline-flex h-9 items-center rounded bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Continue on {mine.code} →
          </a>
        )}
      </div>
      <ul className="mt-5 grid grid-cols-4 gap-4">
        {levels.map(level => (
          <li key={level.id}>
            <FloorCard
              level={level}
              progress={progress.get(level.id)!}
              mine={Boolean(user && level.ownerIds.includes(user.id))}
              saver={saver}
              setup={cardLink({
                setup: setups[level.id] ?? null, model, levelImages, levelId: level.id, levelCode: level.code,
                // Drafts are loaded only for the open floor; the card knows Find rooms ran from the server's counts.
                draftsWaiting: 0,
              })}
              onRestart={() => void restart(level)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
