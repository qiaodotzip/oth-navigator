import { live, parseModel, type MapModel } from "@oth/model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Api } from "../api/client";
import type { BuildStepId } from "../flow/floorProgress";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { MakeStop } from "./MakeStop";

const sq = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const L1 = { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 };
const rooms = [
  { id: "L1-esc", levelId: "oth-L1", kind: "room", footprint: sq(4, 2, 6, 12), heightM: 6, nameEn: "Escalator - 07" },
  { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(10, 0, 20, 10), heightM: 3.5, nameEn: "Starbucks" },
  { id: "L1-done", levelId: "oth-L1", kind: "area", footprint: sq(30, 0, 32, 10), heightM: 6, walkable: true, nameEn: "Escalator - 08" },
  { id: "L1-half", levelId: "oth-L1", kind: "room", footprint: sq(40, 0, 42, 10), heightM: 6, nameEn: "Escalator - 09" },
  { id: "L1-hand", levelId: "oth-L1", kind: "room", footprint: sq(50, 0, 52, 10), heightM: 6, nameEn: "Stairs 2" },
  { id: "L1-lobby", levelId: "oth-L1", kind: "area", footprint: sq(60, 0, 70, 10), heightM: 6, walkable: true, nameEn: "Lift lobby" },
];
const model = parseModel({
  building, levels: [L1], rooms,
  portals: [{ id: "esc-8", kind: "escalator" }, { id: "esc-9", kind: "escalator" }, { id: "lift-h", kind: "lift" }],
  portalEndpoints: [
    { id: "esc-8-1", portalId: "esc-8", levelId: "oth-L1", roomId: "L1-done", point: [31, 5], footprint: sq(30, 0, 32, 10) },
    // Saved with its outline, but its space was never opened.
    { id: "esc-9-1", portalId: "esc-9", levelId: "oth-L1", roomId: "L1-half", point: [41, 5], footprint: sq(40, 0, 42, 10) },
    // Placed by hand with the Lift or stair tool, which makes a lift and gives it no outline.
    { id: "hand-1", portalId: "lift-h", levelId: "oth-L1", roomId: "L1-hand", point: [51, 5] },
  ],
});

function setup(roomId: string, step: BuildStepId, { created = [true, true], updated = true, m = model }: {
  created?: boolean[]; updated?: boolean; m?: MapModel;
} = {}) {
  useEditorStore.getState().setModel(m);
  const saver = {
    create: vi.fn(async () => created.shift() ?? true),
    update: vi.fn(async () => updated),
    remove: vi.fn(async () => true),
    refresh: vi.fn(async () => {}),
  };
  const api = fakeApi() as Api & Record<"updateEntity" | "deleteEntity", ReturnType<typeof vi.fn>>;
  render(<MakeStop api={api} saver={saver as unknown as Saver} room={live(m.rooms).find(r => r.id === roomId)!} step={step} />);
  return { saver, api };
}

const toasts = () => useToasts.getState().toasts;
const undoToast = () => toasts().find(t => t.action?.label === "Undo");

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
  useToasts.getState().clear();
});

describe("MakeStop", () => {
  it("offers lift, escalator or stairs for any space on Entrances & lifts", () => {
    setup("L1-shop", "entrances");
    for (const name of ["Lift", "Escalator", "Stairs"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.getByText(/loses its walls and becomes walkable/)).toBeTruthy();
  });

  it("offers it on any step for a space the drawing named like one", () => {
    setup("L1-esc", "rooms");
    expect(screen.getByRole("button", { name: "Escalator" })).toBeTruthy();
  });

  it("does not offer it for an ordinary room on another step", () => {
    setup("L1-shop", "rooms");
    expect(screen.queryByRole("button", { name: "Escalator" })).toBeNull();
  });

  it("does not offer it on another step for a space named for what is beside one", () => {
    setup("L1-lobby", "rooms");
    expect(screen.queryByRole("button", { name: "Lift" })).toBeNull();
  });

  it("offers nothing for a space that is already a stop", () => {
    setup("L1-done", "entrances");
    expect(screen.queryByRole("button", { name: "Escalator" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Finish opening it" })).toBeNull();
  });

  it("saves the escalator, then its stop with the room's outline, then opens the room", async () => {
    const { saver } = setup("L1-esc", "entrances");
    fireEvent.click(screen.getByRole("button", { name: "Escalator" }));
    await waitFor(() => expect(saver.update).toHaveBeenCalledWith("room", "L1-esc", 0, { kind: "area", walkable: true }));
    const [first, second] = saver.create.mock.calls as unknown as Array<[string, Record<string, unknown>, unknown]>;
    expect(first![0]).toBe("portal");
    expect(first![1]).toMatchObject({ kind: "escalator" });
    expect(second![0]).toBe("portalEndpoint");
    expect(second![1]).toMatchObject({ roomId: "L1-esc", footprint: sq(4, 2, 6, 12) });
  });

  it("takes the new escalator back out when its stop is refused", async () => {
    const { saver } = setup("L1-esc", "entrances", { created: [true, false] });
    fireEvent.click(screen.getByRole("button", { name: "Escalator" }));
    await waitFor(() => expect(saver.remove).toHaveBeenCalledWith("portal", expect.stringMatching(/^portal-/), 0));
    expect(saver.update).not.toHaveBeenCalled();
  });

  it("says what to do next, with an Undo that closes the space and takes the stop and the escalator back out", async () => {
    const { saver, api } = setup("L1-esc", "entrances");
    fireEvent.click(screen.getByRole("button", { name: "Escalator" }));
    await waitFor(() => expect(undoToast()).toBeTruthy());
    expect(undoToast()!.message).toBe("Escalator added. Switch floor and click its dashed outline to add its next stop.");
    const portalId = (saver.create.mock.calls[0] as unknown as [string, { id: string }])[1].id;
    const stopId = (saver.create.mock.calls[1] as unknown as [string, { id: string }])[1].id;

    await undoToast()!.action!.run();
    expect(api.updateEntity).toHaveBeenCalledWith("room", "L1-esc", 1, { kind: "room", walkable: false });
    expect(api.deleteEntity).toHaveBeenNthCalledWith(1, "portalEndpoint", stopId, 0);
    expect(api.deleteEntity).toHaveBeenNthCalledWith(2, "portal", portalId, 0);
    // The reverse of the saves: the space, then the stop, then the escalator.
    expect(api.updateEntity.mock.invocationCallOrder[0]!).toBeLessThan(api.deleteEntity.mock.invocationCallOrder[0]!);
    expect(saver.refresh).toHaveBeenCalled();
    expect(toasts().some(t => t.message === "Escalator - 07 is back as it was")).toBe(true);
  });

  it("claims no success when the space isn't opened, and offers to finish instead", async () => {
    const { saver } = setup("L1-esc", "entrances", { updated: false });
    fireEvent.click(screen.getByRole("button", { name: "Escalator" }));
    await waitFor(() => expect(saver.update).toHaveBeenCalledWith("room", "L1-esc", 0, { kind: "area", walkable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(toasts().some(t => /added/.test(t.message))).toBe(false);
    expect(undoToast()).toBeUndefined();
  });

  it("asks for a landing on the floor above first, when it has no space traced over the spot", async () => {
    const twoFloors = parseModel({
      building, rooms,
      levels: [L1, { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 5 }],
    });
    setup("L1-esc", "entrances", { m: twoFloors });
    fireEvent.click(screen.getByRole("button", { name: "Escalator" }));
    await waitFor(() => expect(undoToast()).toBeTruthy());
    expect(undoToast()!.message).toBe(
      "Escalator added. L2 has no space traced over this spot yet: trace its landing there first, then switch floor and click the dashed outline to add the next stop.",
    );
  });

  it("gives a stop placed here by hand the outline and the kind chosen, rather than a twin", async () => {
    const { saver, api } = setup("L1-hand", "rooms");
    fireEvent.click(screen.getByRole("button", { name: "Stairs" }));
    await waitFor(() => expect(undoToast()).toBeTruthy());
    expect(saver.create).not.toHaveBeenCalled();
    expect(saver.update.mock.calls).toEqual([
      ["portal", "lift-h", 0, { kind: "stair", stepFree: false }],
      ["portalEndpoint", "hand-1", 0, { footprint: sq(50, 0, 52, 10) }],
      ["room", "L1-hand", 0, { kind: "area", walkable: true }],
    ]);
    expect(undoToast()!.message).toBe("Stairs built from this outline, at the stop already here.");

    await undoToast()!.action!.run();
    expect(api.updateEntity.mock.calls).toEqual([
      ["room", "L1-hand", 1, { kind: "room", walkable: false }],
      ["portalEndpoint", "hand-1", 1, { footprint: null }],
      ["portal", "lift-h", 1, { kind: "lift", stepFree: true }],
    ]);
    expect(api.deleteEntity).not.toHaveBeenCalled();
  });

  it("offers to finish opening a space whose stop is saved, on any step, with Undo", async () => {
    const { saver, api } = setup("L1-half", "rooms");
    expect(screen.queryByRole("button", { name: "Escalator" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Finish opening it" }));
    await waitFor(() => expect(undoToast()).toBeTruthy());
    expect(saver.update).toHaveBeenCalledWith("room", "L1-half", 0, { kind: "area", walkable: true });
    expect(undoToast()!.message).toBe("Opened Escalator - 09");
    await undoToast()!.action!.run();
    expect(api.updateEntity).toHaveBeenCalledWith("room", "L1-half", 1, { kind: "room", walkable: false });
  });
});
