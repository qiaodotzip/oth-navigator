import { PlacementSchema, RoomDraftSchema, parseModel, type ValidationReport } from "@oth/model";
import type { RoomLabel } from "@oth/renderer";
import { useGLTF } from "@react-three/drei";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { navigate, useCurrentRoute } from "../route";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { recall } from "../ui/remember";
import { useToasts } from "../ui/toast";
import { BuildWorkspace } from "./BuildWorkspace";
import { useDrafts } from "./drafts";

/**
 * The 3D scene has a stand-in, and only the scene: WebGL is not there to draw
 * it, and a test can make it fail as a placed model that will not load does.
 * The plan still takes its room colours from the real renderer.
 */
const scene = vi.hoisted(() => ({ fails: false, children: null as unknown, props: null as Record<string, unknown> | null }));
vi.mock("@oth/renderer", async importOriginal => ({
  ...(await importOriginal<typeof import("@oth/renderer")>()),
  MapScene: (props: Record<string, unknown>) => {
    scene.props = props;
    if (scene.fails) throw new Error("Could not load /api/assets/asset_1/file: 404");
    // What the page hands the scene to draw with the level: its labels.
    scene.children = props.children;
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
  scene.children = null;
  scene.props = null;
  localStorage.clear();
  useToasts.getState().clear();
  useDrafts.getState().reset();
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

  it("puts down another step's tool when a link changes the step too", () => {
    // A Publish item, a floor link, Back: none of them goes through the stepper.
    open("/floors/L1/build?step=floorplan");
    act(() => {
      useEditorStore.getState().setTool("calibrate");
      useEditorStore.getState().pushCalibrationPoint([1, 1]);
    });
    act(() => navigate("/floors/L1/build?step=rooms"));
    expect(useEditorStore.getState().tool).toBe("select");
    expect(useEditorStore.getState().calibrationDraft).toBeNull();
    expect(screen.getByRole("region", { name: "Areas & rooms guide" }).textContent).not.toMatch(/known distance/i);
  });

  it("keeps a tool that belongs to the step a link opens, so a new lift's next stop is one floor away", () => {
    const l1 = open("/floors/L1/build?step=entrances");
    act(() => useEditorStore.getState().setTool("place-portal"));
    l1.unmount();
    act(() => useEditorStore.getState().setActiveLevel("oth-L2"));
    open("/floors/L2/build?step=entrances");
    expect(useEditorStore.getState().tool).toBe("place-portal");
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

  it("lets go of the place in hand once a teammate binds it, so unbinding it later does not pick it again", () => {
    open("/floors/L1/build?step=bind");
    fireEvent.click(screen.getByRole("button", { name: /Festive Mall/ }));
    const guide = () => screen.getByRole("region", { name: "Bind places guide" }).textContent;
    expect(guide()).toMatch(/click the room where you see Festive Mall/i);
    act(() => useEditorStore.getState().setModel({
      ...model, places: [{ ...model.places[0]!, roomId: "L1-a", levelId: "oth-L1" }],
    }));
    expect(guide()).not.toMatch(/click the room where you see/i);
    // Unbound again: waiting once more, but nobody has picked it.
    act(() => useEditorStore.getState().setModel(model));
    expect(guide()).not.toMatch(/click the room where you see/i);
    expect(guide()).toMatch(/pick a place from the to-do list/i);
  });

  it("says why a click placed nothing as an error, which stays until you dismiss it", async () => {
    open("/floors/L1/build?step=entrances");
    measure();
    act(() => {
      const s = useEditorStore.getState();
      s.setTool("place-entrance");
      s.setViewport({ originX: 0, originY: 600, scale: 10 });
    });
    // 90 m east: past every area on L1.
    fireEvent.click(screen.getByTestId("plan-surface"), { clientX: 900, clientY: 550 });
    await waitFor(() => expect(useToasts.getState().toasts.at(-1)?.message).toMatch(/An entrance goes inside an area/));
    expect(useToasts.getState().toasts.at(-1)).toMatchObject({ tone: "error", durationMs: null });
  });

  it("deletes a lift with no stops from its item, with Undo", async () => {
    const { api } = open("/floors/L1/build?step=entrances");
    fireEvent.click(screen.getByRole("button", { name: "Delete this lift" }));
    await waitFor(() => expect(api.deleteEntity).toHaveBeenCalledWith("portal", "lift-orphan", 0));
  });
});

describe("BuildWorkspace — the Bind places rail", () => {
  const classes = (el: Element) => [...el.classList];

  /**
   * On a laptop the places to bind were pushed out of view: the rail gave the
   * selection a share sized by its content, and the room's fields took it.
   * jsdom does no layout, so this cannot measure that; it pins the structure
   * the layout rests on instead. The places sit in one box that scrolls, and
   * every box from it up to the rail is an item of a flex column that may
   * shrink below its content (`min-h-0`), so the rail's height reaches the
   * list rather than the list's length reaching the rail.
   */
  it("keeps the places in a box of their own that scrolls, bounded by the rail, under a search that stays", () => {
    open("/floors/L1/build?step=bind&select=room:L1-hall");
    const rail = screen.getByRole("complementary", { name: "Selection and to-do" });
    const choices = screen.getByTestId("place-choices");
    const search = screen.getByLabelText("Find a place");
    expect(within(choices).getByRole("button", { name: "Bind to Festive Mall" })).toBeTruthy();

    expect(classes(choices)).toEqual(expect.arrayContaining(["min-h-0", "flex-1", "overflow-y-auto"]));
    expect(choices.contains(search)).toBe(false);
    expect(classes(search)).toContain("shrink-0");

    expect(classes(rail)).toEqual(expect.arrayContaining(["flex", "flex-col"]));
    for (let el: HTMLElement = choices; el !== rail; el = el.parentElement!) {
      expect(classes(el)).toContain("min-h-0");
      expect(classes(el.parentElement!)).toEqual(expect.arrayContaining(["flex", "flex-col"]));
    }

    // While the picker is in it, the selection takes three parts of the rail
    // to the to-do's one, whatever its content; the to-do takes only its share.
    const selection = screen.getByRole("region", { name: "Selection" });
    expect(selection.querySelector("[data-place-picker]")).toBeTruthy();
    expect(classes(selection)).toEqual(
      expect.arrayContaining(["has-[[data-place-picker]]:max-h-none", "has-[[data-place-picker]]:flex-[3_1_0%]"]),
    );
    expect(classes(screen.getByRole("region", { name: "To do" }))).toEqual(expect.arrayContaining(["min-h-0", "flex-1"]));

    // The room's own fields cap their height and scroll, so they cannot push the places out.
    const fields = screen.getByLabelText("Name").closest(".overflow-y-auto")!;
    expect(classes(fields)).toEqual(expect.arrayContaining(["min-h-0", "max-h-[30%]"]));
    expect(fields.contains(choices)).toBe(false);
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

  it("keeps what is selected in the address after a link to this floor that names nothing", () => {
    // A Publish item or the Build tab: the selection stays, so the address says so.
    open("/floors/L1/build?step=rooms&select=room:L1-a");
    act(() => navigate("/floors/L1/build?step=pathways"));
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-a" });
    expect(param("select")).toBe("room:L1-a");
  });

  it("lets go of the selection when you leave Build, so teammates stop seeing you editing it", () => {
    const build = open("/floors/L1/build?step=rooms&select=room:L1-a");
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-a" });
    build.unmount();
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it("drops a link to something since deleted, and lets go of what was selected before it", async () => {
    const before = open("/floors/L1/build?step=rooms&select=room:L1-a");
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-a" });
    // Off to another tab and back. Build lets go of its selection as it goes;
    // one left in the store by anything else must not be written over the link either.
    before.unmount();
    act(() => useEditorStore.getState().select({ type: "room", id: "L1-a" }));
    const gone = { ...model.rooms[0]!, id: "L1-old", deletedAt: "2026-09-27T10:00:00.000Z" };
    act(() => useEditorStore.getState().setModel({ ...model, rooms: [...model.rooms, gone] }));
    open("/floors/L1/build?step=rooms&select=room:L1-old");
    await settle();
    // Neither the deleted room, nor the one from before, written back over the link.
    expect(useEditorStore.getState().selection).toBeNull();
    expect(param("select")).toBeNull();
  });

  it("picks the place a link from Places names, as its to-do item would, then takes it out of the address", async () => {
    open("/floors/L1/build?step=bind&place=pl_1");
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Bind places guide" }).textContent).toMatch(/click the room where you see Festive Mall/i));
    await waitFor(() => expect(param("place")).toBeNull());
  });

  it("lets go of a room still selected from before, so a link's place is not bound to it in one click", async () => {
    // Selected on Build, then off to Places: the store keeps the selection.
    act(() => useEditorStore.getState().select({ type: "room", id: "L1-a" }));
    open("/floors/L1/build?step=bind&place=pl_1");
    await waitFor(() => expect(param("place")).toBeNull());
    expect(useEditorStore.getState().selection).toBeNull();
    expect(param("select")).toBeNull();
    // No room's picker is open, ringing the place first.
    expect(screen.queryByRole("button", { name: "Bind to Festive Mall" })).toBeNull();
    expect(screen.getByRole("region", { name: "Bind places guide" }).textContent).toMatch(/click the room where you see Festive Mall/i);
  });

  it("lets go of the selection when a place is chosen from the to-do list, as a link does", () => {
    open("/floors/L1/build?step=bind&select=room:L1-a");
    fireEvent.click(within(screen.getByRole("region", { name: "To do" })).getByRole("button", { name: /Festive Mall/ }));
    expect(useEditorStore.getState().selection).toBeNull();
    expect(param("select")).toBeNull();
    expect(screen.getByRole("region", { name: "Bind places guide" }).textContent).toMatch(/click the room where you see Festive Mall/i);
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

  it("keeps a file let go outside the drop box from opening in place of the editor", async () => {
    const { api, unmount } = open("/floors/L1/build?step=floorplan", {
      uploadLevelImage: vi.fn(async (levelId: string, file: File) => ({ ...plan, levelId, filename: file.name })),
    });
    // Refused, so the browser does not open it...
    expect(fireEvent.dragOver(document.body)).toBe(false);
    expect(fireEvent.drop(document.body)).toBe(false);
    // ...while the box still takes one.
    const sheet = new File([new Uint8Array([1])], "L1.png", { type: "image/png" });
    fireEvent.drop(screen.getByTestId("plan-drop-zone"), { dataTransfer: { files: [sheet] } });
    await waitFor(() => expect(api.uploadLevelImage).toHaveBeenCalledWith("oth-L1", sheet));
    await waitFor(() => expect(useEditorStore.getState().levelImages.map(i => i.id)).toEqual(["img_1"]));
    // Only while Build is open.
    unmount();
    expect(fireEvent.drop(document.body)).toBe(true);
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

  it("raises the walls to full height when asked, and remembers it", () => {
    localStorage.setItem("oth.build.preview", "on");
    open("/floors/L1/build?step=rooms");
    expect(scene.props?.fullHeightWalls).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Full-height walls" }));
    expect(scene.props?.fullHeightWalls).toBe(true);
    expect(recall("build.preview.walls")).toBe("full");
  });

  it("offers Download 3D model beside 3D, with the preview off", () => {
    open("/floors/L1/build?step=rooms");
    const row = screen.getByRole("button", { name: "3D" }).parentElement!;
    expect(within(row).getByRole("button", { name: "Download 3D model" })).toBeTruthy();
  });
});

describe("BuildWorkspace — labels", () => {
  it("names the rooms on the plan: the drawing's name, and nothing for a room with none", () => {
    open("/floors/L1/build?step=rooms");
    measure();
    expect(screen.getByTestId("room-label-L1-hall").textContent).toBe("Hall");
    expect(screen.queryByTestId("room-label-L1-a")).toBeNull();
  });

  it("names a bound room by its place, with ✓ once confirmed", () => {
    open("/floors/L1/build?step=rooms");
    measure();
    act(() => useEditorStore.getState().setModel({ ...model, places: [{ ...model.places[0]!, roomId: "L1-a" }] }));
    expect(screen.getByTestId("room-label-L1-a").textContent).toBe("✓ Festive Mall");
  });

  it("hands the 3D preview the same labels, at the floor's own height", () => {
    localStorage.setItem("oth.build.preview", "on");
    // L2, 6 m up: on L1 a height of 0 would pass with no height handed over at all.
    useEditorStore.getState().setActiveLevel("oth-L2");
    open("/floors/L2/build?step=rooms");
    const given = scene.children as ReactElement<{ labels: RoomLabel[]; elevationM: number }>;
    expect(given.props.labels.map(l => l.roomId)).toEqual(["L2-a"]);
    expect(given.props.elevationM).toBe(6);
  });

  it("raises the 3D labels with the walls, so each stays on its own room", () => {
    localStorage.setItem("oth.build.preview", "on");
    open("/floors/L1/build?step=rooms");
    const given = () => scene.children as ReactElement<{ fullHeightWalls: boolean }>;
    expect(given().props.fullHeightWalls).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Full-height walls" }));
    expect(given().props.fullHeightWalls).toBe(true);
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

describe("BuildWorkspace — drafts from the drawing", () => {
  const found = RoomDraftSchema.parse({
    id: "rd_1", levelId: "oth-L1", nameEn: "Changing Room", kind: "room",
    footprint: [[50, 0], [60, 0], [60, 10], [50, 10]], labelPoint: [55, 5], areaM2: 90,
    source: { checksum: "c".repeat(64), page: 1 },
  });

  it("draws the floor's drafts on Areas & rooms, and only there", async () => {
    const { api } = open("/floors/L1/build?step=rooms", { listRoomDrafts: vi.fn().mockResolvedValue([found]) });
    measure();
    expect(await screen.findByTestId("draft-rd_1")).toBeTruthy();
    expect(api.listRoomDrafts).toHaveBeenCalledWith("oth-L1");
    // Under the room labels, so a draft's wash never hides a room's name.
    const labels = screen.getByTestId("room-labels");
    expect(screen.getByTestId("draft-layer").compareDocumentPosition(labels) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(stepper().getByRole("button", { name: /^Pathways/ }));
    expect(screen.queryByTestId("draft-rd_1")).toBeNull();
  });

  it("counts the drafts to review on the to-do list, and in the review beside the tools", async () => {
    open("/floors/L1/build?step=rooms", { listRoomDrafts: vi.fn().mockResolvedValue([found]) });
    expect(await within(screen.getByRole("region", { name: "To do" })).findByText("1 draft to review.")).toBeTruthy();
    expect(screen.getByText("1 draft to review")).toBeTruthy();
    // Not done while a draft waits, though nothing there stops Publish.
    expect(stepper().getByRole("button", { name: /^Areas & rooms/ })).toHaveAccessibleName("Areas & rooms, 2 warnings");
  });
});
