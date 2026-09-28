import { useRef } from "react";
import type { BuildStepId } from "../flow/floorProgress";
import { useEditorStore } from "../state/store";
import { useKeys } from "../ui/keys";
import { buildKeyAction } from "./keys";
import { stepOfTool } from "./steps";

/**
 * Build's keys (spec §11), heard through `useKeys`, so like Survey's and
 * Review's they never act while you type, or behind a dialog or popover.
 *
 * Delete and Escape are also the canvas's keys — a corner selected, a shape
 * half drawn — and which listener hears a key first depends on when each was
 * attached. So those two wait a tick and act only if nothing claimed the key
 * (preventDefault) in the meantime. The tool keys and F act at once.
 */
export function useBuildKeys(handlers: {
  onFit: () => void;
  onDelete: () => void;
  onStep: (step: BuildStepId) => void;
}): void {
  // Delete and Escape act a tick after the press, by when a render may have
  // brought new handlers: they call whichever are current then.
  const latest = useRef(handlers);
  latest.current = handlers;

  useKeys(event => {
    const s = useEditorStore.getState();
    const action = buildKeyAction({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      target: event.target,
      drafting: (s.draft?.length ?? 0) > 0,
    });
    if (!action) return;

    if (action.kind === "tool") {
      s.setTool(action.tool);
      const owner = stepOfTool(action.tool);
      if (owner) latest.current.onStep(owner);
      return;
    }
    if (action.kind === "fit") {
      latest.current.onFit();
      return;
    }

    // A held Backspace takes a shape back a corner at a time. Once the corners
    // are gone its repeats would fall through to here and delete whatever is
    // selected, so a delete is only ever a fresh press.
    if (action.kind === "delete" && event.repeat) return;

    setTimeout(() => {
      if (event.defaultPrevented) return;
      if (action.kind === "delete") {
        latest.current.onDelete();
        return;
      }
      // Escape steps back one thing at a time: the shape in progress, then the tool, then the selection.
      const now = useEditorStore.getState();
      if (now.draft) now.clearDraft();
      else if (now.tool !== "select") now.setTool("select");
      else now.select(null);
    }, 0);
  });
}
