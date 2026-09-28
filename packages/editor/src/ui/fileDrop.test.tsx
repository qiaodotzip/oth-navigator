import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRefuseWindowFileDrop } from "./fileDrop";

function Probe() {
  useRefuseWindowFileDrop();
  return null;
}

describe("useRefuseWindowFileDrop", () => {
  it("refuses a drag over the window nobody else took, so the browser never opens the file", () => {
    render(<Probe />);
    const dataTransfer = { dropEffect: "copy" };
    const event = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    const notCancelled = window.dispatchEvent(event);
    expect(notCancelled).toBe(false); // preventDefault was called
    expect(dataTransfer.dropEffect).toBe("none");
  });

  it("refuses a drop nobody else took the same way", () => {
    render(<Probe />);
    const dataTransfer = { dropEffect: "copy" };
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    window.dispatchEvent(event);
    expect(dataTransfer.dropEffect).toBe("none");
  });

  it("leaves a drop a drop box already took", () => {
    render(<Probe />);
    const dataTransfer = { dropEffect: "copy" };
    const event = new Event("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    event.preventDefault(); // as the drop box's own handler would, before this ever sees it
    window.dispatchEvent(event);
    expect(dataTransfer.dropEffect).toBe("copy");
  });
});
