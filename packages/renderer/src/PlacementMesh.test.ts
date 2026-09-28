// @vitest-environment jsdom
/**
 * The one renderer suite on jsdom: an error boundary runs only in a client
 * renderer, and react-dom, a peer of @react-three/fiber, is the one to hand.
 * WebGL still cannot run here, and the boundary does not care what it wraps,
 * so it is tested round plain children.
 */
import { ObjectKindSchema } from "@oth/model";
import { useGLTF } from "@react-three/drei";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlacementBoundary, forgetPlacementModels } from "./PlacementMesh";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const url = (assetId: string) => `/api/assets/${assetId}/file`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("forgetPlacementModels", () => {
  it("forgets each placed model's load, once per file", () => {
    const clear = vi.spyOn(useGLTF, "clear").mockImplementation(() => {});
    forgetPlacementModels([{ assetId: "a_1" }, { assetId: "a_2" }, { assetId: "a_1" }], url);
    expect(clear.mock.calls).toEqual([[url("a_1")], [url("a_2")]]);
  });

  it("forgets a kind's model for the objects that show it", () => {
    const clear = vi.spyOn(useGLTF, "clear").mockImplementation(() => {});
    const bin = ObjectKindSchema.parse({ id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 }, assetId: "a_bin" });
    forgetPlacementModels([{ objectKindId: "ok_bin" }, { assetId: "a_1" }, { objectKindId: "ok_none" }], url, [bin]);
    expect(clear.mock.calls).toEqual([[url("a_bin")], [url("a_1")]]);
  });
});

describe("PlacementBoundary", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.body.appendChild(document.createElement("div"));
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function Unloadable(): never {
    throw new Error(`Could not load ${url("a_1")}: 404`);
  }

  it("draws nothing for a model that will not load, and leaves the rest of the level drawn", () => {
    const clear = vi.spyOn(useGLTF, "clear").mockImplementation(() => {});
    // React reports the caught error on the console too; nothing is wrong with the test.
    vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => root.render(createElement("div", null,
      createElement(PlacementBoundary, { url: url("a_1"), children: createElement(Unloadable) }),
      createElement(PlacementBoundary, { url: url("a_2"), children: createElement("span", null, "the next model") }),
    )));
    expect(container.textContent).toBe("the next model");
    // Forgotten as it is caught, so the next time the scene mounts it is tried again.
    expect(clear).toHaveBeenCalledWith(url("a_1"));
    expect(clear).not.toHaveBeenCalledWith(url("a_2"));
  });

  it("draws its fallback, an object's box, in place of a model that will not load", () => {
    vi.spyOn(useGLTF, "clear").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => root.render(createElement(PlacementBoundary, {
      url: url("a_1"),
      fallback: createElement("span", null, "the box"),
      children: createElement(Unloadable),
    })));
    expect(container.textContent).toBe("the box");
  });
});
