import { useState, type ChangeEvent, type ReactNode } from "react";
import type { Api, LevelImage, LevelImagePatch } from "../api/client";
import { levelBelow } from "../flow/floors";
import { CalibrationError, calibrationFromMeasurement, worldToImagePoint } from "../plan/calibration";
import { useEditorStore } from "../state/store";
import { displayCalibration, imageForLevel } from "../state/underlay";
import { Button } from "../ui/Button";
import { reportFailure } from "../ui/failure";
import { Popover, PopoverClose } from "../ui/Popover";
import { toast } from "../ui/toast";
import { PAPER_SIZES, SHAPE_TOLERANCE, parseRatio, sheetScale, type PaperSize } from "./sheetScale";

const ACCEPT = "image/png,image/jpeg";

/** Adds a floor's plan. The server retires the floor's old one as it stores this. */
export async function uploadPlan(api: Api, levelId: string, file: File): Promise<void> {
  let created: LevelImage;
  try {
    created = await api.uploadLevelImage(levelId, file);
  } catch (err) {
    reportFailure(err, { doing: `add ${file.name}`, retry: () => uploadPlan(api, levelId, file) });
    return;
  }
  const s = useEditorStore.getState();
  s.setLevelImages([...s.levelImages.filter(i => i.levelId !== levelId), created]);
  toast({ tone: "success", message: `Added ${file.name}. Now set its scale.` });
}

/**
 * Changes a plan's scale, place or opacity. The answer is the whole image, so
 * there is nothing else to reload: none of these changes any validation.
 */
export async function patchPlan(
  api: Api, image: LevelImage, patch: LevelImagePatch, words: { doing: string; done?: string },
): Promise<void> {
  let updated: LevelImage;
  try {
    updated = await api.patchLevelImage(image.id, image.version, patch);
  } catch (err) {
    reportFailure(err, { doing: words.doing, retry: () => patchPlan(api, image, patch, words) });
    return;
  }
  const s = useEditorStore.getState();
  s.setLevelImages(s.levelImages.map(i => (i.id === updated.id ? updated : i)));
  if (words.done) toast({ tone: "success", message: words.done });
}

/**
 * The file a picker was given. The picker is emptied as it is read: otherwise
 * choosing the same file again — after a refusal, say — changes nothing and
 * nothing happens.
 */
function chosenFile(e: ChangeEvent<HTMLInputElement>): File | undefined {
  const file = e.target.files?.[0];
  e.target.value = "";
  return file;
}

/** Where a floor's plan goes when it has none: drop it, or choose it. */
export function PlanDropZone({ api }: { api: Api }) {
  const levelId = useEditorStore(s => s.activeLevelId);
  const [over, setOver] = useState(false);
  const take = (file: File | undefined) => {
    if (file && levelId) void uploadPlan(api, levelId, file);
  };

  return (
    <div
      data-testid="plan-drop-zone"
      className={`absolute left-1/2 top-1/2 z-10 flex w-[28rem] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-lg border-2 border-dashed p-8 text-center ${
        over ? "border-accent bg-accent-soft" : "border-stone-300 bg-white/90"
      }`}
      onDragOver={e => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files[0]);
      }}
    >
      <p className="text-sm font-medium">Drop this floor's plan here</p>
      <p className="mt-1 text-xs text-stone-500">A PNG or JPEG of the architect's sheet, as large as you have it.</p>
      <label className="mt-4 inline-flex h-9 cursor-pointer items-center rounded bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover focus-within:ring-2 focus-within:ring-accent-ring">
        Choose a file
        <input
          type="file"
          accept={ACCEPT}
          aria-label="Choose a floorplan file"
          className="sr-only"
          onChange={e => take(chosenFile(e))}
        />
      </label>
    </div>
  );
}

/** The Floorplan step's tools beyond Measure and Align: the scale, Sheet scale, replacing, opacity. */
export function FloorplanTools({ api }: { api: Api }) {
  const model = useEditorStore(s => s.model);
  const levelId = useEditorStore(s => s.activeLevelId);
  const images = useEditorStore(s => s.levelImages);
  const tool = useEditorStore(s => s.tool);
  const image = imageForLevel(images, levelId);

  if (!image || !levelId) {
    return <p className="text-xs text-stone-600">Start with the plan: drop it on the canvas.</p>;
  }
  const below = levelBelow(model, levelId);

  const commitOpacity = (value: string) => {
    const opacity = Number(value);
    if (!Number.isFinite(opacity) || opacity === image.opacity) return;
    void patchPlan(api, image, { opacity }, { doing: "change the plan's opacity" });
  };

  return (
    <>
      <p className="text-xs text-stone-700">
        <span className="font-medium">{image.filename}</span> ·{" "}
        {image.metresPerPixel == null
          ? <span className="text-yours">not scaled yet</span>
          : `${image.metresPerPixel.toFixed(4)} m per pixel`}
      </p>

      {tool === "calibrate" && <MeasureScale api={api} image={image} />}

      {tool === "align-plan" && (
        <p className="text-xs text-stone-600">
          {below
            ? `The dashed outlines are ${below.code}. Drag until this plan's walls sit on them.`
            : "This is the lowest floor, so its plan is where every other floor lines up. Move it only if the whole building should move."}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SheetScale api={api} image={image} />
        <label className="inline-flex h-7 cursor-pointer items-center rounded border border-stone-300 bg-white px-2.5 text-xs font-medium hover:bg-stone-100 focus-within:ring-2 focus-within:ring-accent-ring">
          Replace plan…
          <input
            type="file"
            accept={ACCEPT}
            aria-label="Replace the floorplan"
            className="sr-only"
            onChange={e => {
              const file = chosenFile(e);
              if (file) void uploadPlan(api, levelId, file);
            }}
          />
        </label>
      </div>

      <label className="block text-xs text-stone-700">
        Plan opacity
        <input
          key={image.id}
          aria-label="Plan opacity"
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          defaultValue={image.opacity}
          className="mt-1 w-full accent-accent"
          onMouseUp={e => commitOpacity(e.currentTarget.value)}
          onKeyUp={e => commitOpacity(e.currentTarget.value)}
        />
      </label>
    </>
  );
}

/** The distance field for Measure scale, shown while the tool is in use. */
function MeasureScale({ api, image }: { api: Api; image: LevelImage }) {
  const draft = useEditorStore(s => s.calibrationDraft);
  const setTool = useEditorStore(s => s.setTool);
  const [metres, setMetres] = useState("");
  const ready = (draft?.length ?? 0) >= 2;

  function apply() {
    if (!draft || draft.length < 2) return;
    // The clicks are world points on the plan as drawn; the scale is about the
    // plan's own pixels, so convert them back through how it is drawn now.
    const shown = displayCalibration(image)!;
    try {
      const { metresPerPixel } = calibrationFromMeasurement(
        worldToImagePoint(shown, draft[0]!),
        worldToImagePoint(shown, draft[draft.length - 1]!),
        Number.parseFloat(metres),
      );
      void patchPlan(api, image, { metresPerPixel }, {
        doing: "set the scale",
        done: `Scale set to ${metresPerPixel.toFixed(4)} m per pixel.`,
      });
      setTool("select");
    } catch (err) {
      if (!(err instanceof CalibrationError)) throw err;
      toast({ tone: "error", message: `Couldn't set the scale: ${err.message}.` });
    }
  }

  return (
    <div className="space-y-2 rounded bg-stone-100 p-2">
      <label className="block text-xs text-stone-700">
        Real distance (metres)
        <input
          aria-label="Real distance in metres"
          inputMode="decimal"
          value={metres}
          onChange={e => setMetres(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") apply();
          }}
          className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm"
        />
      </label>
      <Button size="sm" variant="primary" disabled={!ready} onClick={apply}>
        Apply scale
      </Button>
    </div>
  );
}

/** A warning says so in words and a mark, never by its colour alone. */
function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs text-yours">
      <span aria-hidden className="font-semibold">!</span> <span className="font-semibold">Warning:</span> {children}
    </p>
  );
}

/** Sheet scale: the paper size and printed ratio from the title block, never a drawn scale bar. */
function SheetScale({ api, image }: { api: Api; image: LevelImage }) {
  const [paper, setPaper] = useState<PaperSize>("A3");
  const [ratioText, setRatioText] = useState("1:1500");
  const ratio = parseRatio(ratioText);
  const result = ratio ? sheetScale(paper, ratio, image.widthPx, image.heightPx) : null;
  // A plan can arrive scaled — L1's came from its own drawing at 0.07 m per
  // pixel, and that raster is not an A3 sheet, so A3 at 1:1500 would be wrong
  // for it. A scale already set is shown, and replaced only by a button that
  // says so: everything traced on the plan was traced at that scale.
  const current = image.metresPerPixel;
  const same = result != null && current != null && Math.abs(result.metresPerPixel - current) <= current * 1e-6;

  return (
    <Popover trigger={<Button size="sm">Sheet scale</Button>}>
      <div className="w-72 space-y-3 p-1">
        <p className="text-xs text-stone-600">
          Read the paper size and scale from the title block. Never use a drawn scale bar: on OTH's sheets it is wrong.
        </p>
        <div className="flex gap-2">
          <label className="block flex-1 text-xs text-stone-700">
            Paper
            <select
              aria-label="Paper size"
              value={paper}
              onChange={e => setPaper(e.target.value as PaperSize)}
              className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm"
            >
              {(Object.keys(PAPER_SIZES) as PaperSize[]).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="block flex-1 text-xs text-stone-700">
            Scale
            <input
              aria-label="Scale ratio"
              value={ratioText}
              placeholder="1:1500"
              onChange={e => setRatioText(e.target.value)}
              className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm"
            />
          </label>
        </div>
        <p aria-live="polite" className="text-xs text-stone-700">
          {result ? `${result.metresPerPixel.toFixed(4)} m per pixel` : "Type a scale like 1:1500."}
        </p>
        {result && result.shapeMismatch > SHAPE_TOLERANCE && (
          <Warning>
            {`This image is not the shape of an ${paper} sheet, so it may be cropped or a reduction. Measure a known distance instead.`}
          </Warning>
        )}
        {current != null && (same ? (
          <p className="text-xs text-stone-700">This plan already has this scale.</p>
        ) : (
          <Warning>
            {`This plan is already scaled at ${current.toFixed(4)} m per pixel. Replacing it resizes the plan under anything already traced on it.`}
          </Warning>
        ))}
        <PopoverClose asChild>
          <Button
            size="sm"
            variant="primary"
            disabled={!result || same}
            onClick={() => {
              if (!result || !ratio) return;
              const was = current == null ? "" : ` (it was ${current.toFixed(4)})`;
              void patchPlan(api, image, { metresPerPixel: result.metresPerPixel }, {
                doing: "set the scale",
                done: `Scale set to ${result.metresPerPixel.toFixed(4)} m per pixel, from ${paper} at 1:${ratio}${was}.`,
              });
            }}
          >
            {current == null ? "Apply" : "Replace scale"}
          </Button>
        </PopoverClose>
      </div>
    </Popover>
  );
}
