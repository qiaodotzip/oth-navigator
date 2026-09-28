import { live, parseModel } from "@oth/model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildStepId } from "../flow/floorProgress";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { MakeStop } from "./MakeStop";

const sq = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [
    { id: "L1-esc", levelId: "oth-L1", kind: "room", footprint: sq(4, 2, 6, 12), heightM: 6, nameEn: "Escalator - 07" },
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(10, 0, 20, 10), heightM: 3.5, nameEn: "Starbucks" },
    { id: "L1-done", levelId: "oth-L1", kind: "area", footprint: sq(30, 0, 32, 10), heightM: 6, walkable: true, nameEn: "Escalator - 08" },
  ],
  portals: [{ id: "esc-8", kind: "escalator" }],
  portalEndpoints: [{ id: "esc-8-1", portalId: "esc-8", levelId: "oth-L1", roomId: "L1-done", point: [31, 5], footprint: sq(30, 0, 32, 10) }],
});

function setup(roomId: string, step: BuildStepId, created: boolean[] = [true, true]) {
  const saver = {
    create: vi.fn(async () => created.shift() ?? true),
    update: vi.fn(async () => true),
    remove: vi.fn(async () => true),
  };
  render(<MakeStop saver={saver as unknown as Saver} room={live(model.rooms).find(r => r.id === roomId)!} step={step} />);
  return saver;
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
});

describe("MakeStop", () => {
  it("offers lift, escalator or stairs for any space on Entrances & lifts", () => {
    setup("L1-shop", "entrances");
    for (const name of ["Lift", "Escalator", "Stairs"]) expect(screen.getByRole("button", { name })).toBeTruthy();
  });

  it("offers it on any step for a space the drawing named like one", () => {
    setup("L1-esc", "rooms");
    expect(screen.getByRole("button", { name: "Escalator" })).toBeTruthy();
  });

  it("does not offer it for an ordinary room on another step", () => {
    setup("L1-shop", "rooms");
    expect(screen.queryByRole("button", { name: "Escalator" })).toBeNull();
  });

  it("offers nothing for a space that is already a stop", () => {
    setup("L1-done", "entrances");
    expect(screen.queryByRole("button", { name: "Escalator" })).toBeNull();
  });

  it("saves the escalator, then its stop with the room's outline, then opens the room", async () => {
    const saver = setup("L1-esc", "entrances");
    fireEvent.click(screen.getByRole("button", { name: "Escalator" }));
    await waitFor(() => expect(saver.update).toHaveBeenCalledWith("room", "L1-esc", 0, { kind: "area", walkable: true }));
    const [first, second] = saver.create.mock.calls as unknown as Array<[string, Record<string, unknown>, unknown]>;
    expect(first![0]).toBe("portal");
    expect(first![1]).toMatchObject({ kind: "escalator" });
    expect(second![0]).toBe("portalEndpoint");
    expect(second![1]).toMatchObject({ roomId: "L1-esc", footprint: sq(4, 2, 6, 12) });
  });

  it("takes the new escalator back out when its stop is refused", async () => {
    const saver = setup("L1-esc", "entrances", [true, false]);
    fireEvent.click(screen.getByRole("button", { name: "Escalator" }));
    await waitFor(() => expect(saver.remove).toHaveBeenCalledWith("portal", expect.stringMatching(/^portal-/), 0));
    expect(saver.update).not.toHaveBeenCalled();
  });
});
