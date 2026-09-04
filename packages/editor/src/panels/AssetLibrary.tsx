import { useEffect } from "react";
import type { Api } from "../api/client";
import { useEditorStore } from "../state/store";

export function AssetLibrary({ api, onPlace }: { api: Api; onPlace: (assetId: string) => void }) {
  const assets = useEditorStore(s => s.assets);
  const selectedAssetId = useEditorStore(s => s.selectedAssetId);
  const setAssets = useEditorStore(s => s.setAssets);
  const selectAsset = useEditorStore(s => s.selectAsset);
  const setStatus = useEditorStore(s => s.setStatus);

  useEffect(() => {
    api.listAssets().then(setAssets).catch(() => setAssets([]));
  }, [api, setAssets]);

  async function upload(file: File) {
    try {
      const created = await api.uploadAsset(file);
      setStatus(`Uploaded ${created.filename}.`);
      setAssets(await api.listAssets());
    } catch (err) {
      // Budget rejections arrive here; show the server's own words.
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-2 border-t p-3 text-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Dressing</h2>

      <label className="block cursor-pointer text-xs text-stone-600">
        Upload a .glb
        <input
          aria-label="Upload a .glb"
          type="file"
          accept=".glb,model/gltf-binary"
          className="mt-1 block w-full text-xs"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>

      <ul className="space-y-1">
        {assets.map(a => (
          <li key={a.id}>
            <button
              onClick={() => selectAsset(a.id)}
              className={`w-full rounded px-2 py-1 text-left ${
                selectedAssetId === a.id ? "bg-stone-800 text-white" : "hover:bg-stone-100"
              }`}
            >
              <div>{a.filename}</div>
              <div className="text-xs opacity-70">
                {a.triangleCount.toLocaleString()} tris · {Math.round(a.sizeBytes / 1024)} KB
              </div>
            </button>
          </li>
        ))}
      </ul>

      <button
        disabled={!selectedAssetId}
        onClick={() => selectedAssetId && onPlace(selectedAssetId)}
        className="w-full rounded bg-stone-800 py-1 text-white disabled:opacity-40"
      >
        Place in selected room
      </button>
    </div>
  );
}
