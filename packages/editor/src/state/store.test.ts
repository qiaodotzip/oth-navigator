import { parseModel } from "@oth/model";
import { beforeEach, describe, expect, it } from "vitest";
import { activeLevel, ringsOnActiveLevel, roomsOnActiveLevel, useEditorStore } from "./store";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4.5 },
  ],
  rooms: [
    { id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [5, 0], [5, 5]], heightM: 3, walkable: true },
    { id: "L2-a", levelId: "oth-L2", kind: "room", footprint: [[0, 0], [4, 0], [4, 4]], heightM: 3, walkable: true },
  ],
});

beforeEach(() => useEditorStore.getState().reset());

describe("editor store", () => {
  it("starts with no model and no user", () => {
    const s = useEditorStore.getState();
    expect(s.model).toBeNull();
    expect(s.user).toBeNull();
  });

  it("selects the lowest level automatically when a model loads", () => {
    useEditorStore.getState().setModel(model);
    expect(useEditorStore.getState().activeLevelId).toBe("oth-L1");
  });

  it("keeps the active level across a model refresh if it still exists", () => {
    useEditorStore.getState().setModel(model);
    useEditorStore.getState().setActiveLevel("oth-L2");
    useEditorStore.getState().setModel(model);
    expect(useEditorStore.getState().activeLevelId).toBe("oth-L2");
  });

  it("filters rooms to the active level", () => {
    useEditorStore.getState().setModel(model);
    expect(roomsOnActiveLevel(useEditorStore.getState()).map(r => r.id)).toEqual(["L1-a"]);
  });

  it("exposes the active level object", () => {
    useEditorStore.getState().setModel(model);
    expect(activeLevel(useEditorStore.getState())?.code).toBe("L1");
  });

  it("collects footprints on the active level for snapping", () => {
    useEditorStore.getState().setModel(model);
    expect(ringsOnActiveLevel(useEditorStore.getState())).toEqual([[[0, 0], [5, 0], [5, 5]]]);
  });

  it("clears the selection when the level changes", () => {
    useEditorStore.getState().setModel(model);
    useEditorStore.getState().select({ type: "room", id: "L1-a" });
    useEditorStore.getState().setActiveLevel("oth-L2");
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it("accumulates draft points while drawing", () => {
    useEditorStore.getState().setTool("draw-room");
    useEditorStore.getState().beginDraft();
    useEditorStore.getState().pushDraftPoint([1, 1]);
    useEditorStore.getState().pushDraftPoint([2, 2]);
    expect(useEditorStore.getState().draft).toEqual([[1, 1], [2, 2]]);
  });

  it("discards the draft when the tool changes, so a half-drawn room cannot leak", () => {
    useEditorStore.getState().setTool("draw-room");
    useEditorStore.getState().beginDraft();
    useEditorStore.getState().pushDraftPoint([1, 1]);
    useEditorStore.getState().setTool("select");
    expect(useEditorStore.getState().draft).toBeNull();
  });

  // M4: an id missing from `team` must not read as "left the team" before the
  // first fetch has even come back, and a failed fetch must not read as
  // "loaded, and empty" either.
  describe("teamStatus", () => {
    it("starts loading, with nobody on the team yet", () => {
      expect(useEditorStore.getState().teamStatus).toBe("loading");
      expect(useEditorStore.getState().team).toEqual([]);
    });

    it("is loaded once the team arrives", () => {
      useEditorStore.getState().setTeam([{ id: "u1", displayName: "A" }]);
      expect(useEditorStore.getState().teamStatus).toBe("loaded");
    });

    it("is error when the fetch fails, without touching team", () => {
      useEditorStore.getState().setTeamLoadError();
      expect(useEditorStore.getState().teamStatus).toBe("error");
      expect(useEditorStore.getState().team).toEqual([]);
    });
  });
});
