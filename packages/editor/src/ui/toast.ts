import { create } from "zustand";

export type ToastTone = "info" | "success" | "error";
export type ToastAction = { label: string; run: () => void | Promise<void> };
export type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  /** Null: stays until dismissed. */
  durationMs: number | null;
};
export type ToastInput = {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
  durationMs?: number | null;
};

type ToastState = {
  toasts: Toast[];
  push: (t: Toast) => void;
  dismiss: (id: string) => void;
  clear: () => void;
};

/** Four at most: a fifth pushes the oldest out rather than stacking up the screen. */
export const useToasts = create<ToastState>(set => ({
  toasts: [],
  push: t => set(s => ({ toasts: [...s.toasts.filter(x => x.id !== t.id), t].slice(-4) })),
  dismiss: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

let seq = 0;

/**
 * Says what just happened, where the status bar used to.
 *
 * Errors stay until dismissed — a failure that disappears on its own is one
 * nobody saw — and anything carrying an Undo stays long enough to reach for it.
 */
export function toast(input: ToastInput): string {
  const id = `toast-${++seq}`;
  const tone = input.tone ?? "info";
  const durationMs =
    input.durationMs !== undefined
      ? input.durationMs
      : tone === "error" ? null : input.action ? 8000 : 4000;
  useToasts.getState().push({ id, message: input.message, tone, action: input.action, durationMs });
  return id;
}
