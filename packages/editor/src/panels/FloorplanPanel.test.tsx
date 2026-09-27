import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { useEditorStore } from "../state/store";
import { FloorplanPanel } from "./FloorplanPanel";

const image = {
  id: "img_1",
  levelId: "oth-L1",
  filename: "L1.png",
  widthPx: 1000,
  heightPx: 500,
  sizeBytes: 10,
  metresPerPixel: null as number | null,
  offsetX: 0,
  offsetY: 0,
  opacity: 0.6,
  version: 0,
};

type Calls = { mock: { calls: unknown[][] } };

function deps(overrides: Record<string, unknown> = {}) {
  return {
    api: {
      uploadLevelImage: vi.fn(async () => image),
      patchLevelImage: vi.fn(async () => ({ ...image, metresPerPixel: 0.1, version: 1 })),
      ...overrides,
    } as never,
    saver: { refresh: vi.fn(async () => {}) } as never,
  };
}

const uploadCalls = (d: ReturnType<typeof deps>) =>
  (d.api as unknown as { uploadLevelImage: Calls }).uploadLevelImage.mock.calls;
const patchCalls = (d: ReturnType<typeof deps>) =>
  (d.api as unknown as { patchLevelImage: Calls }).patchLevelImage.mock.calls;

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setActiveLevel("oth-L1");
});

describe("FloorplanPanel", () => {
  it("prompts for a floorplan when the level has none", () => {
    render(<FloorplanPanel {...deps()} />);
    expect(screen.getByLabelText(/add a floorplan/i)).toBeTruthy();
  });

  it("uploads for the active level", async () => {
    const d = deps();
    render(<FloorplanPanel {...d} />);
    fireEvent.change(screen.getByLabelText(/add a floorplan/i), {
      target: { files: [new File([new Uint8Array([1])], "L1.png")] },
    });
    await waitFor(() => expect(uploadCalls(d)[0]![0]).toBe("oth-L1"));
  });

  it("reports a rejected upload in the server's own words", async () => {
    const d = deps({
      uploadLevelImage: vi.fn(async () => {
        throw new Error("not a PNG or JPEG file");
      }),
    });
    render(<FloorplanPanel {...d} />);
    fireEvent.change(screen.getByLabelText(/add a floorplan/i), {
      target: { files: [new File([new Uint8Array([1])], "notes.txt")] },
    });
    await waitFor(() => expect(useEditorStore.getState().status).toMatch(/not a PNG or JPEG/));
  });

  it("asks for the scale once an image exists", () => {
    useEditorStore.getState().setLevelImages([image]);
    render(<FloorplanPanel {...deps()} />);
    expect(screen.getByRole("button", { name: /set the scale/i })).toBeTruthy();
  });

  it("starts a measurement when the scale button is pressed", () => {
    useEditorStore.getState().setLevelImages([image]);
    render(<FloorplanPanel {...deps()} />);
    fireEvent.click(screen.getByRole("button", { name: /set the scale/i }));
    expect(useEditorStore.getState().tool).toBe("calibrate");
    expect(useEditorStore.getState().calibrationDraft).toEqual([]);
  });

  it("saves the scale once two points and a distance are given", async () => {
    const d = deps();
    useEditorStore.getState().setLevelImages([image]);
    useEditorStore.getState().beginCalibration();
    useEditorStore.getState().pushCalibrationPoint([0, 0]);
    useEditorStore.getState().pushCalibrationPoint([100, 0]);
    render(<FloorplanPanel {...d} />);
    fireEvent.change(screen.getByLabelText(/real distance/i), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /apply scale/i }));
    await waitFor(() => expect(patchCalls(d)).toHaveLength(1));
    expect(patchCalls(d)[0]![2]).toMatchObject({ metresPerPixel: 0.2 });
  });

  it("refuses a measurement with no length rather than dividing by zero", async () => {
    const d = deps();
    useEditorStore.getState().setLevelImages([image]);
    useEditorStore.getState().beginCalibration();
    useEditorStore.getState().pushCalibrationPoint([5, 5]);
    useEditorStore.getState().pushCalibrationPoint([5, 5]);
    render(<FloorplanPanel {...d} />);
    fireEvent.change(screen.getByLabelText(/real distance/i), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /apply scale/i }));
    await waitFor(() => expect(useEditorStore.getState().status).toMatch(/length/i));
    expect(patchCalls(d)).toHaveLength(0);
  });

  it("shows the current scale once calibrated", () => {
    useEditorStore.getState().setLevelImages([{ ...image, metresPerPixel: 0.071 }]);
    render(<FloorplanPanel {...deps()} />);
    expect(screen.getByText(/0\.071/)).toBeTruthy();
  });

  it("leaves an expired session to the sign-in dialog instead of showing a raw 401", async () => {
    const d = deps({ uploadLevelImage: vi.fn(async () => { throw new ApiError(401, null); }) });
    render(<FloorplanPanel {...d} />);
    fireEvent.change(screen.getByLabelText(/add a floorplan/i), {
      target: { files: [new File([new Uint8Array([1])], "L1.png")] },
    });
    await waitFor(() => expect(uploadCalls(d)).toHaveLength(1));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(useEditorStore.getState().status).toBeNull();
  });
});

describe("positioning", () => {
  const scaled = { ...image, metresPerPixel: 0.1 };

  it("offers offsets once the image is scaled", () => {
    useEditorStore.getState().setLevelImages([scaled]);
    render(<FloorplanPanel {...deps()} />);
    expect(screen.getByLabelText(/east/i)).toBeTruthy();
    expect(screen.getByLabelText(/north/i)).toBeTruthy();
  });

  it("hides offsets until there is a scale, since metres are meaningless before then", () => {
    useEditorStore.getState().setLevelImages([image]);
    render(<FloorplanPanel {...deps()} />);
    expect(screen.queryByLabelText(/east/i)).toBeNull();
  });

  it("saves an offset change", async () => {
    const d = deps();
    useEditorStore.getState().setLevelImages([scaled]);
    render(<FloorplanPanel {...d} />);
    fireEvent.change(screen.getByLabelText(/east/i), { target: { value: "12.5" } });
    fireEvent.blur(screen.getByLabelText(/east/i));
    await waitFor(() => expect(patchCalls(d)[0]![2]).toMatchObject({ offsetX: 12.5 }));
  });

  it("ignores a non-numeric offset rather than writing NaN", async () => {
    const d = deps();
    useEditorStore.getState().setLevelImages([scaled]);
    render(<FloorplanPanel {...d} />);
    fireEvent.change(screen.getByLabelText(/east/i), { target: { value: "abc" } });
    fireEvent.blur(screen.getByLabelText(/east/i));
    expect(patchCalls(d)).toHaveLength(0);
  });
});
