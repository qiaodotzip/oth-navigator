import type { Box, Level, Place, Sighting } from "@oth/model";
import { useEffect, useMemo, useReducer, useRef } from "react";
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
import { isTyping } from "../ui/typing";
import { acceptProposal, acceptProposals, mergeProposal, rejectProposal } from "./decide";
import { reviewCommand } from "./keys";
import { ProposalDrawer } from "./ProposalDrawer";
import { ProposalFocus, type Draft } from "./ProposalFocus";
import {
  currentProposal, evidenceFor, floorlessProposals, nextProposal, readReviewParams, reviewQueue, sameAs,
  type ReviewScope,
} from "./queue";

/**
 * A decision under way: the version it was made at, and what it leaves the
 * place as. An accept confirms it; a reject or a merge retires it.
 */
type Deciding = { version: number; becomes: "confirmed" | "gone" };

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
  const floorlessAll = useMemo(() => (read.scope === "floor" ? floorlessProposals(model) : []), [model, read.scope]);

  /**
   * The proposals decided here, each with the version it was decided at. The
   * queue lists a decided proposal until a reload after the decision lands;
   * while it still lists it at that version, it is kept out of view and out
   * of the counts. Showing it again would let a second A decide it twice, and
   * the 409 would blame a teammate. That holds when the reload failed, too.
   *
   * A decision that fails is dropped, so its proposal comes back into view.
   * An Undo leaves the place two versions on, so it waits again by itself.
   *
   * A ref, so a key pressed straight after another reads it at once. `redraw`
   * shows each change, because the address may not move: the last proposal
   * leaves no `place` to go to.
   */
  const deciding = useRef(new Map<string, Deciding>());
  /** Box corrections still being saved, by proposal: a decision on it waits for them. */
  const correcting = useRef(new Map<string, Promise<boolean>>());
  /** What was typed for each proposal, so one whose decision fails comes back as you left it. */
  const drafts = useRef(new Map<string, Draft>());
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  const underWay = (place: Place): Deciding | null => {
    const d = deciding.current.get(place.id);
    return d && d.version === place.version ? d : null;
  };
  /** A decision that did not go through: the place is waiting again, in view and in the list. */
  const release = (place: Place): void => {
    if (deciding.current.get(place.id)?.version === place.version) deciding.current.delete(place.id);
  };
  /** What a proposal is accepted as from the list: what was typed for it, trimmed, or its own. */
  const fieldsFor = ({ place }: ProposedPlace): Draft => {
    const draft = drafts.current.get(place.id);
    return draft ? { nameEn: draft.nameEn.trim(), category: draft.category } : { nameEn: place.nameEn, category: place.category };
  };
  const decided = new Set(queue.filter(({ place }) => underWay(place)).map(({ place }) => place.id));
  const current = currentProposal(queue, read.place, decided);
  const floorless = floorlessAll.filter(({ place }) => !underWay(place)).length;
  const deps = { api, saver };

  /**
   * Saves a corrected box, and holds on to the save until it lands so that a
   * decision on the same proposal waits for it. A second correction made
   * before the first has landed is waited for with it; the box is saved when
   * the last one is.
   */
  function correctBox(placeId: string, sighting: Sighting, box: Box): void {
    const earlier = correcting.current.get(placeId);
    const sent = saver.update("sighting", sighting.id, sighting.version, { box });
    const saved = earlier ? Promise.all([earlier, sent]).then(([, ok]) => ok) : sent;
    correcting.current.set(placeId, saved);
    void saved.then(() => {
      if (correcting.current.get(placeId) === saved) correcting.current.delete(placeId);
    });
  }

  /**
   * The next proposal loads at once, so a second A decides that one. If this
   * decision does not go through, the view comes back to it, where the
   * conflict banner or the error toast says why.
   */
  async function decide(entry: ProposedPlace, becomes: Deciding["becomes"], run: () => Promise<boolean>): Promise<void> {
    const { id, version } = entry.place;
    // A backstop. The view moves on below before anything is awaited, so no
    // key or button can reach this proposal again until it comes back; this
    // catches only a press that lands before React has redrawn.
    if (deciding.current.get(id)?.version === version) return;
    deciding.current.set(id, { version, becomes });
    const page = window.location.pathname;
    setParams({ place: nextProposal(queue, id, decided)?.place.id ?? null });
    redraw();

    // A box corrected just before deciding is saved first. Sent after the
    // decision, it would meet the tag at a version the decision has moved on,
    // and its 409 would blame a teammate; and if it fails, the decision would
    // settle the agent's box, not yours. Its failure is said by the saver.
    const correction = correcting.current.get(id);
    if ((!correction || await correction) && await run()) {
      drafts.current.delete(id);
      return;
    }

    release(entry.place);
    redraw();
    // Not back to it when you have left Review, where `place` means something
    // else, or while you are typing on the next one: the banner or the toast,
    // with its Retry, says what failed, and it waits in the queue.
    if (window.location.pathname !== page || isTyping(document.activeElement)) return;
    setParams({ place: id });
  }

  /**
   * Accepts several ticked in the list, each as typed for it or as it stands,
   * with one Undo for all. They join the decisions under way, as A does, so
   * they leave the list, the view and the counts at once, and none can be
   * decided twice.
   *
   * One whose corrected box could not be saved is not accepted, nor is the
   * first the server refuses or any after it: each comes back to the list
   * and the queue, and one message names them. The view is not pulled back,
   * as A's would be; you are in the list.
   */
  async function acceptMany(entries: readonly ProposedPlace[]): Promise<void> {
    // The same backstop as decide's: one already under way is not sent again.
    // Nor is one whose name was emptied, which the list does not offer: a
    // place with no name is no place, from the list as from A.
    const batch = entries.filter(entry => !underWay(entry.place) && fieldsFor(entry).nameEn !== "");
    if (batch.length === 0) return;
    for (const { place } of batch) deciding.current.set(place.id, { version: place.version, becomes: "confirmed" });
    if (current && batch.some(({ place }) => place.id === current.place.id)) {
      const gone = new Set([...decided, ...batch.map(({ place }) => place.id)]);
      setParams({ place: nextProposal(queue, current.place.id, gone)?.place.id ?? null });
    }
    redraw();

    // As in decide: a box corrected just before is saved first, and one that
    // was not saved is not accepted with the agent's box instead.
    const items = batch.map(entry => ({ entry, fields: fieldsFor(entry) }));
    const saved = await Promise.all(batch.map(({ place }) => correcting.current.get(place.id) ?? true));
    const ready = items.filter((_, i) => saved[i]);
    const held = items.filter((_, i) => !saved[i]);
    const accepted = await acceptProposals(deps, ready, level.id, held.map(({ fields }) => fields.nameEn));

    for (const { entry } of ready.slice(0, accepted)) drafts.current.delete(entry.place.id);
    const back = [...held, ...ready.slice(accepted)];
    if (back.length === 0) return;
    for (const { entry } of back) release(entry.place);
    redraw();
  }

  /** The List button, which has the focus back when the list closes, however it closed. */
  const listButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(read.listOpen);
  useEffect(() => {
    if (wasOpen.current && !read.listOpen) listButton.current?.focus();
    wasOpen.current = read.listOpen;
  }, [read.listOpen]);

  const toScope = (scope: ReviewScope) => setParams({ scope: scope === "floor" ? null : scope, place: null });

  useKeys(event => {
    const command = reviewCommand(event.key);
    if (command === "list") setParams({ list: read.listOpen ? null : "open" });
    else if (command === "closeList" && read.listOpen) setParams({ list: null });
    else return;
    event.preventDefault();
  });

  if (!model) return <p className="p-8 text-sm text-stone-500">Loading the proposals…</p>;

  // The model catches up only when the reload after a decision lands. Until
  // then, a decision under way counts as made, so the line agrees with the
  // proposal on screen.
  const counts = reviewCounts(model, level.id);
  const settling = read.scope === "floor" ? queue.flatMap(({ place }) => underWay(place) ?? []) : [];
  const confirmed = counts.confirmed + settling.filter(d => d.becomes === "confirmed").length;
  const total = confirmed + counts.proposed - settling.length;
  const waiting = queue.length - decided.size;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white px-4 py-2">
          {read.scope === "floor" ? (
            <>
              <span className="text-sm font-medium">{confirmed} of {total} decided on {level.code}</span>
              <span className="w-40">
                <Progress value={confirmed} max={total} label={`Review progress on ${level.code}`} tone="confirmed" />
              </span>
              {floorless > 0 && (
                <Button size="sm" variant="ghost" onClick={() => toScope("floorless")}>{floorless} on no floor →</Button>
              )}
            </>
          ) : (
            <>
              <span className="text-sm font-medium">
                {waiting} proposal{waiting === 1 ? "" : "s"} on no floor
              </span>
              <span className="text-xs text-stone-500">Accepting one here files it under {level.code}.</span>
              <Button size="sm" variant="ghost" onClick={() => toScope("floor")}>← Back to {level.code}</Button>
            </>
          )}
          <Button
            ref={listButton}
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
            draft={drafts.current.get(current.place.id)}
            decideByKey={!read.listOpen}
            findSame={name => sameAs(model, level.id, current.place, name)}
            onDraft={draft => {
              drafts.current.set(current.place.id, draft);
              // The list shows each proposal as it would be accepted, so it follows what you type.
              if (read.listOpen) redraw();
            }}
            onAccept={fields => void decide(current, "confirmed", () => acceptProposal(deps, current, fields, level.id))}
            onReject={() => void decide(current, "gone", () => rejectProposal(deps, current))}
            onSkip={() => setParams({ place: nextProposal(queue, current.place.id, decided)?.place.id ?? current.place.id })}
            onMerge={into => void decide(current, "gone", () => mergeProposal(deps, current, into))}
            onMoveBox={(sighting, box) => correctBox(current.place.id, sighting, box)}
          />
        ) : (
          <div className="grid flex-1 place-items-center p-8">
            <div className="max-w-md space-y-2 text-center text-sm text-stone-600">
              {read.scope === "floor" ? (
                <>
                  <p className="text-base font-medium text-stone-900">Nothing waiting on {level.code}.</p>
                  <p>
                    {confirmed > 0
                      ? `${confirmed} place${confirmed === 1 ? "" : "s"} confirmed here.`
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
      {read.listOpen && (
        <ProposalDrawer
          queue={queue}
          decided={decided}
          currentId={current?.place.id ?? null}
          frames={entry => evidenceFor(model, entry.sightings).length}
          named={entry => fieldsFor(entry).nameEn}
          onJump={placeId => setParams({ place: placeId })}
          onAcceptMany={acceptMany}
          onClose={() => setParams({ list: null })}
        />
      )}
    </div>
  );
}
