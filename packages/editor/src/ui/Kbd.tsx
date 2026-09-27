/** A key, drawn as a key, so shortcuts can be learned from the screen. */
export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-b-2 border-stone-300 bg-white px-1 font-mono text-xs text-stone-600">
      {children}
    </kbd>
  );
}
