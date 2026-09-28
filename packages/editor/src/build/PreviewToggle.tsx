import { useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { recall, remember } from "../ui/remember";

/** Whether the 3D preview is showing, remembered per browser: whoever likes it on keeps it on. */
export function usePreview(): [boolean, () => void] {
  const [on, setOn] = useState(() => recall("build.preview") === "on");
  const toggle = () => {
    const next = !on;
    setOn(next);
    remember("build.preview", next ? "on" : "off");
  };
  return [on, toggle];
}

export function PreviewToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Button size="sm" aria-pressed={on} onClick={onToggle}>
      3D
    </Button>
  );
}

/**
 * The preview floats over the plan rather than taking a column from it: it is
 * for checking what you drew, not for working in.
 */
export function PreviewPanel({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="3D preview"
      className="absolute bottom-14 left-3 z-20 h-64 w-96 overflow-hidden rounded border border-stone-200 bg-white shadow-lg"
    >
      {children}
    </section>
  );
}
