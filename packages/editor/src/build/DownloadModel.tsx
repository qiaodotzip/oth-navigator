import { live } from "@oth/model";
import { buildFloorGlb, floorExportNote, type AssetBytes } from "@oth/renderer";
import { useState } from "react";
import type { Api } from "../api/client";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { downloadBytes } from "../ui/download";
import { Popover, PopoverClose } from "../ui/Popover";
import { toast } from "../ui/toast";

/**
 * Fetches placed models through the asset URL, with the session. A model that
 * isn't there, or a request that fails, is null to the export and remembered
 * here, so the message after the download can say how many are missing.
 */
export function assetFetcher(
  assetFileUrl: (assetId: string) => string,
  fetchImpl: typeof fetch = fetch,
): { bytes: AssetBytes; missing: Set<string> } {
  const missing = new Set<string>();
  const bytes: AssetBytes = async assetId => {
    try {
      const res = await fetchImpl(assetFileUrl(assetId), { credentials: "same-origin" });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      // Offline, or refused: the same as a model that isn't there.
    }
    missing.add(assetId);
    return null;
  };
  return { bytes, missing };
}

type Scope = "floor" | "all";

function missingNote(count: number): string {
  return count === 1
    ? "1 model could not be fetched, so its objects are boxes or left out."
    : `${count} models could not be fetched, so their objects are boxes or left out.`;
}

/**
 * Download 3D model (spec §6): the floor, or every floor stacked, as one .glb
 * of named parts, built from what the preview draws. It sits beside 3D in
 * Build, and the setup wizard's Finish step (Plan 6E) shows it for the floor
 * being set up.
 */
export function DownloadModelButton({ api, levelId }: { api: Api; levelId?: string }) {
  const model = useEditorStore(s => s.model);
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const [busy, setBusy] = useState(false);
  const floorId = levelId ?? activeLevelId;
  const level = model && floorId ? live(model.levels).find(l => l.id === floorId) ?? null : null;

  async function download(scope: Scope) {
    const current = useEditorStore.getState().model;
    if (!current || !level || busy) return;
    const levelIds = scope === "all" ? live(current.levels).map(l => l.id) : [level.id];
    const filename = scope === "all" ? "oth-all-floors.glb" : `oth-${level.code}.glb`;
    const fetcher = assetFetcher(api.assetFileUrl);
    setBusy(true);
    try {
      const bytes = await buildFloorGlb(current, levelIds, fetcher.bytes);
      downloadBytes(bytes, filename, "model/gltf-binary");
      const note = fetcher.missing.size === 0 ? floorExportNote(levelIds.length > 1) : missingNote(fetcher.missing.size);
      toast({ tone: "success", message: `Downloaded ${filename}. ${note}` });
    } catch (err) {
      toast({ tone: "error", message: `The 3D model could not be built: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover
      trigger={
        <Button size="sm" disabled={!level || busy}>
          {busy ? "Building 3D model…" : "Download 3D model"}
        </Button>
      }
    >
      <p className="mb-2 max-w-60 text-xs text-stone-600">
        Rooms, walls, voids, stops, objects and pathways as named parts, in metres. Walls are full height.
      </p>
      <div className="flex flex-col gap-1">
        {level && (
          <PopoverClose asChild>
            <Button size="sm" onClick={() => void download("floor")}>This floor ({level.code})</Button>
          </PopoverClose>
        )}
        <PopoverClose asChild>
          <Button size="sm" onClick={() => void download("all")}>All floors</Button>
        </PopoverClose>
      </div>
    </Popover>
  );
}
