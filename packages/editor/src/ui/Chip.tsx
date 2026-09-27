import type { ReactNode } from "react";

/** A toggle that reads as a filter: pressed or not, with an optional count. */
export function Chip({
  selected = false,
  count,
  onClick,
  children,
}: {
  selected?: boolean;
  count?: number;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium ${
        selected
          ? "border-stone-900 bg-stone-900 text-white"
          : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={selected ? "text-stone-300" : "text-stone-500"}>{count}</span>
      )}
    </button>
  );
}
