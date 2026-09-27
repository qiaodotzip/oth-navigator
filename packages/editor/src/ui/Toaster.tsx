import * as T from "@radix-ui/react-toast";
import { useToasts } from "./toast";

const EDGE = { info: "border-stone-300", success: "border-confirmed", error: "border-danger" } as const;

/**
 * Where every toast appears. Radix supplies the live region, so each message is
 * announced, and the swipe-to-dismiss.
 */
export function Toaster() {
  const toasts = useToasts(s => s.toasts);
  const dismiss = useToasts(s => s.dismiss);

  return (
    <T.Provider swipeDirection="right">
      {toasts.map(t => (
        <T.Root
          key={t.id}
          data-testid={`toast-${t.tone}`}
          // Radix reads Infinity as "until dismissed".
          duration={t.durationMs ?? Infinity}
          onOpenChange={open => {
            if (!open) dismiss(t.id);
          }}
          className={`flex items-start gap-3 rounded border-l-4 bg-white p-3 text-sm shadow-lg ${EDGE[t.tone]}`}
        >
          <T.Description className="flex-1">{t.message}</T.Description>
          {t.action && (
            <T.Action altText={t.action.label} asChild>
              <button
                type="button"
                className="font-semibold text-accent hover:underline"
                onClick={() => void t.action!.run()}
              >
                {t.action.label}
              </button>
            </T.Action>
          )}
          <T.Close aria-label="Dismiss" className="text-stone-400 hover:text-stone-700">
            ×
          </T.Close>
        </T.Root>
      ))}
      <T.Viewport className="fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
    </T.Provider>
  );
}
