import { useState, type ChangeEvent, type ReactNode } from "react";
import { create } from "zustand";
import type { Api, LevelImage, LevelImagePatch } from "../api/client";
import { CalibrationError, calibrationFromMeasurement, worldToImagePoint } from "../plan/calibration";
import { useEditorStore } from "../state/store";
import { displayCalibration, imageForLevel } from "../state/underlay";
import { Button } from "../ui/Button";
import { reportFailure } from "../ui/failure";
import { Popover, PopoverClose } from "../ui/Popover";
import { toast } from "../ui/toast";
import { PAPER_SIZES, SHAPE_TOLERANCE, parseRatio, sheetScale, type PaperSize } from "./sheetScale";

const ACCEPT = "image/png,image/jpeg";

/** The server's own limit (`IMAGE_MAX_BYTES` in `server/src/images/inspect.ts`). */
const MAX_PLAN_BYTES = 20 * 1024 * 1024;

/**
 * Whether a file could be a plan, checked before 20 MB goes up the wire only
 * to be refused. A file with no type (some drops have none) is judged by its
 * name; the server reads the bytes either way.
 */
function couldBePlan(file: File): boolean {
  const pngOrJpeg = file.type
    ? /^image\/(png|jpeg)$/.test(file.type)
    : /\.(png|jpe?g)$/i.test(file.name);
  return pngOrJpeg && file.size <= MAX_PLAN_BYTES;
}

/**
 * Per floor, the plan on its way up, by name. Shared rather than kept by one
 * picker, so a Retry from the toast shows it too, and a drop cannot start a
 * second upload beside it. By floor, so an upload still going on L1 neither
 * shows nor blocks on L2 once you switch.
 */
const useAddingPlan = create<{ byLevel: Readonly<Record<string, string>> }>(() => ({ byLevel: {} }));

function setAdding(levelId: string, name: string | null): void {
  useAddingPlan.setState(s => {
    const byLevel = { ...s.byLevel };
    if (name == null) delete byLevel[levelId];
    else byLevel[levelId] = name;
    return { byLevel };
  });
}

/** The name of the plan going up for this floor, if one is. */
function useAddingOn(levelId: string | null): string | null {
  return useAddingPlan(s => (levelId ? s.byLevel[levelId] ?? null : null));
}

/** Adds a floor's plan. The server retires the floor's old one as it stores this. */
export async function uploadPlan(api: Api, levelId: string, file: File): Promise<void> {
  if (!couldBePlan(file)) {
    toast({ tone: "error", message: `Couldn't add ${file.name}. Export the sheet as a PNG or JPEG under 20 MB.` });
    return;
  }
  setAdding(levelId, file.name);
  let created: LevelImage;
  try {
    created = await api.uploadLevelImage(levelId, file);
  } catch (err) {
    setAdding(levelId, null);
    reportFailure(err, { doing: `add ${file.name}`, retry: () => uploadPlan(api, levelId, file) });
    return;
  }
  const s = useEditorStore.getState();
  s.setLevelImages([...s.levelImages.filter(i => i.levelId !== levelId), created]);
  setAdding(levelId, null);
  toast({ tone: "success", message: `Added ${file.name}. Now set its scale.` });
}

/** Per plan, the last save queued for it; forgotten once the queue is empty. */
const planSaves = new Map<string, Promise<boolean>>();

/**
 * Changes a plan's scale, place or opacity. The answer is the whole image, so
 * there is nothing else to reload: none of these changes any validation.
 * True once the server has it, so a caller can wait for that before moving on.
 *
 * One save per plan at a time. Each carries the version the server gave the
 * one before it: sent side by side, the second would carry a version the first
 * had already moved past, and the server would refuse your own nudge as
 * someone else's change. An Align drop and a scale, or two drops in a row,
 * overlap easily over Railway's round trip.
 */
export function patchPlan(
  api: Api, image: LevelImage, patch: LevelImagePatch, words: { doing: string; done?: string },
): Promise<boolean> {
  const before = planSaves.get(image.id);
  // Each save settles to a boolean and never throws, so one that fails still lets the next go.
  const saving = before ? before.then(() => sendPlanPatch(api, image, patch, words)) : sendPlanPatch(api, image, patch, words);
  planSaves.set(image.id, saving);
  void saving.then(() => {
    if (planSaves.get(image.id) === saving) planSaves.delete(image.id);
  });
  return saving;
}

async function sendPlanPatch(
  api: Api, image: LevelImage, patch: LevelImagePatch, words: { doing: string; done?: string },
): Promise<boolean> {
  // The version as it is now, after the saves queued ahead of this one.
  const version = useEditorStore.getState().levelImages.find(i => i.id === image.id)?.version ?? image.version;
  let updated: LevelImage;
  try {
    updated = await api.patchLevelImage(image.id, version, patch);
  } catch (err) {
    reportFailure(err, { doing: words.doing, retry: () => patchPlan(api, image, patch, words).then(() => {}) });
    return false;
  }
  const s = useEditorStore.getState();
  s.setLevelImages(s.levelImages.map(i => (i.id === updated.id ? updated : i)));
  if (words.done) toast({ tone: "success", message: words.done });
  return true;
}

/** Per plan, the opacity last asked for while a save of it is on its way. */
const opacityWanted = new Map<string, number>();

/**
 * Saves a plan's opacity. The slider can be let go again and again before the
 * last save has answered: the newest value waits, and goes once the save in
 * flight answers; values let go of in between are never sent. `patchPlan`
 * keeps it in line with the plan's other saves.
 */
async function saveOpacity(api: Api, imageId: string, opacity: number): Promise<void> {
  const inFlight = opacityWanted.has(imageId);
  opacityWanted.set(imageId, opacity);
  if (inFlight) return;
  try {
    for (;;) {
      const image = useEditorStore.getState().levelImages.find(i => i.id === imageId);
      const wanted = opacityWanted.get(imageId)!;
      if (!image || image.opacity === wanted) return;
      if (!(await patchPlan(api, image, { opacity: wanted }, { doing: "change the plan's opacity" }))) return;
    }
  } finally {
    opacityWanted.delete(imageId);
  }
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

/** A file picker drawn as a button. Its label is its name, so what you see is what a voice command says. */
function PlanPicker({ label, busy, onFile, className, hover }: {
  label: string; busy: boolean; onFile: (file: File) => void; className: string; hover: string;
}) {
  return (
    <label
      className={`inline-flex items-center rounded font-medium focus-within:ring-2 focus-within:ring-accent-ring ${className} ${
        busy ? "cursor-not-allowed opacity-40" : `cursor-pointer ${hover}`
      }`}
    >
      {label}
      <input
        type="file"
        accept={ACCEPT}
        disabled={busy}
        className="sr-only"
        onChange={e => {
          const file = chosenFile(e);
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

/**
 * Where a floor's plan goes when it has none: drop it in the box, or choose it.
 * Only the box takes a drop, so the floor's canvas around it still pans and zooms.
 */
export function PlanDropZone({ api }: { api: Api }) {
  const levelId = useEditorStore(s => s.activeLevelId);
  const adding = useAddingOn(levelId);
  const [over, setOver] = useState(false);
  const take = (file: File | undefined) => {
    if (file && levelId && !adding) void uploadPlan(api, levelId, file);
  };

  return (
    <div
      data-testid="plan-drop-zone"
      aria-busy={adding != null}
      className={`absolute left-1/2 top-1/2 z-10 flex w-[28rem] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-lg border-2 border-dashed p-8 text-center ${
        over ? "border-accent bg-accent-soft" : "border-stone-300 bg-white/90"
      }`}
      // Always taken, even while busy: a drop nobody takes opens the file in
      // the browser, in place of the editor.
      onDragOver={e => {
        e.preventDefault();
        if (!adding) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files[0]);
      }}
    >
      <p aria-live="polite" className="text-sm font-medium">
        {adding ? `Adding ${adding}…` : "Drop this floor's plan here"}
      </p>
      <p className="mt-1 text-xs text-stone-500">A PNG or JPEG of the architect's sheet, up to 20 MB.</p>
      <PlanPicker
        label="Choose a file"
        busy={adding != null}
        onFile={take}
        className="mt-4 h-9 bg-accent px-3.5 text-sm text-white"
        hover="hover:bg-accent-hover"
      />
    </div>
  );
}

/**
 * The Floorplan step's tools beyond Measure and Align: the scale, Sheet scale,
 * replacing, opacity. How to align is the guide's to say, above these, so one
 * voice says what to do next.
 */
export function FloorplanTools({ api }: { api: Api }) {
  const levelId = useEditorStore(s => s.activeLevelId);
  const images = useEditorStore(s => s.levelImages);
  const tool = useEditorStore(s => s.tool);
  const adding = useAddingOn(levelId);
  const image = imageForLevel(images, levelId);
  // A replacement waiting for you to say yes: see `replaceWith`.
  const [replacing, setReplacing] = useState<File | null>(null);

  if (!image || !levelId) {
    return <p className="text-xs text-stone-600">Start with the plan: drop it in the box on the canvas.</p>;
  }

  const commitOpacity = (value: string) => {
    const opacity = Number(value);
    if (Number.isFinite(opacity)) void saveOpacity(api, image.id, opacity);
  };

  // The server retires the old plan as it stores the new one, and with it the
  // scale and position you gave it; nothing can Undo that. An unscaled plan
  // has little to lose, so only a scaled one asks first.
  const replaceWith = (file: File) => {
    if (image.metresPerPixel == null) void uploadPlan(api, levelId, file);
    else setReplacing(file);
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

      <div className="flex flex-wrap items-center gap-2">
        <SheetScale api={api} image={image} />
        <PlanPicker
          label="Replace plan…"
          busy={adding != null}
          onFile={replaceWith}
          className="h-7 border border-stone-300 bg-white px-2.5 text-xs"
          hover="hover:bg-stone-100"
        />
        <span aria-live="polite" className="text-xs text-stone-600">
          {adding ? `Adding ${adding}…` : ""}
        </span>
      </div>

      {replacing && image.metresPerPixel != null && (
        <div className="space-y-2 rounded border border-yours/30 bg-yours-soft p-2">
          <Warning>
            {`This plan is scaled at ${image.metresPerPixel.toFixed(4)} m per pixel. Replacing it with ${replacing.name} loses its scale and position, and you can't undo that.`}
          </Warning>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={adding != null}
              onClick={() => {
                setReplacing(null);
                void uploadPlan(api, levelId, replacing);
              }}
            >
              Replace plan
            </Button>
            <Button size="sm" onClick={() => setReplacing(null)}>Keep this plan</Button>
          </div>
        </div>
      )}

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
          // A mouse release is a pointer release too; the second of the pair
          // finds the first already saving the same value and adds nothing.
          onPointerUp={e => commitOpacity(e.currentTarget.value)}
          onMouseUp={e => commitOpacity(e.currentTarget.value)}
          onKeyUp={e => commitOpacity(e.currentTarget.value)}
        />
      </label>
    </>
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

/**
 * Said wherever a scale can be replaced. A plan can arrive scaled — L1's came
 * from its own drawing at 0.07 m per pixel — and everything traced on it was
 * traced at that scale.
 */
function AlreadyScaled({ metresPerPixel }: { metresPerPixel: number }) {
  return (
    <Warning>
      {`This plan is already scaled at ${metresPerPixel.toFixed(4)} m per pixel. Replacing it resizes the plan under anything already traced on it.`}
    </Warning>
  );
}

/** "(it was 0.0700)", for the toast that says a scale was replaced; nothing for a first scale. */
function wasScale(metresPerPixel: number | null): string {
  return metresPerPixel == null ? "" : ` (it was ${metresPerPixel.toFixed(4)})`;
}

/** The distance field for Measure scale, shown while the tool is in use. */
function MeasureScale({ api, image }: { api: Api; image: LevelImage }) {
  const draft = useEditorStore(s => s.calibrationDraft);
  const setTool = useEditorStore(s => s.setTool);
  const [metres, setMetres] = useState("");
  const [saving, setSaving] = useState(false);
  const ready = (draft?.length ?? 0) >= 2 && !saving;
  const current = image.metresPerPixel;

  async function apply() {
    if (!draft || draft.length < 2 || saving) return;
    // The clicks are world points on the plan as drawn; the scale is about the
    // plan's own pixels, so convert them back through how it is drawn now.
    const shown = displayCalibration(image)!;
    let metresPerPixel: number;
    try {
      ({ metresPerPixel } = calibrationFromMeasurement(
        worldToImagePoint(shown, draft[0]!),
        worldToImagePoint(shown, draft[draft.length - 1]!),
        Number.parseFloat(metres),
      ));
    } catch (err) {
      if (!(err instanceof CalibrationError)) throw err;
      toast({ tone: "error", message: `Couldn't set the scale: ${err.message}.` });
      return;
    }
    setSaving(true);
    const saved = await patchPlan(api, image, { metresPerPixel }, {
      doing: "set the scale",
      done: `Scale set to ${metresPerPixel.toFixed(4)} m per pixel${wasScale(current)}.`,
    });
    setSaving(false);
    // Put down only once it is saved: a failed save keeps the two points to
    // try again from. And only if it is still in hand — another tool picked
    // up meanwhile is not taken away.
    if (saved && useEditorStore.getState().tool === "calibrate") setTool("select");
  }

  return (
    <div className="space-y-2 rounded bg-stone-100 p-2">
      <label className="block text-xs text-stone-700">
        Real distance (metres)
        <input
          inputMode="decimal"
          value={metres}
          onChange={e => setMetres(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") void apply();
          }}
          className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm"
        />
      </label>
      {current != null && <AlreadyScaled metresPerPixel={current} />}
      <Button size="sm" variant="primary" disabled={!ready} onClick={() => void apply()}>
        {current == null ? "Apply scale" : "Replace scale"}
      </Button>
    </div>
  );
}

/** Sheet scale: the paper size and printed ratio from the title block, never a drawn scale bar. */
function SheetScale({ api, image }: { api: Api; image: LevelImage }) {
  const [paper, setPaper] = useState<PaperSize>("A3");
  const [ratioText, setRatioText] = useState("1:1500");
  const ratio = parseRatio(ratioText);
  const result = ratio ? sheetScale(paper, ratio, image.widthPx, image.heightPx) : null;
  // L1's plan is not an A3 sheet, so A3 at 1:1500 would be wrong for it: a
  // scale already set is shown, and replaced only by a button that says so.
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
        {current != null && (same
          ? <p className="text-xs text-stone-700">This plan already has this scale.</p>
          : <AlreadyScaled metresPerPixel={current} />)}
        <PopoverClose asChild>
          <Button
            size="sm"
            variant="primary"
            disabled={!result || same}
            onClick={() => {
              if (!result || !ratio) return;
              void patchPlan(api, image, { metresPerPixel: result.metresPerPixel }, {
                doing: "set the scale",
                done: `Scale set to ${result.metresPerPixel.toFixed(4)} m per pixel, from ${paper} at 1:${ratio}${wasScale(current)}.`,
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
