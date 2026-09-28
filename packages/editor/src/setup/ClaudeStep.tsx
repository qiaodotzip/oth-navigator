import type { Level } from "@oth/model";
import { Fragment, useEffect, useState } from "react";
import type { Api, TokenList } from "../api/client";
import { followLink } from "../route";
import { myLiveTokens } from "../shell/ClaudeCodeButton";
import { openClaudeCodePanel, useClaudeCodePanel } from "../shell/claudePanel";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { relativeTime } from "../ui/relativeTime";
import { toast } from "../ui/toast";
import { countRows, countsKey, doneLine, sinceParam, storedState } from "./progress";
import { SetupMap } from "./SetupMap";
import { doItMyself, slashCommand, wizardStep, type ClaudeStepId } from "./steps";
import { useSetupPoll, useSetupStore } from "./sync";
import type { ClaudeChange, SetupApi } from "./types";

/** How many of Claude's changes the step lists (spec §4.2). */
const LAST_CHANGES = 5;

async function copy(command: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(command);
    toast({ tone: "success", message: "Copied. Paste it into Claude Code." });
  } catch {
    toast({ tone: "error", message: "Couldn't copy. Select the command and copy it yourself." });
  }
}

/**
 * A step Claude does (spec §4.2): the slash command to run in your own
 * Claude Code, the step's live counts, what Claude last did here, and the
 * step's own tool for doing it by hand. The map beside it fills in as Claude
 * works: the counts are asked for every 5 s, and a change reloads the model.
 */
export function ClaudeStep({ api, saver, level, stepId }: {
  api: Pick<Api, "listTokens" | "levelImageFileUrl"> & Pick<SetupApi, "getSetup" | "listClaudeChanges">;
  saver: Pick<Saver, "refresh">;
  level: Level;
  stepId: ClaudeStepId;
}) {
  const setup = useSetupStore(s => s.byLevel[level.id] ?? null);
  const unreachable = useSetupStore(s => s.failed[level.id] ?? false);
  const user = useEditorStore(s => s.user);
  const team = useEditorStore(s => s.team);
  const panelOpen = useClaudeCodePanel(s => s.open);
  const [tokens, setTokens] = useState<TokenList | null>(null);
  const [changes, setChanges] = useState<ClaudeChange[] | null>(null);
  const step = wizardStep(stepId);
  const command = slashCommand(stepId, level.code);
  const since = sinceParam(setup);
  const key = setup ? countsKey(setup.counts) : "";

  // Claude's work lands on the server; counts that move mean there is more of
  // it to show. A reload that fails is tried again at the next change.
  useSetupPoll(api, level.id, true, () => {
    void saver.refresh().catch(() => {});
  });

  // Your tokens: once, and again as the Claude Code panel closes, where one may just have been made.
  useEffect(() => {
    if (panelOpen || !user) return;
    let mounted = true;
    api.listTokens().then(
      list => {
        if (mounted) setTokens(list);
      },
      () => {},
    );
    return () => {
      mounted = false;
    };
  }, [api, panelOpen, user]);

  // Claude's last changes: on arrival, and whenever the counts move.
  useEffect(() => {
    let mounted = true;
    api.listClaudeChanges(level.id, since, LAST_CHANGES).then(
      list => {
        if (mounted) setChanges(list.slice(0, LAST_CHANGES));
      },
      () => {},
    );
    return () => {
      mounted = false;
    };
  }, [api, level.id, since, key]);

  // Unknown until they load. A list that can't be had says nothing: telling
  // someone already connected to connect would be wrong.
  const noToken = tokens !== null && myLiveTokens(tokens, user?.id ?? null).length === 0;
  const state = storedState(setup, stepId);
  const done = doneLine(state, team);
  const mine = doItMyself(stepId, level.code);

  return (
    <div className="flex h-full min-h-0">
      <section aria-label={step.title} className="w-96 shrink-0 space-y-5 overflow-y-auto border-r border-stone-200 bg-white p-5">
        <header className="space-y-1">
          <h1 className="text-lg font-semibold">{step.title}</h1>
          <p className="text-sm text-stone-600">Claude does this step. Run this in your Claude Code, and watch the map fill in.</p>
        </header>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <code
              aria-label="Command for Claude Code"
              className="min-w-0 flex-1 truncate rounded border border-stone-300 bg-stone-50 px-2 py-1.5 font-mono text-sm"
            >
              {command}
            </code>
            <Button size="sm" onClick={() => void copy(command)}>Copy</Button>
          </div>
          {noToken && (
            <p className="text-xs text-stone-700">
              Your Claude Code isn't connected yet.{" "}
              <button type="button" className="font-medium text-accent underline" onClick={openClaudeCodePanel}>
                Connect Claude Code
              </button>{" "}
              first.
            </p>
          )}
        </div>

        {done && (
          <p role="status" className="rounded border border-confirmed/30 bg-confirmed-soft p-2 text-sm text-stone-900">
            <span aria-hidden>✓ </span>
            {done}
            {state?.note ? `: ${state.note}` : ""}
          </p>
        )}

        <section aria-label="Progress" className="space-y-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Progress</h2>
          {unreachable && <p className="text-xs text-stone-600">Can't reach the server. Trying again every 5 seconds.</p>}
          {setup && (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-sm">
              {countRows(stepId, setup.counts).map(row => (
                <Fragment key={row.label}>
                  <dt className="text-stone-600">{row.label}</dt>
                  <dd className="text-right font-medium tabular-nums">{row.value}</dd>
                </Fragment>
              ))}
            </dl>
          )}
        </section>

        <section aria-label="Claude's last changes" className="space-y-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Claude's last changes</h2>
          {changes !== null && changes.length === 0 && (
            <p className="text-xs text-stone-600">Nothing from Claude on {level.code} yet.</p>
          )}
          {changes !== null && changes.length > 0 && (
            <ol className="space-y-1 text-sm">
              {changes.map(c => (
                <li key={c.auditId}>
                  {c.summary} <span className="text-xs text-stone-500">{relativeTime(c.at)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <a href={mine.to} onClick={followLink(mine.to)} className="inline-block text-sm font-medium text-accent underline">
          {mine.label}
        </a>
      </section>
      <SetupMap api={api} />
    </div>
  );
}
