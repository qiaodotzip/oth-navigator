import { useState } from "react";
import { isUnauthorized, type Api } from "../api/client";
import { CalibrationError, calibrationFromMeasurement } from "../plan/calibration";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { imageForLevel } from "../state/underlay";

export function FloorplanPanel({ api, saver }: { api: Api; saver: Saver }) {
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const levelImages = useEditorStore(s => s.levelImages);
  const draft = useEditorStore(s => s.calibrationDraft);
  const beginCalibration = useEditorStore(s => s.beginCalibration);
  const clearCalibration = useEditorStore(s => s.clearCalibration);
  const setStatus = useEditorStore(s => s.setStatus);
  const [metres, setMetres] = useState("");

  const image = imageForLevel(levelImages, activeLevelId);

  async function upload(file: File) {
    if (!activeLevelId) return;
    try {
      await api.uploadLevelImage(activeLevelId, file);
      setStatus(`Added ${file.name}. Now set the scale.`);
      await saver.refresh();
    } catch (err) {
      // The sign-in dialog over the page is the message; a raw 401 beside it is noise.
      if (isUnauthorized(err)) return;
      // Header-validation rejections arrive here; show the server's own words.
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveImage(patch: { offsetX?: number; offsetY?: number; opacity?: number }) {
    if (!image) return;
    // A blur on a half-typed value must not write NaN into the calibration.
    if (Object.values(patch).some(v => v === undefined || Number.isNaN(v))) return;
    try {
      await api.patchLevelImage(image.id, image.version, patch);
      await saver.refresh();
    } catch (err) {
      // The sign-in dialog over the page is the message; a raw 401 beside it is noise.
      if (isUnauthorized(err)) return;
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  async function applyScale() {
    if (!image || !draft || draft.length < 2) return;
    try {
      const { metresPerPixel } = calibrationFromMeasurement(
        draft[0]!,
        draft[draft.length - 1]!,
        Number.parseFloat(metres),
      );
      await api.patchLevelImage(image.id, image.version, { metresPerPixel });
      clearCalibration();
      setStatus(`Scale set to ${metresPerPixel.toFixed(4)} m per pixel.`);
      await saver.refresh();
    } catch (err) {
      // The sign-in dialog over the page is the message; a raw 401 beside it is noise.
      if (isUnauthorized(err)) return;
      if (err instanceof CalibrationError) {
        setStatus(err.message);
        return;
      }
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-3 border-b p-3 text-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Floorplan</h2>

      {!image && (
        <label className="block cursor-pointer text-xs text-stone-600">
          Add a floorplan
          <input
            aria-label="Add a floorplan"
            type="file"
            accept="image/png,image/jpeg"
            className="mt-1 block w-full text-xs"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
      )}

      {image && (
        <>
          <div className="text-xs text-stone-600">{image.filename}</div>
          <div className="text-xs text-stone-500">
            {image.metresPerPixel == null
              ? "Not scaled yet."
              : `${image.metresPerPixel.toFixed(4)} m per pixel`}
          </div>

          <button className="w-full rounded border px-2 py-1" onClick={() => beginCalibration()}>
            Set the scale
          </button>

          {draft && (
            <div className="space-y-2 rounded bg-stone-100 p-2">
              <p className="text-xs text-stone-600">
                {draft.length < 2
                  ? `Click two points on something you know the length of (${draft.length}/2).`
                  : "Now type how far apart those points really are."}
              </p>
              <label className="block text-xs">
                Real distance (metres)
                <input
                  aria-label="Real distance in metres"
                  className="mt-1 w-full rounded border px-2 py-1"
                  inputMode="decimal"
                  value={metres}
                  onChange={e => setMetres(e.target.value)}
                />
              </label>
              <button
                className="w-full rounded bg-stone-800 py-1 text-white disabled:opacity-40"
                disabled={draft.length < 2}
                onClick={() => void applyScale()}
              >
                Apply scale
              </button>
            </div>
          )}

          {image.metresPerPixel != null && (
            <div className="space-y-2">
              <p className="text-xs text-stone-500">
                Position the image so it lines up with the floor below.
              </p>
              <div className="flex gap-2">
                <label className="block flex-1 text-xs">
                  East (m)
                  <input
                    aria-label="East offset in metres"
                    className="mt-1 w-full rounded border px-2 py-1"
                    inputMode="decimal"
                    defaultValue={image.offsetX}
                    onBlur={e => void saveImage({ offsetX: Number.parseFloat(e.target.value) })}
                  />
                </label>
                <label className="block flex-1 text-xs">
                  North (m)
                  <input
                    aria-label="North offset in metres"
                    className="mt-1 w-full rounded border px-2 py-1"
                    inputMode="decimal"
                    defaultValue={image.offsetY}
                    onBlur={e => void saveImage({ offsetY: Number.parseFloat(e.target.value) })}
                  />
                </label>
              </div>
              <label className="block text-xs">
                Opacity
                <input
                  aria-label="Underlay opacity"
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  defaultValue={image.opacity}
                  className="mt-1 w-full"
                  onMouseUp={e =>
                    void saveImage({
                      opacity: Number.parseFloat((e.target as HTMLInputElement).value),
                    })
                  }
                />
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}
