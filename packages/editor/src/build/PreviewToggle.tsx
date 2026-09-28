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

export type PreviewOptions = { fullHeightWalls: boolean; large: boolean };

/** Wall height and panel size, remembered per browser like the toggle itself. */
export function usePreviewOptions(): [PreviewOptions, (patch: Partial<PreviewOptions>) => void] {
  const [options, setOptions] = useState<PreviewOptions>(() => ({
    fullHeightWalls: recall("build.preview.walls") === "full",
    large: recall("build.preview.size") === "large",
  }));
  const change = (patch: Partial<PreviewOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    remember("build.preview.walls", next.fullHeightWalls ? "full" : "low");
    remember("build.preview.size", next.large ? "large" : "small");
  };
  return [options, change];
}

/**
 * Small, the panel sits under the step guide, which leaves it room
 * (StepGuide's GUIDE_MAX_HEIGHT). Large, it takes the plan from the top down
 * to the buttons, starting right of the guide (left-3 + w-80 + a gap =
 * 21.5rem) so the guide's tools stay in reach, and it is never narrower than
 * 36rem: on a narrow canvas it slides left under the guide instead. At z-10
 * the guide and the Layers drawer float over it, as they float over the plan.
 */
const PANEL_SIZE = {
  small: "bottom-14 left-3 z-20 h-64 w-96",
  large: "bottom-14 right-3 top-3 z-10 left-[max(0.75rem,min(21.5rem,calc(100%-36.75rem)))]",
} as const;

/**
 * The preview floats over the plan rather than taking a column from it: it is
 * for checking what you drew, not for working in. Larger gives it most of the
 * plan when you want to read the building: at the small size, a whole floor's
 * doorways are a pixel wide.
 */
export function PreviewPanel({ children, options, onOptions }: {
  children: ReactNode;
  options?: PreviewOptions;
  onOptions?: (patch: Partial<PreviewOptions>) => void;
}) {
  const size = options?.large ? "large" : "small";
  return (
    <section
      aria-label="3D preview"
      data-size={size}
      className={`absolute overflow-hidden rounded border border-stone-200 bg-white shadow-lg ${PANEL_SIZE[size]}`}
    >
      {children}
      {options && onOptions && (
        // Filled while pressed, as the guide's tools are: "Larger" pressed is what makes it small again.
        <div className="absolute right-2 top-2 flex gap-1">
          <Button
            size="sm"
            variant={options.fullHeightWalls ? "primary" : "secondary"}
            aria-pressed={options.fullHeightWalls}
            onClick={() => onOptions({ fullHeightWalls: !options.fullHeightWalls })}
          >
            Full-height walls
          </Button>
          <Button
            size="sm"
            variant={options.large ? "primary" : "secondary"}
            aria-pressed={options.large}
            onClick={() => onOptions({ large: !options.large })}
          >
            Larger
          </Button>
        </div>
      )}
    </section>
  );
}
