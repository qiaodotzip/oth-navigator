import { parseModel } from "@oth/model";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError, ConflictError, type Api, type LevelImage } from "../api/client";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { FloorplanTools, PlanDropZone, patchPlan } from "./FloorplanTools";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
});

const image: LevelImage = {
  id: "img_1", levelId: "oth-L1", filename: "L1.jpg", widthPx: 3000, heightPx: 2121,
  sizeBytes: 10, metresPerPixel: null, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0,
};

function api(overrides: Partial<Record<keyof Api, unknown>> = {}): Api {
  return fakeApi({
    uploadLevelImage: vi.fn(async (levelId: string, file: File) => ({ ...image, id: "img_2", levelId, filename: file.name })),
    patchLevelImage: vi.fn(async (_id: string, version: number, patch: Record<string, unknown>) => ({ ...image, ...patch, version: version + 1 })),
    ...overrides,
  });
}

const patches = (a: Api) => (a.patchLevelImage as unknown as Mock).mock.calls;
const lastToast = () => useToasts.getState().toasts.at(-1);
const file = (name: string) => new File([new Uint8Array([1])], name, { type: "image/jpeg" });

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
  useEditorStore.getState().setModel(model);
});

describe("PlanDropZone", () => {
  it("uploads a plan dropped on it, for this floor", async () => {
    const a = api();
    render(<PlanDropZone api={a} />);
    const plan = file("L1.jpg");
    fireEvent.drop(screen.getByTestId("plan-drop-zone"), { dataTransfer: { files: [plan] } });
    await waitFor(() => expect(a.uploadLevelImage).toHaveBeenCalledWith("oth-L1", plan));
    await waitFor(() => expect(useEditorStore.getState().levelImages.map(i => i.filename)).toEqual(["L1.jpg"]));
  });

  it("uploads a chosen file too", async () => {
    const a = api();
    render(<PlanDropZone api={a} />);
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [file("L1.png")] } });
    await waitFor(() => expect(a.uploadLevelImage).toHaveBeenCalledTimes(1));
  });

  it("gives a refused upload in the server's own words", async () => {
    const a = api({ uploadLevelImage: vi.fn(async () => { throw new ApiError(422, { error: "not a PNG or JPEG file" }); }) });
    render(<PlanDropZone api={a} />);
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [file("notes.txt")] } });
    await waitFor(() => expect(lastToast()?.message).toMatch(/not a PNG or JPEG/));
  });

  it("offers Retry when the upload never arrived, and Retry sends it again", async () => {
    const uploadLevelImage = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(image);
    render(<PlanDropZone api={api({ uploadLevelImage })} />);
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [file("L1.jpg")] } });
    await waitFor(() => expect(lastToast()?.action?.label).toBe("Retry"));
    await lastToast()!.action!.run();
    expect(uploadLevelImage).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["not a PNG or JPEG", new File(["%PDF"], "L1.pdf", { type: "application/pdf" })],
    ["over 20 MB", Object.defineProperty(file("L1.jpg"), "size", { value: 20 * 1024 * 1024 + 1 })],
  ])("refuses a file that is %s before sending it, and says what to do instead", async (_why, refused) => {
    const a = api();
    render(<PlanDropZone api={a} />);
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [refused] } });
    await waitFor(() => expect(lastToast()?.message).toMatch(/Export the sheet as a PNG or JPEG under 20 MB\./));
    expect(lastToast()?.tone).toBe("error");
    expect(a.uploadLevelImage).not.toHaveBeenCalled();
  });

  it("says it is adding the plan, and takes no other until it has", async () => {
    let finish!: (image: LevelImage) => void;
    const uploadLevelImage = vi.fn(() => new Promise<LevelImage>(resolve => { finish = resolve; }));
    render(<PlanDropZone api={api({ uploadLevelImage })} />);
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [file("L1.jpg")] } });
    expect(await screen.findByText("Adding L1.jpg…")).toBeTruthy();
    expect(screen.getByLabelText("Choose a file")).toBeDisabled();
    fireEvent.drop(screen.getByTestId("plan-drop-zone"), { dataTransfer: { files: [file("L2.jpg")] } });
    expect(uploadLevelImage).toHaveBeenCalledTimes(1);
    finish(image);
    await waitFor(() => expect(screen.queryByText(/Adding/)).toBeNull());
    expect(screen.getByLabelText("Choose a file")).not.toBeDisabled();
  });

  it("is busy only on the floor whose plan is going up, so another floor's plan can go up beside it", async () => {
    const finish: ((image: LevelImage) => void)[] = [];
    const uploadLevelImage = vi.fn(() => new Promise<LevelImage>(resolve => { finish.push(resolve); }));
    render(<PlanDropZone api={api({ uploadLevelImage })} />);
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [file("L1.jpg")] } });
    expect(await screen.findByText("Adding L1.jpg…")).toBeTruthy();

    act(() => useEditorStore.getState().setActiveLevel("oth-L2"));
    expect(screen.getByText("Drop this floor's plan here")).toBeTruthy();
    expect(screen.getByLabelText("Choose a file")).not.toBeDisabled();
    const l2 = file("L2.jpg");
    fireEvent.drop(screen.getByTestId("plan-drop-zone"), { dataTransfer: { files: [l2] } });
    expect(uploadLevelImage).toHaveBeenLastCalledWith("oth-L2", l2);
    expect(await screen.findByText("Adding L2.jpg…")).toBeTruthy();

    finish[0]!({ ...image, filename: "L1.jpg" });
    finish[1]!({ ...image, id: "img_2", levelId: "oth-L2", filename: "L2.jpg" });
    await waitFor(() => expect(useEditorStore.getState().levelImages.map(i => i.filename).sort()).toEqual(["L1.jpg", "L2.jpg"]));
  });

  it("says nothing of its own when the session has ended: the sign-in dialog is the message", async () => {
    const a = api({ uploadLevelImage: vi.fn(async () => { throw new ApiError(401, { error: "sign in" }); }) });
    render(<PlanDropZone api={a} />);
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [file("L1.jpg")] } });
    await waitFor(() => expect(a.uploadLevelImage).toHaveBeenCalledTimes(1));
    expect(useToasts.getState().toasts).toEqual([]);
  });
});

describe("patchPlan", () => {
  /**
   * A server that, like the real one, refuses a save made against a version
   * it has since moved past. Every save waits for `answer`, so two can be on
   * their way at once, as they are over Railway's round trip.
   */
  function slowServer() {
    let serverVersion = 0;
    let answer!: () => void;
    const answered = new Promise<void>(resolve => { answer = resolve; });
    const patchLevelImage = vi.fn(async (_id: string, version: number, patch: Record<string, unknown>) => {
      await answered;
      if (version !== serverVersion) throw new ConflictError(null, { error: "stale" });
      serverVersion += 1;
      return { ...useEditorStore.getState().levelImages[0]!, ...patch, version: serverVersion };
    });
    return { patchLevelImage, answer };
  }

  beforeEach(() => useEditorStore.getState().setLevelImages([image]));

  it("saves one change to a plan at a time, each with the version the last one brought, so your own nudges never conflict", async () => {
    const { patchLevelImage, answer } = slowServer();
    const a = api({ patchLevelImage });
    // An Align drop, then a scale, before the drop has answered.
    const moved = patchPlan(a, image, { offsetX: 5, offsetY: 2 }, { doing: "move the plan" });
    const scaled = patchPlan(a, image, { metresPerPixel: 0.21 }, { doing: "set the scale" });
    expect(patchLevelImage).toHaveBeenCalledTimes(1);
    answer();
    expect(await moved).toBe(true);
    expect(await scaled).toBe(true);
    expect(patchLevelImage.mock.calls.map(c => c[1])).toEqual([0, 1]);
    expect(useEditorStore.getState().levelImages[0]).toMatchObject({ offsetX: 5, offsetY: 2, metresPerPixel: 0.21, version: 2 });
    expect(useToasts.getState().toasts).toEqual([]);
  });

  it("keeps opacity in the same line as the other changes", async () => {
    const { patchLevelImage, answer } = slowServer();
    const a = api({ patchLevelImage });
    render(<FloorplanTools api={a} />);
    const moved = patchPlan(a, image, { offsetX: 5, offsetY: 2 }, { doing: "move the plan" });
    const slider = screen.getByLabelText("Plan opacity");
    fireEvent.change(slider, { target: { value: "0.8" } });
    fireEvent.mouseUp(slider);
    answer();
    await moved;
    await waitFor(() => expect(useEditorStore.getState().levelImages[0]!.opacity).toBe(0.8));
    expect(patchLevelImage.mock.calls.map(c => [c[1], c[2]])).toEqual([[0, { offsetX: 5, offsetY: 2 }], [1, { opacity: 0.8 }]]);
    expect(useToasts.getState().toasts).toEqual([]);
  });

  it("sends the next change even when the one before it failed", async () => {
    const patchLevelImage = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementationOnce(async (_id: string, version: number, patch: Record<string, unknown>) => ({ ...image, ...patch, version: version + 1 }));
    const a = api({ patchLevelImage });
    const moved = patchPlan(a, image, { offsetX: 5, offsetY: 2 }, { doing: "move the plan" });
    const scaled = patchPlan(a, image, { metresPerPixel: 0.21 }, { doing: "set the scale" });
    expect(await moved).toBe(false);
    expect(await scaled).toBe(true);
    expect(patchLevelImage).toHaveBeenCalledTimes(2);
    expect(lastToast()?.message).toBe("Couldn't move the plan. Check your connection, then retry.");
  });
});

describe("FloorplanTools", () => {
  beforeEach(() => useEditorStore.getState().setLevelImages([image]));

  it("points at the drop zone when the floor has no plan yet", () => {
    useEditorStore.getState().setLevelImages([]);
    render(<FloorplanTools api={api()} />);
    expect(screen.getByText(/drop it in the box/i)).toBeTruthy();
  });

  it("says the plan is not scaled yet", () => {
    render(<FloorplanTools api={api()} />);
    expect(screen.getByText(/not scaled yet/i)).toBeTruthy();
  });

  it("shows the scale once it is set", () => {
    useEditorStore.getState().setLevelImages([{ ...image, metresPerPixel: 0.21 }]);
    render(<FloorplanTools api={api()} />);
    expect(screen.getByText(/0\.2100 m per pixel/)).toBeTruthy();
  });

  describe("Sheet scale", () => {
    it("works out OTH's sheet from A3 at 1:1500 — 0.21 m per pixel — and saves it", async () => {
      const a = api();
      render(<FloorplanTools api={a} />);
      fireEvent.click(screen.getByRole("button", { name: "Sheet scale" }));
      expect(await screen.findByText("0.2100 m per pixel")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      await waitFor(() => expect(patches(a)).toHaveLength(1));
      expect(patches(a)[0]![2].metresPerPixel).toBeCloseTo(0.21, 10);
      await waitFor(() => expect(useEditorStore.getState().levelImages[0]!.metresPerPixel).toBeCloseTo(0.21, 10));
    });

    it("follows the paper size", async () => {
      render(<FloorplanTools api={api()} />);
      fireEvent.click(screen.getByRole("button", { name: "Sheet scale" }));
      fireEvent.change(await screen.findByLabelText("Paper size"), { target: { value: "A1" } });
      expect(screen.getByText("0.4205 m per pixel")).toBeTruthy();
    });

    it("warns when the image is not the shape of the sheet", async () => {
      useEditorStore.getState().setLevelImages([{ ...image, heightPx: 1500 }]);
      render(<FloorplanTools api={api()} />);
      fireEvent.click(screen.getByRole("button", { name: "Sheet scale" }));
      expect(await screen.findByText(/not the shape of an A3 sheet/)).toBeTruthy();
    });

    it("says the warning in words, not by colour alone", async () => {
      useEditorStore.getState().setLevelImages([{ ...image, heightPx: 1500 }]);
      render(<FloorplanTools api={api()} />);
      fireEvent.click(screen.getByRole("button", { name: "Sheet scale" }));
      expect((await screen.findByText(/not the shape of an A3 sheet/)).textContent).toMatch(/^! Warning: /);
    });

    it("will not apply a scale that is not one", async () => {
      render(<FloorplanTools api={api()} />);
      fireEvent.click(screen.getByRole("button", { name: "Sheet scale" }));
      fireEvent.change(await screen.findByLabelText("Scale ratio"), { target: { value: "1:0" } });
      expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    });

    describe("on a plan that already has a scale", () => {
      // L1's plan can arrive already scaled, at 0.07 m per pixel from its own
      // drawing. That raster is not an A3 sheet, so A3 at 1:1500 would be wrong
      // for it: a scale already set is shown, and replaced only by name.
      beforeEach(() => useEditorStore.getState().setLevelImages([{ ...image, metresPerPixel: 0.07 }]));

      it("shows the scale it has, and warns that applying replaces it", async () => {
        render(<FloorplanTools api={api()} />);
        fireEvent.click(screen.getByRole("button", { name: "Sheet scale" }));
        const warning = await screen.findByText(/already scaled at 0\.0700 m per pixel/);
        expect(warning.textContent).toMatch(/^! Warning: /);
      });

      it("replaces it only from a button that says so, and says what it was", async () => {
        const a = api();
        render(<FloorplanTools api={a} />);
        fireEvent.click(screen.getByRole("button", { name: "Sheet scale" }));
        await screen.findByText("0.2100 m per pixel");
        expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Replace scale" }));
        await waitFor(() => expect(patches(a)).toHaveLength(1));
        expect(patches(a)[0]![2].metresPerPixel).toBeCloseTo(0.21, 10);
        await waitFor(() => expect(lastToast()?.message).toMatch(/it was 0\.0700/));
      });

      it("has nothing to apply when the sheet gives the scale the plan already has", async () => {
        useEditorStore.getState().setLevelImages([{ ...image, metresPerPixel: 0.21 }]);
        render(<FloorplanTools api={api()} />);
        fireEvent.click(screen.getByRole("button", { name: "Sheet scale" }));
        expect(await screen.findByText(/already has this scale/i)).toBeTruthy();
        expect(screen.getByRole("button", { name: "Replace scale" })).toBeDisabled();
      });
    });
  });

  describe("Measure scale", () => {
    beforeEach(() => useEditorStore.getState().setTool("calibrate"));

    it("sets the scale from two points and a real distance, then puts the tool down", async () => {
      useEditorStore.getState().pushCalibrationPoint([0, 0]);
      useEditorStore.getState().pushCalibrationPoint([100, 0]);
      const a = api();
      render(<FloorplanTools api={a} />);
      fireEvent.change(screen.getByLabelText("Real distance (metres)"), { target: { value: "20" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply scale" }));
      // Unscaled, the plan is drawn at a metre per pixel: 100 m on screen is 100 px.
      await waitFor(() => expect(patches(a)[0]![2]).toMatchObject({ metresPerPixel: 0.2 }));
      await waitFor(() => expect(useEditorStore.getState().tool).toBe("select"));
      expect(lastToast()?.message).toBe("Scale set to 0.2000 m per pixel.");
    });

    it("keeps the measurement when the scale does not save, to try again from", async () => {
      useEditorStore.getState().pushCalibrationPoint([0, 0]);
      useEditorStore.getState().pushCalibrationPoint([100, 0]);
      const a = api({ patchLevelImage: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
      render(<FloorplanTools api={a} />);
      fireEvent.change(screen.getByLabelText("Real distance (metres)"), { target: { value: "20" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply scale" }));
      await waitFor(() => expect(lastToast()?.action?.label).toBe("Retry"));
      expect(useEditorStore.getState().tool).toBe("calibrate");
      expect(useEditorStore.getState().calibrationDraft).toHaveLength(2);
      expect(screen.getByRole("button", { name: "Apply scale" })).not.toBeDisabled();
    });

    it("measures in the plan's own pixels, whatever scale it is drawn at", async () => {
      useEditorStore.getState().setLevelImages([{ ...image, metresPerPixel: 0.1 }]);
      useEditorStore.getState().pushCalibrationPoint([0, 0]);
      useEditorStore.getState().pushCalibrationPoint([10, 0]);
      const a = api();
      render(<FloorplanTools api={a} />);
      fireEvent.change(screen.getByLabelText("Real distance (metres)"), { target: { value: "20" } });
      fireEvent.click(screen.getByRole("button", { name: "Replace scale" }));
      // 10 m on screen is 100 px of a plan drawn at 0.1 m per pixel.
      await waitFor(() => expect(patches(a)[0]![2].metresPerPixel).toBeCloseTo(0.2, 10));
    });

    it("warns that it replaces a scale the plan already has, and says what it was", async () => {
      useEditorStore.getState().setLevelImages([{ ...image, metresPerPixel: 0.07 }]);
      useEditorStore.getState().pushCalibrationPoint([0, 0]);
      useEditorStore.getState().pushCalibrationPoint([7, 0]);
      render(<FloorplanTools api={api()} />);
      expect(screen.getByText(/already scaled at 0\.0700 m per pixel/).textContent).toMatch(/^! Warning: /);
      expect(screen.queryByRole("button", { name: "Apply scale" })).toBeNull();
      fireEvent.change(screen.getByLabelText("Real distance (metres)"), { target: { value: "21" } });
      fireEvent.click(screen.getByRole("button", { name: "Replace scale" }));
      // 7 m on screen is 100 px of a plan drawn at 0.07 m per pixel.
      await waitFor(() => expect(lastToast()?.message).toBe("Scale set to 0.2100 m per pixel (it was 0.0700)."));
    });

    it("refuses a measurement with no length rather than dividing by zero", async () => {
      useEditorStore.getState().pushCalibrationPoint([5, 5]);
      useEditorStore.getState().pushCalibrationPoint([5, 5]);
      const a = api();
      render(<FloorplanTools api={a} />);
      fireEvent.change(screen.getByLabelText("Real distance (metres)"), { target: { value: "20" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply scale" }));
      await waitFor(() => expect(lastToast()?.message).toMatch(/length/i));
      expect(patches(a)).toHaveLength(0);
    });
  });

  it("saves the opacity when the slider is let go", async () => {
    const a = api();
    render(<FloorplanTools api={a} />);
    const slider = screen.getByLabelText("Plan opacity");
    fireEvent.change(slider, { target: { value: "0.8" } });
    fireEvent.mouseUp(slider);
    await waitFor(() => expect(patches(a)[0]![2]).toEqual({ opacity: 0.8 }));
  });

  it("saves the opacity when a touch lets go of the slider too", async () => {
    const a = api();
    render(<FloorplanTools api={a} />);
    const slider = screen.getByLabelText("Plan opacity");
    fireEvent.change(slider, { target: { value: "0.8" } });
    fireEvent.pointerUp(slider);
    await waitFor(() => expect(patches(a)[0]![2]).toEqual({ opacity: 0.8 }));
  });

  it("saves one opacity at a time, so two quick releases meet no conflict and the last one wins", async () => {
    // A server that, like the real one, refuses a save made against a version
    // it has since moved past.
    let serverVersion = 0;
    let answer!: () => void;
    const answered = new Promise<void>(resolve => { answer = resolve; });
    const patchLevelImage = vi.fn(async (_id: string, version: number, patch: Record<string, unknown>) => {
      await answered;
      if (version !== serverVersion) throw new ConflictError(null, { error: "stale" });
      serverVersion += 1;
      return { ...image, ...patch, version: serverVersion };
    });
    render(<FloorplanTools api={api({ patchLevelImage })} />);
    const slider = screen.getByLabelText("Plan opacity");
    fireEvent.change(slider, { target: { value: "0.8" } });
    fireEvent.pointerUp(slider);
    fireEvent.mouseUp(slider);
    fireEvent.change(slider, { target: { value: "0.5" } });
    fireEvent.mouseUp(slider);
    fireEvent.change(slider, { target: { value: "0.3" } });
    fireEvent.mouseUp(slider);
    expect(patchLevelImage).toHaveBeenCalledTimes(1);
    answer();
    await waitFor(() => expect(useEditorStore.getState().levelImages[0]!.opacity).toBe(0.3));
    expect(patchLevelImage.mock.calls.map(c => [c[1], c[2]])).toEqual([[0, { opacity: 0.8 }], [1, { opacity: 0.3 }]]);
    expect(useToasts.getState().toasts).toEqual([]);
  });

  it("says it is adding a replacement plan, and offers no other until it has", async () => {
    let finish!: (image: LevelImage) => void;
    const uploadLevelImage = vi.fn(() => new Promise<LevelImage>(resolve => { finish = resolve; }));
    render(<FloorplanTools api={api({ uploadLevelImage })} />);
    fireEvent.change(screen.getByLabelText("Replace plan…"), { target: { files: [file("L1 v2.jpg")] } });
    expect(await screen.findByText("Adding L1 v2.jpg…")).toBeTruthy();
    expect(screen.getByLabelText("Replace plan…")).toBeDisabled();
    finish({ ...image, id: "img_2", filename: "L1 v2.jpg" });
    await waitFor(() => expect(screen.getByLabelText("Replace plan…")).not.toBeDisabled());
    expect(useEditorStore.getState().levelImages.map(i => i.filename)).toEqual(["L1 v2.jpg"]);
  });

  describe("replacing a plan that has a scale", () => {
    // The server retires the old plan, and its scale and position with it,
    // and there is nothing to Undo it with: so it asks first.
    beforeEach(() => useEditorStore.getState().setLevelImages([{ ...image, metresPerPixel: 0.07 }]));

    it("warns what goes with it, and replaces it only once you say so", async () => {
      const a = api();
      render(<FloorplanTools api={a} />);
      fireEvent.change(screen.getByLabelText("Replace plan…"), { target: { files: [file("L1 v2.jpg")] } });
      const warning = screen.getByText(/Replacing it with L1 v2\.jpg/);
      expect(warning.textContent).toBe(
        "! Warning: This plan is scaled at 0.0700 m per pixel. Replacing it with L1 v2.jpg loses its scale and position, and you can't undo that.",
      );
      expect(a.uploadLevelImage).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Replace plan" }));
      await waitFor(() => expect(a.uploadLevelImage).toHaveBeenCalledWith("oth-L1", expect.objectContaining({ name: "L1 v2.jpg" })));
      expect(screen.queryByText(/Replacing it with/)).toBeNull();
      await waitFor(() => expect(useEditorStore.getState().levelImages.map(i => i.filename)).toEqual(["L1 v2.jpg"]));
    });

    it("keeps the plan when you say so", () => {
      const a = api();
      render(<FloorplanTools api={a} />);
      fireEvent.change(screen.getByLabelText("Replace plan…"), { target: { files: [file("L1 v2.jpg")] } });
      fireEvent.click(screen.getByRole("button", { name: "Keep this plan" }));
      expect(screen.queryByText(/Replacing it with/)).toBeNull();
      expect(a.uploadLevelImage).not.toHaveBeenCalled();
    });
  });

  it("names each control by the words it shows, so a voice command can find it (WCAG 2.5.3)", () => {
    useEditorStore.getState().setTool("calibrate");
    render(<FloorplanTools api={api()} />);
    expect(screen.getByRole("textbox", { name: "Real distance (metres)" })).toBeTruthy();
    // A file input has no role to look it up by. What would break its name is
    // an aria-label saying something other than the visible label.
    expect(screen.getByLabelText("Replace plan…").hasAttribute("aria-label")).toBe(false);
    render(<PlanDropZone api={api()} />);
    expect(screen.getByLabelText("Choose a file").hasAttribute("aria-label")).toBe(false);
  });

  it("leaves how to align to the guide, so only one instruction shows", () => {
    useEditorStore.getState().setActiveLevel("oth-L2");
    useEditorStore.getState().setLevelImages([{ ...image, levelId: "oth-L2" }]);
    useEditorStore.getState().setTool("align-plan");
    const { container } = render(<FloorplanTools api={api()} />);
    expect(container.textContent).not.toMatch(/dashed outlines|lowest floor|drag/i);
  });
});
