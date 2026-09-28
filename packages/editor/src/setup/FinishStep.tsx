import type { Level } from "@oth/model";
import type { Api } from "../api/client";
import { DownloadModelButton } from "../build/DownloadModel";
import { followLink, href } from "../route";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { doneLine } from "./progress";
import type { SetupStepState } from "./types";

/**
 * Step 9 (spec §4.1): the floor goes back to normal editing, and the 3D model
 * is offered. Download 3D model is Plan 6B's button, the same one that sits
 * beside the 3D toggle on Build; here it is fixed to the floor being set up.
 */
export function FinishStep({ api, level, state, onFinish }: {
  api: Api;
  level: Level;
  state: SetupStepState | null;
  onFinish: () => void;
}) {
  const team = useEditorStore(s => s.team);
  const build = href({ name: "floor", code: level.code, tab: "build", params: {} });
  const done = doneLine(state, team);

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Finish</h1>
        <p className="text-sm text-stone-600">
          {level.code} is set up. From here the team edits it as usual, on Build and the other tabs, and publishes it when it's ready.
        </p>
      </header>
      <section aria-label="3D model" className="space-y-2 rounded border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold">The 3D model</h2>
        <p className="text-xs text-stone-600">
          For the modeller, or to hand over: everything the 3D preview shows, as named parts, in metres.
        </p>
        <DownloadModelButton api={api} levelId={level.id} />
      </section>
      {done ? (
        <p role="status" className="text-sm text-stone-700">
          <span aria-hidden>✓ </span>
          {done}
        </p>
      ) : (
        <Button variant="primary" onClick={onFinish}>Finish setup and open Build</Button>
      )}
      {done && (
        <a href={build} onClick={followLink(build)} className="inline-block text-sm font-medium text-accent underline">
          Open Build
        </a>
      )}
    </div>
  );
}
