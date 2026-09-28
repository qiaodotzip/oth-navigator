import { parseModel } from "@oth/model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError, type Api, type LevelImage } from "../api/client";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { FloorplanTools, PlanDropZone } from "./FloorplanTools";

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
    fireEvent.change(screen.getByLabelText("Choose a floorplan file"), { target: { files: [file("L1.png")] } });
    await waitFor(() => expect(a.uploadLevelImage).toHaveBeenCalledTimes(1));
  });

  it("gives a refused upload in the server's own words", async () => {
    const a = api({ uploadLevelImage: vi.fn(async () => { throw new ApiError(422, { error: "not a PNG or JPEG file" }); }) });
    render(<PlanDropZone api={a} />);
    fireEvent.change(screen.getByLabelText("Choose a floorplan file"), { target: { files: [file("notes.txt")] } });
    await waitFor(() => expect(lastToast()?.message).toMatch(/not a PNG or JPEG/));
  });

  it("offers Retry when the upload never arrived, and Retry sends it again", async () => {
    const uploadLevelImage = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(image);
    render(<PlanDropZone api={api({ uploadLevelImage })} />);
    fireEvent.change(screen.getByLabelText("Choose a floorplan file"), { target: { files: [file("L1.jpg")] } });
    await waitFor(() => expect(lastToast()?.action?.label).toBe("Retry"));
    await lastToast()!.action!.run();
    expect(uploadLevelImage).toHaveBeenCalledTimes(2);
  });

  it("says nothing of its own when the session has ended: the sign-in dialog is the message", async () => {
    const a = api({ uploadLevelImage: vi.fn(async () => { throw new ApiError(401, { error: "sign in" }); }) });
    render(<PlanDropZone api={a} />);
    fireEvent.change(screen.getByLabelText("Choose a floorplan file"), { target: { files: [file("L1.jpg")] } });
    await waitFor(() => expect(a.uploadLevelImage).toHaveBeenCalledTimes(1));
    expect(useToasts.getState().toasts).toEqual([]);
  });
});

describe("FloorplanTools", () => {
  beforeEach(() => useEditorStore.getState().setLevelImages([image]));

  it("points at the drop zone when the floor has no plan yet", () => {
    useEditorStore.getState().setLevelImages([]);
    render(<FloorplanTools api={api()} />);
    expect(screen.getByText(/drop it on the canvas/i)).toBeTruthy();
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
      fireEvent.change(screen.getByLabelText("Real distance in metres"), { target: { value: "20" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply scale" }));
      // Unscaled, the plan is drawn at a metre per pixel: 100 m on screen is 100 px.
      await waitFor(() => expect(patches(a)[0]![2]).toMatchObject({ metresPerPixel: 0.2 }));
      expect(useEditorStore.getState().tool).toBe("select");
    });

    it("measures in the plan's own pixels, whatever scale it is drawn at", async () => {
      useEditorStore.getState().setLevelImages([{ ...image, metresPerPixel: 0.1 }]);
      useEditorStore.getState().pushCalibrationPoint([0, 0]);
      useEditorStore.getState().pushCalibrationPoint([10, 0]);
      const a = api();
      render(<FloorplanTools api={a} />);
      fireEvent.change(screen.getByLabelText("Real distance in metres"), { target: { value: "20" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply scale" }));
      // 10 m on screen is 100 px of a plan drawn at 0.1 m per pixel.
      await waitFor(() => expect(patches(a)[0]![2].metresPerPixel).toBeCloseTo(0.2, 10));
    });

    it("refuses a measurement with no length rather than dividing by zero", async () => {
      useEditorStore.getState().pushCalibrationPoint([5, 5]);
      useEditorStore.getState().pushCalibrationPoint([5, 5]);
      const a = api();
      render(<FloorplanTools api={a} />);
      fireEvent.change(screen.getByLabelText("Real distance in metres"), { target: { value: "20" } });
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

  it("explains aligning on the lowest floor, where there is nothing below", () => {
    useEditorStore.getState().setTool("align-plan");
    render(<FloorplanTools api={api()} />);
    expect(screen.getByText(/lowest floor/i)).toBeTruthy();
  });

  it("names the floor below while aligning", () => {
    useEditorStore.getState().setActiveLevel("oth-L2");
    useEditorStore.getState().setLevelImages([{ ...image, levelId: "oth-L2" }]);
    useEditorStore.getState().setTool("align-plan");
    render(<FloorplanTools api={api()} />);
    expect(screen.getByText(/dashed outlines are L1/)).toBeTruthy();
  });
});
