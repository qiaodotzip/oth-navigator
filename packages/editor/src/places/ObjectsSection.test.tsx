import { parseModel, type Level } from "@oth/model";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Api } from "../api/client";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { ObjectsSection } from "./ObjectsSection";

/** The file itself is the renderer's to test (objectExport.test.ts); here, what it is asked for. */
const built = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@oth/renderer", async importOriginal => ({
  ...(await importOriginal<typeof import("@oth/renderer")>()),
  buildObjectKindGlb: vi.fn(async (...args: unknown[]) => {
    built.calls.push(args);
    return new Uint8Array([1, 2, 3]);
  }),
}));

const sq = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]];
const frame = (id: string) => ({ id, captureId: "cap_1", imageId: id, widthPx: 640, heightPx: 480 });

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [{ id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0), heightM: 4 }],
  objectKinds: [{ id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } }],
  captures: [{ id: "cap_1", kind: "video", filename: "level 1.mp4", levelId: "oth-L1" }],
  keyframes: ["kf_1", "kf_2", "kf_3", "kf_4", "kf_5"].map(frame),
  places: [
    { id: "pl_bin", nameEn: "wastebin", category: "facility", objectKindId: "ok_bin" },
    { id: "pl_cooler", nameEn: "water cooler", category: "facility" },
    { id: "pl_fire", nameEn: "Fire cabinet", category: "facility", status: "proposed" },
    { id: "pl_bin_l2", nameEn: "Wastebin", category: "facility", levelId: "oth-L2" },
    { id: "pl_star", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-shop" },
    { id: "pl_walk", nameEn: "Covered link", category: "facility", pathwayKindId: "pk-1" },
  ],
  sightings: ["kf_1", "kf_2", "kf_3", "kf_4", "kf_5"].map((keyframeId, i) => ({ id: `s${i}`, placeId: "pl_bin", keyframeId })),
  placements: [
    { id: "L1-bin-2", levelId: "oth-L1", objectKindId: "ok_bin", position: [5, 5, 0] },
    { id: "L1-bin-1", levelId: "oth-L1", objectKindId: "ok_bin", position: [3, 3, 0], rotationDeg: 90 },
    { id: "L2-bin-1", levelId: "oth-L2", objectKindId: "ok_bin", position: [3, 3, 0] },
  ],
});
const L1 = model.levels[0] as Level;

function Harness({ api }: { api: Api }) {
  const [placeId, setPlaceId] = useState<string | null>(null);
  const current = useEditorStore(s => s.model)!;
  return <ObjectsSection api={api} saver={createSaver(api)} model={current} level={L1} placeId={placeId} onPlaceId={setPlaceId} />;
}

function setup(overrides: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi({ getModel: vi.fn().mockResolvedValue(model), ...overrides });
  render(<Harness api={api} />);
  return api as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

const row = () => within(screen.getByTestId("object-row-ok_bin"));
const turning = () => within(screen.getByRole("form", { name: "Turn a place into an object" }));

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
  useToasts.getState().clear();
  built.calls.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ObjectsSection", () => {
  it("lists each kind with its size, Box until it has a model, how many are on each floor, and its frames", () => {
    setup();
    expect(row().getByText("wastebin")).toBeTruthy();
    expect(row().getByText("0.5 × 0.5 × 1 m · Box")).toBeTruthy();
    expect(row().getByText("On the map: L1 2 · L2 1")).toBeTruthy();
    expect(row().getByRole("link", { name: "5 frames" }).getAttribute("href")).toMatch(/^\/floors\/L1\/survey\?capture=cap_1&frame=kf_/);
  });

  it("hints at Build's Dressing step for putting an object on the map by hand", () => {
    setup();
    expect(screen.getByText(/select a room in Build's Dressing step and use Objects…/)).toBeTruthy();
  });

  it("points Place one on the map at the active floor's Dressing step", () => {
    setup();
    expect(row().getByRole("link", { name: "Place one on the map" }).getAttribute("href")).toBe("/floors/L1/build?step=dressing");
  });

  it("changes a kind's size, refusing one typed in centimetres before anything is sent", async () => {
    const api = setup();
    fireEvent.click(row().getByRole("button", { name: "Change the size of wastebin" }));
    const form = within(screen.getByRole("form", { name: "Size of wastebin" }));
    fireEvent.change(form.getByLabelText("Width in metres"), { target: { value: "60" } });
    fireEvent.click(form.getByRole("button", { name: "Save size" }));
    expect(form.getByRole("alert").textContent).toBe("60 m is more than 10 m. Sizes are in metres: 60 cm is 0.6.");
    expect(api.updateEntity).not.toHaveBeenCalled();

    fireEvent.change(form.getByLabelText("Width in metres"), { target: { value: "0.6" } });
    fireEvent.click(form.getByRole("button", { name: "Save size" }));
    await waitFor(() => expect(api.updateEntity).toHaveBeenCalledWith("objectKind", "ok_bin", 0, { size: { w: 0.6, d: 0.5, h: 1 } }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Size of wastebin" })).toBeNull());
  });

  it("offers every place that could be an object: proposals and places no floor claims, but not one bound or a walkway", () => {
    setup();
    const options = [...(turning().getByLabelText("Which place?") as HTMLSelectElement).options].map(o => o.textContent);
    // By name, as people read it: "Wastebin" sorts before "water cooler".
    expect(options).toEqual(["Choose a place…", "Fire cabinet (proposed)", "Wastebin", "water cooler"]);
  });

  it("turns a place into an object, asking for its size: the kind first, then the place", async () => {
    const api = setup();
    fireEvent.change(turning().getByLabelText("Which place?"), { target: { value: "pl_cooler" } });
    fireEvent.change(turning().getByLabelText("Width in metres"), { target: { value: "0.4" } });
    fireEvent.change(turning().getByLabelText("Depth in metres"), { target: { value: "0.4" } });
    fireEvent.change(turning().getByLabelText("Height in metres"), { target: { value: "1.2" } });
    fireEvent.click(turning().getByRole("button", { name: "This is an object" }));
    await waitFor(() => expect(api.updateEntity).toHaveBeenCalled());
    const [type, kind] = api.createEntity!.mock.calls[0] as [string, Record<string, unknown>];
    expect(type).toBe("objectKind");
    expect(kind).toMatchObject({ nameEn: "water cooler", size: { w: 0.4, d: 0.4, h: 1.2 } });
    expect(api.updateEntity).toHaveBeenCalledWith("place", "pl_cooler", 0, { objectKindId: kind.id });
  });

  it("joins a kind of the same name rather than making a second, and says so instead of asking a size", async () => {
    const api = setup();
    fireEvent.change(turning().getByLabelText("Which place?"), { target: { value: "pl_bin_l2" } });
    expect(turning().getByText("Wastebin joins the kind wastebin, at its size, 0.5 × 0.5 × 1 m.")).toBeTruthy();
    expect(turning().queryByLabelText("Width in metres")).toBeNull();
    fireEvent.click(turning().getByRole("button", { name: "This is an object" }));
    await waitFor(() => expect(api.updateEntity).toHaveBeenCalledWith("place", "pl_bin_l2", 0, { objectKindId: "ok_bin" }));
    expect(api.createEntity).not.toHaveBeenCalled();
  });

  it("refuses a blank size on the form, with the reason, and sends nothing", () => {
    const api = setup();
    fireEvent.change(turning().getByLabelText("Which place?"), { target: { value: "pl_cooler" } });
    fireEvent.change(turning().getByLabelText("Height in metres"), { target: { value: "" } });
    fireEvent.click(turning().getByRole("button", { name: "This is an object" }));
    expect(turning().getByRole("alert").textContent).toBe("Give each side in metres, above 0, like 0.6.");
    expect(api.createEntity).not.toHaveBeenCalled();
  });

  it("uploads a model through the asset pipeline and gives it to the kind", async () => {
    const api = setup({ uploadAsset: vi.fn().mockResolvedValue({ id: "asset_bin" }) });
    const file = new File([new Uint8Array([1])], "wastebin.glb", { type: "model/gltf-binary" });
    fireEvent.change(row().getByLabelText("Upload a model for wastebin"), { target: { files: [file] } });
    await waitFor(() => expect(api.updateEntity).toHaveBeenCalledWith("objectKind", "ok_bin", 0, { assetId: "asset_bin" }));
    expect(api.uploadAsset).toHaveBeenCalledWith(file);
  });

  it("says the pipeline's refusal in its own words, and leaves the kind alone", async () => {
    const api = setup({
      uploadAsset: vi.fn().mockRejectedValue(new ApiError(422, { error: "asset exceeds the 150000 triangle budget" })),
    });
    const file = new File([new Uint8Array([1])], "wastebin.glb");
    fireEvent.change(row().getByLabelText("Upload a model for wastebin"), { target: { files: [file] } });
    await waitFor(() => expect(useToasts.getState().toasts.map(t => t.message))
      .toContain("Couldn't upload wastebin.glb: asset exceeds the 150000 triangle budget."));
    expect(api.updateEntity).not.toHaveBeenCalled();
  });

  it("exports the kind for modelling around this floor's first object of it, as oth-object-<kind>.glb", async () => {
    setup();
    URL.createObjectURL = vi.fn(() => "blob:object");
    URL.revokeObjectURL = vi.fn();
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    fireEvent.click(row().getByRole("button", { name: "Export wastebin for modelling" }));
    await waitFor(() => expect(downloads).toEqual(["oth-object-wastebin.glb"]));
    const [kind, at, rooms, level] = built.calls[0] as [{ id: string }, { id: string }, unknown[], Level];
    expect([kind.id, at.id, rooms.length, level.id]).toEqual(["ok_bin", "L1-bin-1", 1, "oth-L1"]);
  });
});
