import type { Place } from "@oth/model";
import { ConflictError, isUnauthorized, type Api } from "../api/client";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import type { ProposedPlace } from "../survey/review";
import { reportFailure } from "../ui/failure";
import { offerUndo } from "../ui/offerUndo";
import { toast } from "../ui/toast";

/**
 * Decisions go straight to the API rather than through the saver: the saver's
 * Retry resends only its one write, after the decision has already returned,
 * so an accept that landed on the second try never offered its Undo. Here a
 * Retry makes the whole decision again.
 */
export type ReviewDeps = {
  api: Pick<Api, "acceptPlace" | "reopenPlace" | "rejectPlace" | "restoreEntity" | "mergePlace" | "unmergePlace">;
  saver: Pick<Saver, "refresh">;
};

/** The fields accept sends: a place with no floor of its own is filed under the one it was accepted on. */
function acceptFields(place: Place, fields: { nameEn: string; category: string }, levelId: string) {
  return { ...fields, ...(place.levelId ? {} : { levelId }) };
}

/** What Undo puts back after an accept: the place as it was, and the tags that accept confirmed. */
function reopen(api: ReviewDeps["api"], place: Place, confirmed: string[]) {
  return api.reopenPlace(place.id, place.version + 1, {
    nameEn: place.nameEn, category: place.category, levelId: place.levelId ?? null, sightingIds: confirmed,
  });
}

/** A teammate changed `place` since: the banner says so, rather than anything being overwritten. */
function showConflict(place: Place, err: ConflictError): void {
  useEditorStore.getState().setConflict({ entityType: "place", entityId: place.id, current: err.current });
}

/**
 * Says why a decision on `place` did not land. A teammate's change since is a
 * conflict, shown in the banner rather than overwritten. A 401 says nothing:
 * the sign-in dialog over the page is the message. Anything else is said
 * once, with Retry where trying again could work — and that Retry is `again`,
 * the whole decision, so one that lands on the second try still offers Undo.
 */
function refused(err: unknown, place: Place, doing: string, again: () => Promise<unknown>): void {
  if (isUnauthorized(err)) return;
  if (err instanceof ConflictError) {
    showConflict(place, err);
    return;
  }
  reportFailure(err, {
    doing,
    retry: async () => {
      await again();
    },
  });
}

/**
 * Reloads, so the queue shows what the server now has — after a decision that
 * failed too, since one whose answer never came may have landed all the same.
 * A reload that fails after a decision landed is said, and its Retry reloads:
 * deciding again would decide twice. After one that failed, that failure has
 * been said already.
 */
async function reload(saver: ReviewDeps["saver"], landed: boolean): Promise<void> {
  try {
    await saver.refresh();
  } catch (err) {
    if (!landed) return;
    reportFailure(err, {
      doing: "reload the map after saving",
      retry: async () => {
        await saver.refresh().catch(() => {});
      },
    });
  }
}

/**
 * A decision that lands on a place answers the conflict banner about that
 * place. One about another place stays: a second A can land while the banner
 * still says why the first did not.
 */
function settled(place: Place): void {
  const { conflict, setConflict } = useEditorStore.getState();
  if (conflict?.entityType === "place" && conflict.entityId === place.id) setConflict(null);
}

/** One decision: sent, said if it fails, reloaded either way. What the server answered, or null when it did not land. */
async function decide<T extends object>(
  { saver }: ReviewDeps, place: Place, doing: string, write: () => Promise<T>, again: () => Promise<unknown>,
): Promise<T | null> {
  let answer: T;
  try {
    answer = await write();
  } catch (err) {
    refused(err, place, doing, again);
    await reload(saver, false);
    return null;
  }
  settled(place);
  await reload(saver, true);
  return answer;
}

/**
 * Accepts one proposal with any corrections, and offers Undo. Every decision
 * leaves the place one version on, so Undo expects exactly that: a teammate's
 * change since is refused, not overwritten. Undo returns to claims only the
 * tags the server says this accept confirmed, never one a person confirmed.
 */
export async function acceptProposal(
  deps: ReviewDeps, entry: ProposedPlace, fields: { nameEn: string; category: string }, levelId: string,
): Promise<boolean> {
  const { api, saver } = deps;
  const { place } = entry;
  const accepted = await decide(
    deps, place, `accept ${fields.nameEn}`,
    () => api.acceptPlace(place.id, place.version, acceptFields(place, fields, levelId)),
    () => acceptProposal(deps, entry, fields, levelId),
  );
  if (!accepted) return false;
  offerUndo({
    message: `Accepted ${fields.nameEn}`,
    undone: `${place.nameEn} is back in the queue`,
    what: fields.nameEn,
    run: () => reopen(api, place, accepted.confirmed),
    refresh: saver.refresh,
  });
  return true;
}

/** Rejects one proposal; Undo is the restore that brings its tags back with it. */
export async function rejectProposal(deps: ReviewDeps, entry: ProposedPlace): Promise<boolean> {
  const { api, saver } = deps;
  const { place } = entry;
  const rejected = await decide(
    deps, place, `reject ${place.nameEn}`,
    () => api.rejectPlace(place.id, place.version),
    () => rejectProposal(deps, entry),
  );
  if (!rejected) return false;
  offerUndo({
    message: `Rejected ${place.nameEn}`,
    undone: `${place.nameEn} is back in the queue`,
    what: place.nameEn,
    run: () => api.restoreEntity("place", place.id, place.version + 1),
    refresh: saver.refresh,
  });
  return true;
}

/** "Same as…": merges the proposal into a place already there; Undo sends back exactly what moved. */
export async function mergeProposal(deps: ReviewDeps, entry: ProposedPlace, into: Place): Promise<boolean> {
  const { api, saver } = deps;
  const { place } = entry;
  const merged = await decide(
    deps, place, `merge ${place.nameEn} into ${into.nameEn}`,
    () => api.mergePlace(place.id, place.version, into.id),
    () => mergeProposal(deps, entry, into),
  );
  if (!merged) return false;
  offerUndo({
    message: `Merged ${place.nameEn} into ${into.nameEn}`,
    undone: `${place.nameEn} is back in the queue`,
    what: `the merge into ${into.nameEn}`,
    run: () => api.unmergePlace(place.id, place.version + 1, merged.moved),
    refresh: saver.refresh,
  });
  return true;
}

/** One proposal to accept with others, and what to accept it as: what was typed for it, or its own. */
export type Accepting = { entry: ProposedPlace; fields: { nameEn: string; category: string } };

/** "Gate 1", "Gate 1 and Gate 2", "Gate 1, Gate 2 and Gate 3", "Gate 1, Gate 2 and 3 more". */
function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

/** Says, once, which proposals of a batch were not accepted and wait in the list again. */
function sayReturned(names: readonly string[]): void {
  if (names.length === 0) return;
  toast({
    tone: "error",
    message: `${listNames(names)} ${names.length === 1 ? "wasn't accepted and is" : "weren't accepted and are"} back in the list.`,
  });
}

/**
 * Accepts several at once, each as `fields` says: one request each, one
 * reload at the end. Stops at the first that fails — a teammate's change is
 * shown as a conflict, not overwritten — and one Undo covers the ones that
 * went through. Retry sends the one that failed and those after it, never the
 * ones before.
 *
 * `held` names the ones the caller held back from the batch, whose corrected
 * box could not be saved. What came back is said in one message: one line
 * naming them all, beside the banner after a conflict; or the failure, whose
 * Retry sends the rest ("Couldn't accept Gate 1 and 2 more"). Only a batch
 * with both a Retry and a box held back says two things, since Retry must
 * not send those.
 */
export async function acceptProposals(
  deps: ReviewDeps, items: readonly Accepting[], levelId: string, held: readonly string[] = [],
): Promise<number> {
  const { api, saver } = deps;
  if (items.length === 0) {
    sayReturned(held);
    return 0;
  }
  const done: { place: Place; fields: Accepting["fields"]; confirmed: string[] }[] = [];
  let failed: { at: number; err: unknown } | null = null;
  for (let at = 0; at < items.length; at++) {
    const { entry: { place }, fields } = items[at]!;
    try {
      const { confirmed } = await api.acceptPlace(place.id, place.version, acceptFields(place, fields, levelId));
      done.push({ place, fields, confirmed });
      settled(place);
    } catch (err) {
      failed = { at, err };
      break;
    }
  }

  if (!failed) sayReturned(held);
  else if (!isUnauthorized(failed.err)) {
    const rest = items.slice(failed.at);
    const first = rest[0]!;
    if (failed.err instanceof ConflictError) {
      showConflict(first.entry.place, failed.err);
      sayReturned([...held, ...rest.map(({ fields }) => fields.nameEn)]);
    } else {
      const more = rest.length > 1 ? ` and ${rest.length - 1} more` : "";
      reportFailure(failed.err, {
        doing: `accept ${first.fields.nameEn}${more}`,
        retry: async () => { await acceptProposals(deps, rest, levelId); },
      });
      // Not in the Retry: their boxes are not saved, and accepting them
      // would settle the agent's box instead.
      sayReturned(held);
    }
  }
  await reload(saver, done.length > 0);

  if (done.length > 0) {
    const label = done.length === 1 ? done[0]!.fields.nameEn : `${done.length} places`;
    // Kept across attempts, so a Retry of the undo carries on from where it
    // stopped instead of reopening the first ones twice.
    const pending = [...done].reverse();
    offerUndo({
      message: `Accepted ${label}`,
      undone: done.length === 1 ? `${done[0]!.place.nameEn} is back in the queue` : `${label} are back in the queue`,
      // The place the undo stopped at, which is the one a failure is about:
      // "Couldn't undo: Gate 1 was changed since", never "2 places was".
      what: () => (pending[0] ?? done[0]!).fields.nameEn,
      run: async () => {
        while (pending.length > 0) {
          const next = pending[0]!;
          await reopen(api, next.place, next.confirmed);
          pending.shift();
        }
      },
      refresh: saver.refresh,
    });
  }
  return done.length;
}
