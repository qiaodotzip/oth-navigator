import { useState } from "react";
import { isUnauthorized, type Api } from "../api/client";
import { useEditorStore } from "../state/store";

export function PublishButton({ api }: { api: Api }) {
  const report = useEditorStore(s => s.report);
  const setStatus = useEditorStore(s => s.setStatus);
  const [busy, setBusy] = useState(false);

  // The server refuses anyway; disabling here just explains why before the click.
  const blocked = !report || !report.ok;

  return (
    <button
      disabled={blocked || busy}
      title={blocked ? "Fix the validation errors first" : "Publish a new version"}
      className="rounded bg-emerald-700 px-3 py-1 text-sm text-white disabled:opacity-40"
      onClick={async () => {
        setBusy(true);
        try {
          const result = await api.publish();
          setStatus(`Published ${result.version} (${result.warningCount} warnings).`);
        } catch (err) {
          // The sign-in dialog over the page is the message; a raw 401 beside it is noise.
          if (isUnauthorized(err)) return;
          setStatus(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Publishing…" : "Publish"}
    </button>
  );
}
