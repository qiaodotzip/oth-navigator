import type { Level } from "@oth/model";
import { useMemo, useReducer, useRef } from "react";
import type { Api } from "../api/client";
import { reviewCounts } from "../flow/floorProgress";
import { setParams } from "../route";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import type { ProposedPlace } from "../survey/review";
import { Button } from "../ui/Button";
import { Kbd } from "../ui/Kbd";
import { Progress } from "../ui/Progress";
import { useKeys } from "../ui/keys";
import { acceptProposal, mergeProposal, rejectProposal } from "./decide";
import { reviewCommand } from "./keys";
import { ProposalFocus } from "./ProposalFocus";
import {
  currentProposal, evidenceFor, floorlessProposals, nextProposal, readReviewParams, reviewQueue, sameAs,
  type ReviewScope,
} from "./queue";

/**
 * One floor's proposals, one at a time (spec §10): the evidence large, the
 * claim under it, Accept · Reject · Skip. The next proposal is on screen the
 * moment you decide, and every decision can be undone from its toast.
 *
 * The address is the state (place, list, scope). Like Survey, it never loads
 * the model and never returns early on a missing user.
 */
export function ReviewWorkspace({ api, saver, level, params }: {
  api: Api;
  saver: Saver;
  level: Level;
  params: Record<string, string>;
}) {
  const model = useEditorStore(s => s.model);
  const read = useMemo(() => readReviewParams(params), [params]);
  const queue = useMemo(() => reviewQueue(model, level.id, read.scope), [model, level.id, read.scope]);
  const floorless = useMemo(() => (read.scope === "floor" ? floorlessProposals(model).length : 0), [model, read.scope]);

  /**
   * The proposals decided here, each with the version it was decided at. The
   * queue lists a decided proposal until a reload after the decision lands;
   * while it still lists it at that version, it is kept out of view. Showing
   * it again would let a second A decide it twice, and the 409 would blame a
   * teammate. That holds when the reload failed, too.
   *
   * A decision that fails is dropped, so its proposal comes back into view.
   * An Undo leaves the place two versions on, so it waits again by itself.
   *
   * A ref, so a key pressed straight after another reads it at once. `redraw`
   * shows each change, because the address may not move: the last proposal
   * leaves no `place` to go to.
   */
  const deciding = useRef(new Map<string, number>());
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const decided = new Set(
    queue.filter(({ place }) => deciding.current.get(place.id) === place.version).map(({ place }) => place.id));
  const current = currentProposal(queue, read.place, decided);
  const deps = { api, saver };

  /**
   * The next proposal loads at once, so a second A decides that one. If this
   * decision does not go through, the view comes back to it, where the
   * conflict banner or the error toast says why — unless you have left Review
   * meanwhile, where `place` would mean something else.
   */
  async function decide(entry: ProposedPlace, run: () => Promise<boolean>): Promise<void> {
    const { id, version } = entry.place;
    // Already on its way: a key pressed before the view moved on decides nothing.
    if (deciding.current.get(id) === version) return;
    deciding.current.set(id, version);
    const page = window.location.pathname;
    setParams({ place: nextProposal(queue, id, decided)?.place.id ?? null });
    redraw();
    if (await run()) return;
    if (deciding.current.get(id) === version) deciding.current.delete(id);
    redraw();
    if (window.location.pathname === page) setParams({ place: id });
  }

  const toScope = (scope: ReviewScope) => setParams({ scope: scope === "floor" ? null : scope, place: null });

  useKeys(event => {
    const command = reviewCommand(event.key);
    if (command === "list") setParams({ list: read.listOpen ? null : "open" });
    else if (command === "closeList" && read.listOpen) setParams({ list: null });
    else return;
    event.preventDefault();
  });

  if (!model) return <p className="p-8 text-sm text-stone-500">Loading the proposals…</p>;

  const counts = reviewCounts(model, level.id);
  const total = counts.confirmed + counts.proposed;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white px-4 py-2">
          {read.scope === "floor" ? (
            <>
              <span className="text-sm font-medium">{counts.confirmed} of {total} decided on {level.code}</span>
              <span className="w-40">
                <Progress value={counts.confirmed} max={total} label={`Review progress on ${level.code}`} tone="confirmed" />
              </span>
              {floorless > 0 && (
                <Button size="sm" variant="ghost" onClick={() => toScope("floorless")}>{floorless} on no floor →</Button>
              )}
            </>
          ) : (
            <>
              <span className="text-sm font-medium">
                {queue.length} proposal{queue.length === 1 ? "" : "s"} on no floor
              </span>
              <span className="text-xs text-stone-500">Accepting one here files it under {level.code}.</span>
              <Button size="sm" variant="ghost" onClick={() => toScope("floor")}>← Back to {level.code}</Button>
            </>
          )}
          <Button
            size="sm"
            className="ml-auto"
            aria-pressed={read.listOpen}
            onClick={() => setParams({ list: read.listOpen ? null : "open" })}
          >
            List <Kbd>L</Kbd>
          </Button>
        </div>

        {current ? (
          <ProposalFocus
            key={current.place.id}
            api={api}
            entry={current}
            evidence={evidenceFor(model, current.sightings)}
            findSame={name => sameAs(model, level.id, current.place, name)}
            onAccept={fields => void decide(current, () => acceptProposal(deps, current, fields, level.id))}
            onReject={() => void decide(current, () => rejectProposal(deps, current))}
            onSkip={() => setParams({ place: nextProposal(queue, current.place.id, decided)?.place.id ?? current.place.id })}
            onMerge={into => void decide(current, () => mergeProposal(deps, current, into))}
            onMoveBox={(sighting, box) => void saver.update("sighting", sighting.id, sighting.version, { box })}
          />
        ) : (
          <div className="grid flex-1 place-items-center p-8">
            <div className="max-w-md space-y-2 text-center text-sm text-stone-600">
              {read.scope === "floor" ? (
                <>
                  <p className="text-base font-medium text-stone-900">Nothing waiting on {level.code}.</p>
                  <p>
                    {counts.confirmed > 0
                      ? `${counts.confirmed} place${counts.confirmed === 1 ? "" : "s"} confirmed here.`
                      : "Proposals appear here once this floor's footage has been labelled."}
                  </p>
                  {floorless > 0 && (
                    <Button onClick={() => toScope("floorless")}>Review the {floorless} on no floor</Button>
                  )}
                </>
              ) : (
                <>
                  <p className="text-base font-medium text-stone-900">Every proposal is filed under a floor.</p>
                  <Button onClick={() => toScope("floor")}>Back to {level.code}</Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
