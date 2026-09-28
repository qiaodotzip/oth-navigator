import { PlaceSchema, SightingSchema } from "@oth/model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ConflictError } from "../api/client";
import { useEditorStore } from "../state/store";
import type { ProposedPlace } from "../survey/review";
import { useToasts } from "../ui/toast";
import { acceptProposal, acceptProposals, mergeProposal, rejectProposal, type ReviewDeps } from "./decide";

function entry(id: string, extra: Record<string, unknown> = {}): ProposedPlace {
  return {
    place: PlaceSchema.parse({ id, nameEn: `Name ${id}`, category: "retail", status: "proposed", version: 3, ...extra }),
    sightings: [SightingSchema.parse({ id: `s_${id}`, placeId: id, keyframeId: "kf_1", status: "proposed" })],
  };
}

function deps() {
  const api = {
    acceptPlace: vi.fn(async (id: string) => ({ sightings: 1, confirmed: [`s_${id}`] })),
    reopenPlace: vi.fn(async () => ({ sightings: 1 })),
    rejectPlace: vi.fn(async () => ({ sightings: 1 })),
    restoreEntity: vi.fn(async () => ({})),
    mergePlace: vi.fn(async () => ({ moved: [{ id: "s_p1", status: "proposed" as const }] })),
    unmergePlace: vi.fn(async () => ({ sightings: 1 })),
  };
  const saver = {
    refresh: vi.fn(async () => {}),
  };
  return { api, saver, both: { api, saver } as unknown as ReviewDeps };
}

const lastToast = () => useToasts.getState().toasts.at(-1)!;
const failure = () => useToasts.getState().toasts.find(t => t.tone === "error")!;
const undo = async () => { await useToasts.getState().toasts.find(t => t.action?.label === "Undo")!.action!.run(); };

beforeEach(() => {
  useToasts.getState().clear();
  useEditorStore.getState().reset();
});

describe("acceptProposal", () => {
  it("accepts with the corrections, files a floorless place under this floor, and offers Undo", async () => {
    const { api, both } = deps();
    expect(await acceptProposal(both, entry("p1"), { nameEn: "Festive Mall", category: "lifestyle" }, "oth-L1")).toBe(true);
    expect(api.acceptPlace).toHaveBeenCalledWith("p1", 3, { nameEn: "Festive Mall", category: "lifestyle", levelId: "oth-L1" });
    expect(lastToast()).toMatchObject({ message: "Accepted Festive Mall", action: { label: "Undo" } });
  });

  it("leaves a place's own floor alone", async () => {
    const { api, both } = deps();
    await acceptProposal(both, entry("p1", { levelId: "oth-L2" }), { nameEn: "X", category: "retail" }, "oth-L1");
    expect((api.acceptPlace.mock.calls[0] as unknown[])[2]).toEqual({ nameEn: "X", category: "retail" });
  });

  it("undoes exactly: the name, category and floor it had, and the tags it confirmed", async () => {
    const { api, saver, both } = deps();
    await acceptProposal(both, entry("p1"), { nameEn: "Festive Mall", category: "lifestyle" }, "oth-L1");
    await undo();
    expect(api.reopenPlace).toHaveBeenCalledWith("p1", 4, {
      nameEn: "Name p1", category: "retail", levelId: null, sightingIds: ["s_p1"],
    });
    expect(saver.refresh).toHaveBeenCalled();
  });

  it("never un-confirms a tag a person confirmed: Undo names only the tags this accept confirmed", async () => {
    const { api, both } = deps();
    const mixed: ProposedPlace = {
      place: entry("p1").place,
      sightings: [
        SightingSchema.parse({ id: "s_typed", placeId: "p1", keyframeId: "kf_1", status: "confirmed" }),
        SightingSchema.parse({ id: "s_claim", placeId: "p1", keyframeId: "kf_2", status: "proposed" }),
      ],
    };
    api.acceptPlace.mockResolvedValueOnce({ sightings: 1, confirmed: ["s_claim"] });
    await acceptProposal(both, mixed, { nameEn: "X", category: "retail" }, "oth-L1");
    await undo();
    expect(api.reopenPlace).toHaveBeenCalledWith("p1", 4, expect.objectContaining({ sightingIds: ["s_claim"] }));
  });

  it("offers no Undo when the accept did not go through, and shows a teammate's change as a conflict", async () => {
    const { api, saver, both } = deps();
    api.acceptPlace.mockRejectedValueOnce(new ConflictError({ id: "p1", version: 4 }, null));
    expect(await acceptProposal(both, entry("p1"), { nameEn: "X", category: "retail" }, "oth-L1")).toBe(false);
    expect(useToasts.getState().toasts).toHaveLength(0);
    expect(useEditorStore.getState().conflict?.entityId).toBe("p1");
    expect(saver.refresh).toHaveBeenCalled();
  });

  it("makes the whole accept again on Retry, and the one that lands offers the Undo", async () => {
    // Task 11's lesson: the saver's Retry resent one write, after this had
    // already returned, so an accept that landed on the second try had no Undo.
    const { api, saver, both } = deps();
    api.acceptPlace.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await acceptProposal(both, entry("p1"), { nameEn: "Festive Mall", category: "lifestyle" }, "oth-L1")).toBe(false);
    expect(saver.refresh).toHaveBeenCalledTimes(1);
    expect(useToasts.getState().toasts).toHaveLength(1);
    expect(failure()).toMatchObject({
      message: "Couldn't accept Festive Mall. Check your connection, then retry.",
      action: { label: "Retry" },
    });

    await failure().action!.run();
    expect(api.acceptPlace).toHaveBeenCalledTimes(2);
    expect(api.acceptPlace).toHaveBeenLastCalledWith("p1", 3, { nameEn: "Festive Mall", category: "lifestyle", levelId: "oth-L1" });
    expect(lastToast()).toMatchObject({ message: "Accepted Festive Mall", action: { label: "Undo" } });
    await undo();
    expect(api.reopenPlace).toHaveBeenCalledTimes(1);
    expect(api.reopenPlace).toHaveBeenCalledWith("p1", 4, expect.objectContaining({ sightingIds: ["s_p1"] }));
  });

  it("says nothing of its own when the session has ended", async () => {
    // The sign-in dialog over the page is the message.
    const { api, both } = deps();
    api.acceptPlace.mockRejectedValueOnce(new ApiError(401, null));
    expect(await acceptProposal(both, entry("p1"), { nameEn: "X", category: "retail" }, "oth-L1")).toBe(false);
    expect(useToasts.getState().toasts).toHaveLength(0);
    expect(useEditorStore.getState().conflict).toBeNull();
  });

  it("says a refusal in the server's words, with no Retry that would only be refused again", async () => {
    const { api, both } = deps();
    api.acceptPlace.mockRejectedValueOnce(new ApiError(422, { error: "There is no floor oth-L9." }));
    expect(await acceptProposal(both, entry("p1"), { nameEn: "X", category: "retail" }, "oth-L9")).toBe(false);
    expect(lastToast()).toMatchObject({ tone: "error", message: "Couldn't accept X: There is no floor oth-L9." });
    expect(lastToast().action).toBeUndefined();
  });

  it("says so when the reload after an accept fails, and its Retry reloads rather than accepting again", async () => {
    const { api, saver, both } = deps();
    saver.refresh.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await acceptProposal(both, entry("p1"), { nameEn: "Festive Mall", category: "retail" }, "oth-L1")).toBe(true);
    expect(failure()).toMatchObject({
      message: "Couldn't reload the map after saving. Check your connection, then retry.",
      action: { label: "Retry" },
    });
    expect(lastToast()).toMatchObject({ message: "Accepted Festive Mall", action: { label: "Undo" } });
    await failure().action!.run();
    expect(saver.refresh).toHaveBeenCalledTimes(2);
    expect(api.acceptPlace).toHaveBeenCalledTimes(1);
  });

  it("clears a conflict about this place once a decision on it lands, and leaves one about another", async () => {
    // A second A can land while the banner still explains why the first did not.
    const { both } = deps();
    const { setConflict } = useEditorStore.getState();
    setConflict({ entityType: "place", entityId: "p2", current: null });
    await acceptProposal(both, entry("p1"), { nameEn: "X", category: "retail" }, "oth-L1");
    expect(useEditorStore.getState().conflict?.entityId).toBe("p2");
    setConflict({ entityType: "place", entityId: "p1", current: null });
    await acceptProposal(both, entry("p1", { version: 4 }), { nameEn: "X", category: "retail" }, "oth-L1");
    expect(useEditorStore.getState().conflict).toBeNull();
  });
});

describe("rejectProposal", () => {
  it("rejects, and Undo restores the place with its tags", async () => {
    const { api, both } = deps();
    expect(await rejectProposal(both, entry("p1"))).toBe(true);
    expect(api.rejectPlace).toHaveBeenCalledWith("p1", 3);
    expect(lastToast().message).toBe("Rejected Name p1");
    await undo();
    expect(api.restoreEntity).toHaveBeenCalledWith("place", "p1", 4);
  });

  it("rejects all over again on Retry, and the one that lands offers the Undo", async () => {
    const { api, both } = deps();
    api.rejectPlace.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await rejectProposal(both, entry("p1"))).toBe(false);
    expect(failure()).toMatchObject({
      message: "Couldn't reject Name p1. Check your connection, then retry.",
      action: { label: "Retry" },
    });
    await failure().action!.run();
    expect(api.rejectPlace).toHaveBeenCalledTimes(2);
    expect(lastToast()).toMatchObject({ message: "Rejected Name p1", action: { label: "Undo" } });
  });
});

describe("mergeProposal", () => {
  const into = PlaceSchema.parse({ id: "p_conf", nameEn: "Gate 1", category: "facility" });

  it("merges into the place already there, and Undo sends back exactly what moved", async () => {
    const { api, both } = deps();
    expect(await mergeProposal(both, entry("p1"), into)).toBe(true);
    expect(api.mergePlace).toHaveBeenCalledWith("p1", 3, "p_conf");
    expect(lastToast().message).toBe("Merged Name p1 into Gate 1");
    await undo();
    expect(api.unmergePlace).toHaveBeenCalledWith("p1", 4, [{ id: "s_p1", status: "proposed" }]);
  });

  it("merges all over again on Retry, and Undo sends back what the merge that landed moved", async () => {
    const { api, both } = deps();
    api.mergePlace.mockRejectedValueOnce(new ApiError(503, null));
    expect(await mergeProposal(both, entry("p1"), into)).toBe(false);
    expect(failure()).toMatchObject({
      message: "Couldn't merge Name p1 into Gate 1: the server had a problem. Try again in a moment.",
      action: { label: "Retry" },
    });
    await failure().action!.run();
    expect(api.mergePlace).toHaveBeenCalledTimes(2);
    await undo();
    expect(api.unmergePlace).toHaveBeenCalledWith("p1", 4, [{ id: "s_p1", status: "proposed" }]);
  });
});

describe("acceptProposals", () => {
  it("accepts several as they stand, reloads once, and offers one Undo for all", async () => {
    const { api, saver, both } = deps();
    expect(await acceptProposals(both, [entry("p1"), entry("p2")], "oth-L1")).toBe(2);
    expect(api.acceptPlace.mock.calls.map(c => c[0])).toEqual(["p1", "p2"]);
    expect(saver.refresh).toHaveBeenCalledTimes(1);
    expect(lastToast().message).toBe("Accepted 2 places");
    await undo();
    expect(api.reopenPlace.mock.calls.map(c => (c as unknown[])[0])).toEqual(["p2", "p1"]);
  });

  it("stops at a place a teammate changed, shows the conflict, and Undo covers the ones that went through", async () => {
    const { api, both } = deps();
    api.acceptPlace
      .mockResolvedValueOnce({ sightings: 1, confirmed: ["s_p1"] })
      .mockRejectedValueOnce(new ConflictError({ id: "p2", version: 9 }, null));
    expect(await acceptProposals(both, [entry("p1"), entry("p2"), entry("p3")], "oth-L1")).toBe(1);
    expect(api.acceptPlace).toHaveBeenCalledTimes(2);
    expect(useEditorStore.getState().conflict?.entityId).toBe("p2");
    expect(lastToast().message).toBe("Accepted Name p1");
  });

  it("sends the rest again on Retry after a failure part-way, never the ones that went through", async () => {
    const { api, both } = deps();
    api.acceptPlace
      .mockResolvedValueOnce({ sightings: 1, confirmed: ["s_p1"] })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await acceptProposals(both, [entry("p1"), entry("p2"), entry("p3")], "oth-L1")).toBe(1);
    expect(failure()).toMatchObject({
      message: "Couldn't accept Name p2. Check your connection, then retry.",
      action: { label: "Retry" },
    });
    await failure().action!.run();
    expect(api.acceptPlace.mock.calls.map(c => c[0])).toEqual(["p1", "p2", "p2", "p3"]);
    const rest = useToasts.getState().toasts.find(t => t.message === "Accepted 2 places")!;
    await rest.action!.run();
    expect(api.reopenPlace.mock.calls.map(c => (c as unknown[])[0])).toEqual(["p3", "p2"]);
  });

  it("names the place whose Undo was refused, not a count, so the sentence reads right", async () => {
    // "Couldn't undo: 2 places was changed since" said neither which one nor good English.
    const { api, both } = deps();
    api.reopenPlace
      .mockResolvedValueOnce({ sightings: 1 })
      .mockRejectedValueOnce(new ConflictError({ id: "p1", version: 9 }, null));
    await acceptProposals(both, [entry("p1"), entry("p2")], "oth-L1");
    await undo();
    expect(api.reopenPlace.mock.calls.map(c => (c as unknown[])[0])).toEqual(["p2", "p1"]);
    expect(lastToast().message).toBe("Couldn't undo: Name p1 was changed since. Reload to see the latest.");
  });

  it("names the place an Undo stopped at when it never arrived, and Retry carries on from there", async () => {
    const { api, both } = deps();
    api.reopenPlace
      .mockResolvedValueOnce({ sightings: 1 })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await acceptProposals(both, [entry("p1"), entry("p2")], "oth-L1");
    await undo();
    expect(failure()).toMatchObject({
      message: "Couldn't undo Name p1. Check your connection, then retry.",
      action: { label: "Retry" },
    });
    await failure().action!.run();
    expect(api.reopenPlace.mock.calls.map(c => (c as unknown[])[0])).toEqual(["p2", "p1", "p1"]);
    expect(lastToast()).toMatchObject({ tone: "success", message: "2 places are back in the queue" });
  });
});
