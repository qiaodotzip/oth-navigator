import { create } from "zustand";

/**
 * Whether the header's Claude Code panel is open. It lives here rather than
 * in the button, so the setup wizard's "Connect Claude Code" can open it too.
 */
export const useClaudeCodePanel = create<{ open: boolean; setOpen: (open: boolean) => void }>(set => ({
  open: false,
  setOpen: open => set({ open }),
}));

export function openClaudeCodePanel(): void {
  useClaudeCodePanel.getState().setOpen(true);
}
