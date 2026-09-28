import { PlacementSchema, parseModel, type ValidationReport } from "@oth/model";
import { useGLTF } from "@react-three/drei";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentRoute } from "../route";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { recall } from "../ui/remember";
import { useToasts } from "../ui/toast";
import { BuildWorkspace } from "./BuildWorkspace";

/**
 * The 3D scene has a stand-in, and only the scene: WebGL is not there to draw
 * it, and a test can make it fail as a placed model that will not load does.
 * The plan still takes its room colours from the real renderer.
 */
const scene = vi.hoisted(() => ({ fails: false }));
vi.mock("@oth/renderer", async importOriginal => ({
  ...(await importOriginal<typeof import("@oth/renderer")>()),
  MapScene: () => {
    if (scene.fails) throw new Error("Could not load /api/assets/asset_1/file: 404");
    return null;
  },
}));

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3 },
    { id: "L1-hall", levelId: "oth-L1", kind: "area", footprint: [[10, 0], [40, 0], [40, 20], [10, 20]], heightM: 5, walkable: true, nameEn: "Hall" },
    { id: "L2-a", levelId: "oth-L2", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3, nameEn: "Upstairs" },
  ],
  portals: [{ id: "lift-orphan", kind: "lift" }],
  captures: [{ id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" }],
  keyframes: [{ id: "kf_1", captureId: "cap_1", imageId: "kf_1", widthPx: 640, heightPx: 480 }],
  places: [{ id: "pl_1", nameEn: "Festive Mall", category: "retail" }],
  sightings: [{ id: "s1", placeId: "pl_1", keyframeId: "kf_1" }],
});

const report: ValidationReport = {
  issues: [
    { severity: "warning", code: "room.name.missing", message: 'Room "L1-a" has no name in either language.', entityType: "room", entityId: "L1-a", levelId: "oth-L1" },
    { severity: "warning", code: "room.noAccess", message: 'Room "L1-a" has no way in.', entityType: "room", entityId: "L1-a", levelId: "oth-L1" },
    { severity: "warning", code: "place.unbound", message: 'Surveyed place "Festive Mall" is not bound to any room yet.', entityType: "place", entityId: "pl_1" },
    { severity: "error", code: "portal.endpoints.insufficient", message: 'Portal "lift-orphan" has fewer than two endpoints, so it connects nothing.', entityType: "portal", entityId: "lift-orphan" },
  ],
  errorCount: 1,
  warningCount: 3,
  ok: false,
};

type Measure = (entries: { contentRect: { width: number; height: number } }[]) => void;
let measureCanvas: Measure | null = null;

class FakeResizeObserver {
  // The canvas box is the first thing observed; anything later (a popover) is left alone.
  constructor(cb: Measure) {
    measureCanvas ??= cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  measureCanvas = null;
  scene.fails = false;
  localStorage.clear();
  useToasts.getState().clear();
  const s = useEditorStore.getState();
  s.reset();
  s.setUser({ id: "u_sc", email: "sc@oth.local", displayName: "Stef Chan" });
  s.setModel(model);
  s.setReport(report);
  s.setActiveLevel("oth-L1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function open(path: string, overrides: Parameters<typeof fakeApi>[0] = {}, { strict = false } = {}) {
  const api = fakeApi({ getModel: vi.fn().mockResolvedValue(model), validate: vi.fn().mockResolvedValue(report), ...overrides });
  const saver = createSaver(api);
  window.history.replaceState({}, "", path);
  function Harness() {
    const route = useCurrentRoute();
    return route.name === "floor" ? <BuildWorkspace api={api} saver={saver} route={route} /> : null;
  }
  const { unmount } = render(strict ? <StrictMode><Harness /></StrictMode> : <Harness />);
  return { api, unmount };
}

const measure = () => act(() => measureCanvas?.([{ contentRect: { width: 1000, height: 700 } }]));
const param = (name: string) => new URLSearchParams(window.location.search).get(name);
const stepper = () => within(screen.getByRole("navigation", { name: "Build steps" }));
/** Long enough for a key that waits a tick to have acted, or decided not to. */
const settle = () => act(async () => {
  await new Promise(resolve => setTimeout(resolve, 10));
});

describe("BuildWorkspace — steps", () => {
  it("shows the step the address names: its guide, its tools and its to-do", () => {
    open("/floors/L1/build?step=pathways");
    expect(screen.getByRole("region", { name: "Pathways guide" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /draw pathway/i })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "To do" })).getByText(/has no way in/)).toBeTruthy();
  });

  it("opens on the first unfinished step when the address names none, and writes it in", async () => {
    open("/floors/L1/build");
    await waitFor(() => expect(param("step")).toBe("floorplan"));
    expect(screen.getByRole("region", { name: "Floorplan guide" })).toBeTruthy();
    expect(screen.getByTestId("plan-drop-zone")).toBeTruthy();
  });

  it("changes step from the stepper, and puts down a tool that belongs to another step", () => {
    open("/floors/L1/build?step=rooms");
    act(() => useEditorStore.getState().setTool("draw-room"));
    fireEvent.click(stepper().getByRole("button", { name: /^Pathways/ }));
    expect(param("step")).toBe("pathways");
    expect(useEditorStore.getState().tool).toBe("select");
  });

  it("keeps its layout when the session has ended, so the page survives the sign-in dialog", () => {
    act(() => useEditorStore.getState().endSession("expired"));
    open("/floors/L1/build?step=rooms");
    expect(screen.getByRole("navigation", { name: "Build steps" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Areas & rooms guide" })).toBeTruthy();
  });

  it("never loads the map itself: the workspace already has", async () => {
    const { api } = open("/floors/L1/build?step=rooms");
    await act(async () => {});
    expect(api.getModel).not.toHaveBeenCalled();
  });

  it("checks the floor again as it opens, since Survey and Review never do", async () => {
    // What Survey tagged this visit is in the model but not yet in the report.
    useEditorStore.getState().setReport(null);
    const { api } = open("/floors/L1/build?step=pathways");
    const todo = within(screen.getByRole("region", { name: "To do" }));
    expect(todo.queryByText(/has no way in/)).toBeNull();
    await waitFor(() => expect(todo.getByText(/has no way in/)).toBeTruthy());
    expect(api.validate).toHaveBeenCalledTimes(1);
    expect(api.getModel).not.toHaveBeenCalled();
  });

  it("says so once when that check fails, and offers to try it again", async () => {
    const offline = new TypeError("Failed to fetch");
    const validate = vi.fn().mockRejectedValueOnce(offline).mockRejectedValueOnce(offline).mockResolvedValue(report);
    useEditorStore.getState().setReport(null);
    // StrictMode mounts twice, as the app does in development: two checks, one toast.
    open("/floors/L1/build?step=pathways", { validate }, { strict: true });
    await waitFor(() => expect(validate).toHaveBeenCalledTimes(2));
    await settle();
    expect(useToasts.getState().toasts).toHaveLength(1);
    const [failed] = useToasts.getState().toasts;
    expect(failed?.message).toBe("Couldn't refresh the to-do list. Check your connection, then retry.");
    await act(async () => {
      await failed?.action?.run();
    });
    expect(useEditorStore.getState().report).toEqual(report);
  });
});

describe("BuildWorkspace — the to-do list", () => {
  it("selects and zooms to the thing an item is about, and puts it in the address", () => {
    open("/floors/L1/build?step=rooms");
    measure();
    const fitted = useEditorStore.getState().viewport;
    fireEvent.click(screen.getByRole("button", { name: /L1-a" has no name/ }));
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-a" });
    expect(useEditorStore.getState().viewport).not.toEqual(fitted);
    expect(param("select")).toBe("room:L1-a");
  });

  it("asks which room a surveyed place is in when its item is chosen", () => {
    open("/floors/L1/build?step=bind");
    fireEvent.click(screen.getByRole("button", { name: /Festive Mall/ }));
    expect(screen.getByRole("region", { name: "Bind places guide" }).textContent)
      .toMatch(/click the room where you see Festive Mall/i);
  });

  it("deletes a lift with no stops from its item, with Undo", async () => {
    const { api } = open("/floors/L1/build?step=entrances");
    fireEvent.click(screen.getByRole("button", { name: "Delete this lift" }));
    await waitFor(() => expect(api.deleteEntity).toHaveBeenCalledWith("portal", "lift-orphan", 0));
  });
});

describe("BuildWorkspace — links", () => {
  it("selects what a link points at", () => {
    open("/floors/L1/build?step=rooms&select=room:L1-a");
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-a" });
  });

  it("drops a link to something not on this floor, rather than selecting something wrong", async () => {
    open("/floors/L1/build?step=rooms&select=room:L2-a");
    await waitFor(() => expect(param("select")).toBeNull());
    expect(useEditorStore.getState().selection).toBeNull();
    expect(param("step")).toBe("rooms");
  });

  it("drops a link to something since deleted, and lets go of what was selected before it", async () => {
    const before = open("/floors/L1/build?step=rooms&select=room:L1-a");
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-a" });
    // Off to another tab: Build goes, and the selection stays in the store.
    before.unmount();
    const gone = { ...model.rooms[0]!, id: "L1-old", deletedAt: "2026-09-27T10:00:00.000Z" };
    act(() => useEditorStore.getState().setModel({ ...model, rooms: [...model.rooms, gone] }));
    open("/floors/L1/build?step=rooms&select=room:L1-old");
    await settle();
    // Neither the deleted room, nor the one from before, written back over the link.
    expect(useEditorStore.getState().selection).toBeNull();
    expect(param("select")).toBeNull();
  });
});

describe("BuildWorkspace — the plan", () => {
  const plan = {
    id: "img_1", levelId: "oth-L1", filename: "L1.png", widthPx: 1000, heightPx: 500, sizeBytes: 10,
    metresPerPixel: 0.1, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0,
  };

  it("keeps a dragged plan where it was dropped while the move saves", () => {
    useEditorStore.getState().setLevelImages([plan]);
    const { api } = open("/floors/L1/build?step=floorplan", { patchLevelImage: vi.fn(() => new Promise(() => {})) });
    measure();
    act(() => {
      const s = useEditorStore.getState();
      s.setTool("align-plan");
      s.setViewport({ originX: 0, originY: 600, scale: 10 });
    });
    fireEvent.mouseDown(screen.getByTestId("plan-surface"), { clientX: 100, clientY: 100, button: 0 });
    fireEvent.mouseMove(window, { clientX: 150, clientY: 80 });
    fireEvent.mouseUp(window, { clientX: 150, clientY: 80 });
    expect(api.patchLevelImage).toHaveBeenCalledWith("img_1", 0, { offsetX: 5, offsetY: 2 });
    // 50 px right at 10 px per metre. Were the save not handed back to the
    // canvas, the plan would jump back to 0 until it landed.
    expect(Number(screen.getByTestId("underlay").getAttribute("x"))).toBe(50);
  });

  it("lets go of a selection the Layers drawer deletes, as Delete does", async () => {
    const { api } = open("/floors/L1/build?step=rooms&select=room:L1-a");
    // What the server sends back after the delete no longer has the room.
    vi.mocked(api.getModel).mockResolvedValue({ ...model, rooms: model.rooms.filter(r => r.id !== "L1-a") });
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete L1-a" }));
    await waitFor(() => expect(api.deleteEntity).toHaveBeenCalledWith("room", "L1-a", 0));
    await waitFor(() => expect(useEditorStore.getState().selection).toBeNull());
    expect(param("select")).toBeNull();
  });

  it("lets go of what the Layers drawer deleted even when the reload after it fails", async () => {
    const { api } = open("/floors/L1/build?step=rooms&select=room:L1-a");
    // The delete lands; only the reload fails, so the map still shows the room.
    vi.mocked(api.getModel).mockRejectedValue(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete L1-a" }));
    await waitFor(() => expect(useToasts.getState().toasts.some(t => /reload the map/.test(t.message))).toBe(true));
    expect(useEditorStore.getState().selection).toBeNull();
    expect(param("select")).toBeNull();
  });

  it("lets go of a selection a teammate deletes", () => {
    open("/floors/L1/build?step=rooms&select=room:L1-a");
    // Their delete arrives with the next reload.
    act(() => useEditorStore.getState().setModel({ ...model, rooms: model.rooms.filter(r => r.id !== "L1-a") }));
    expect(useEditorStore.getState().selection).toBeNull();
    expect(param("select")).toBeNull();
  });
});

describe("BuildWorkspace — the 3D preview", () => {
  const placed = PlacementSchema.parse({
    id: "pm_1", levelId: "oth-L1", assetId: "asset_1", roomId: "L1-a", position: [5, 5, 0],
  });
  const failed = "The 3D preview failed to load, so it's off. Turn it on again to retry.";

  function failsThenRecovers({ strict }: { strict: boolean }) {
    // Remembered on, so without a catch every reload would fail the same way.
    localStorage.setItem("oth.build.preview", "on");
    useEditorStore.getState().setModel({ ...model, placements: [placed] });
    scene.fails = true;
    const clear = vi.spyOn(useGLTF, "clear");
    // React reports the caught error on the console as well; the toast is what the user sees.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    open("/floors/L1/build?step=rooms", {}, { strict });

    expect(screen.getByRole("navigation", { name: "Build steps" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "3D preview" })).toBeNull();
    expect(screen.getByRole("button", { name: "3D" }).getAttribute("aria-pressed")).toBe("false");
    expect(recall("build.preview")).toBe("off");
    // The loader keeps a failed model failed for the page's life: forgotten,
    // so turning the preview on again really does try again.
    expect(clear).toHaveBeenCalledWith("/api/assets/asset_1/file");
    expect(useToasts.getState().toasts.map(t => t.message)).toEqual([failed]);

    // Tried again while it still fails: the one toast, not a second beside it.
    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    expect(useToasts.getState().toasts.map(t => t.message)).toEqual([failed]);
    quiet.mockRestore();

    scene.fails = false;
    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    expect(screen.getByRole("region", { name: "3D preview" })).toBeTruthy();
  }

  it("turns itself off when the scene fails, says so, and can be tried again", () => {
    failsThenRecovers({ strict: false });
  });

  it("says so once under StrictMode, which renders twice as the app does in development", () => {
    failsThenRecovers({ strict: true });
  });
});

describe("BuildWorkspace — keys", () => {
  it("picks a tool from its key, and goes to the step that uses it", () => {
    open("/floors/L1/build?step=floorplan");
    fireEvent.keyDown(window, { key: "p" });
    expect(useEditorStore.getState().tool).toBe("draw-pathway");
    expect(param("step")).toBe("pathways");
  });

  it("leaves keys typed into a field alone", () => {
    open("/floors/L1/build?step=rooms&select=room:L1-a");
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "p" });
    expect(useEditorStore.getState().tool).toBe("select");
  });

  it("leaves keys pressed in a popover alone", async () => {
    open("/floors/L1/build?step=pathways");
    fireEvent.click(screen.getByRole("button", { name: /Walkway types/ }));
    const popover = await screen.findByRole("dialog");
    // On the popover itself, not its name field, so it is the dialog that keeps the key.
    fireEvent.keyDown(popover, { key: "r" });
    expect(useEditorStore.getState().tool).toBe("select");
    expect(param("step")).toBe("pathways");
  });

  it("deletes the selection on Delete, and offers Undo", async () => {
    const { api } = open("/floors/L1/build?step=rooms&select=room:L1-a");
    fireEvent.keyDown(window, { key: "Delete" });
    await waitFor(() => expect(api.deleteEntity).toHaveBeenCalledWith("room", "L1-a", 0));
    await waitFor(() => expect(useToasts.getState().toasts.some(t => t.message === "Deleted L1-a" && t.action?.label === "Undo")).toBe(true));
  });

  it("never deletes the selection on a held key's repeats", async () => {
    // A held Backspace takes back a shape's corners one by one; once they are
    // gone, its repeats must not go on to the room that is selected.
    const { api } = open("/floors/L1/build?step=rooms&select=room:L1-a");
    fireEvent.keyDown(window, { key: "Backspace", repeat: true });
    fireEvent.keyDown(window, { key: "Delete", repeat: true });
    await settle();
    expect(api.deleteEntity).not.toHaveBeenCalled();
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-a" });
  });

  it("leaves Delete to a selected corner, so the corner goes and the room stays", async () => {
    const { api } = open("/floors/L1/build?step=rooms&select=room:L1-a");
    measure();
    fireEvent.click(screen.getByTestId("vertex-0"));
    fireEvent.keyDown(window, { key: "Delete" });
    await waitFor(() => expect(api.updateEntity).toHaveBeenCalled());
    // Let the deferred Delete run; it must see the corner's claim and do nothing.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(api.deleteEntity).not.toHaveBeenCalled();
  });

  it("lets Escape finish with a half-drawn shape before it puts the tool down, then lets go of the selection", async () => {
    open("/floors/L1/build?step=rooms&select=room:L1-a");
    act(() => {
      const s = useEditorStore.getState();
      s.setTool("draw-room");
      s.beginDraft();
      s.pushDraftPoint([1, 1]);
    });
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(useEditorStore.getState().draft).toBeNull());
    expect(useEditorStore.getState().tool).toBe("draw-room");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(useEditorStore.getState().tool).toBe("select"));
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(useEditorStore.getState().selection).toBeNull());
  });

  it("frames the floor on F", () => {
    open("/floors/L1/build?step=rooms");
    measure();
    act(() => useEditorStore.getState().setViewport({ originX: -9999, originY: -9999, scale: 1 }));
    fireEvent.keyDown(window, { key: "f" });
    expect(useEditorStore.getState().viewport.originX).not.toBe(-9999);
  });
});
