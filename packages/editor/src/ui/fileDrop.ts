import { useEffect } from "react";

/**
 * Refuses a file dragged or dropped anywhere on the window but a drop box
 * built to take one. Without this, the browser opens the file in place of
 * the editor — losing whatever you had half done with it. A drop box calls
 * `preventDefault` itself, which this leaves alone.
 *
 * Shared by `BuildWorkspace` and the setup wizard's `FloorplanStep`, the
 * two screens with a plan drop box.
 */
export function useRefuseWindowFileDrop(): void {
  useEffect(() => {
    const refuse = (event: DragEvent) => {
      if (event.defaultPrevented) return; // The drop box took it.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", refuse);
    window.addEventListener("drop", refuse);
    return () => {
      window.removeEventListener("dragover", refuse);
      window.removeEventListener("drop", refuse);
    };
  }, []);
}
