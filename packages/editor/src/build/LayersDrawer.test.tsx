import { parseModel } from "@oth/model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { LayersDrawer } from "./LayersDrawer";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [
    { id: "L1-lobby", levelId: "oth-L1", kind: "area", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 6, walkable: true, nameEn: "Town Square", nameZh: "广场" },
    { id: "L1-b", levelId: "oth-L1", kind: "room", footprint: [[20, 0], [30, 0], [30, 10]], heightM: 3, walkable: true },
  ],
  doorways: [
    { id: "L1-door", levelId: "oth-L1", roomA: "L1-lobby", roomB: "L1-b", segment: [[10, 4], [10, 6]], widthM: 2 },
  ],
});

function setup() {
  const update = vi.fn(async () => true);
  const remove = vi.fn(async () => true);
  const refresh = vi.fn(async () => {});
  const onChoose = vi.fn();
  const onClose = vi.fn();
  render(
    <LayersDrawer api={fakeApi()} saver={{ update, remove, refresh } as unknown as Saver} onChoose={onChoose} onClose={onClose} />,
  );
  return { update, remove, onChoose, onClose };
}

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
  useEditorStore.getState().setModel(model);
});

describe("LayersDrawer", () => {
  it("lists everything on the floor by kind, with counts", () => {
    setup();
    for (const heading of ["Areas (1)", "Rooms (1)", "Pathways (0)", "Doorways (1)", "Entrances (0)"]) {
      expect(screen.getByText(heading)).toBeTruthy();
    }
  });

  it("shows a thing by its name, or its id when it has none", () => {
    setup();
    expect(screen.getByRole("button", { name: "Town Square" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "L1-b" })).toBeTruthy();
  });

  it("chooses an area as the room it really is, so the plan can select and zoom to it", () => {
    const { onChoose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Town Square" }));
    expect(onChoose).toHaveBeenCalledWith({ type: "room", id: "L1-lobby" });
  });

  it("renames in place", () => {
    const { update } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Rename Town Square" }));
    const field = screen.getByRole("textbox", { name: "Rename Town Square" });
    fireEvent.change(field, { target: { value: "Main Atrium" } });
    fireEvent.blur(field);
    expect(update).toHaveBeenCalledWith("room", "L1-lobby", 0, { nameEn: "Main Atrium" });
  });

  it("saves nothing for a rename that changed nothing", () => {
    const { update } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Rename Town Square" }));
    fireEvent.blur(screen.getByRole("textbox", { name: "Rename Town Square" }));
    expect(update).not.toHaveBeenCalled();
  });

  it("starts each rename from that thing's own name, never what was typed for another", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Rename Town Square" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Rename Town Square" }), { target: { value: "Main Atrium" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename L1-b" }));
    expect((screen.getByRole("textbox", { name: "Rename L1-b" }) as HTMLInputElement).value).toBe("L1-b");
  });

  it("offers no rename for a thing with no name of its own", () => {
    setup();
    expect(screen.queryByRole("button", { name: /Rename Town Square ↔/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Delete Town Square ↔/ })).toBeTruthy();
  });

  it("deletes at the version it has, then offers Undo rather than asking first", async () => {
    const { remove } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete Town Square" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("room", "L1-lobby", 0));
    expect(useToasts.getState().toasts.at(-1)).toMatchObject({ message: "Deleted Town Square", action: { label: "Undo" } });
  });

  it("says so when a kind is empty, rather than showing nothing", () => {
    setup();
    expect(screen.getAllByText("none yet").length).toBeGreaterThan(0);
  });

  it("closes", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Close layers" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("locks in the layers", () => {
  const me = { id: "user_me", email: "m@oth.local", displayName: "Me" };

  it("marks a row someone else is editing, by their name — an area by the room it is", () => {
    useEditorStore.getState().setUser(me);
    useEditorStore.getState().setLocks([{ entityType: "room", entityId: "L1-lobby", lockedBy: "user_wei", lockedByName: "Wei" }]);
    setup();
    expect(screen.getByTestId("layer-L1-lobby").textContent).toContain("Wei");
  });

  it("does not mark a row I am editing myself", () => {
    useEditorStore.getState().setUser(me);
    useEditorStore.getState().setLocks([{ entityType: "room", entityId: "L1-lobby", lockedBy: "user_me", lockedByName: "Me" }]);
    setup();
    expect(screen.getByTestId("layer-L1-lobby").textContent).not.toContain("🔒");
  });
});
