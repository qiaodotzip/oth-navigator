import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBytes } from "./download";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("downloadBytes", () => {
  it("saves the bytes under the name given, then lets the blob go", () => {
    vi.useFakeTimers();
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:model";
    });
    URL.revokeObjectURL = vi.fn();
    const saved: Array<{ download: string; href: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ download: this.download, href: this.href });
    });

    downloadBytes(new Uint8Array([1, 2, 3]), "oth-L1.glb", "model/gltf-binary");

    expect(saved).toEqual([{ download: "oth-L1.glb", href: "blob:model" }]);
    expect(blobs[0]!.type).toBe("model/gltf-binary");
    expect(blobs[0]!.size).toBe(3);
    // Kept a moment, so the browser has started saving before the blob goes.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:model");
  });
});
