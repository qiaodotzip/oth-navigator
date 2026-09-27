import * as D from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

/** A modal with a title, focus held inside, Escape to close. Radix does the hard parts. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  dismissible = true,
  closeOnOutsideClick = true,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  dismissible?: boolean;
  /**
   * Independent of `dismissible`, so a dialog can still show its × and close
   * on Escape while a stray click outside does nothing — for a shown-once
   * secret, that click must not be what throws it away.
   */
  closeOnOutsideClick?: boolean;
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-stone-900/40" />
        <D.Content
          className="fixed left-1/2 top-1/2 z-50 w-[28rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5 shadow-xl"
          onEscapeKeyDown={dismissible ? undefined : e => e.preventDefault()}
          onPointerDownOutside={dismissible && closeOnOutsideClick ? undefined : e => e.preventDefault()}
        >
          <D.Title className="text-base font-semibold">{title}</D.Title>
          {description ? (
            <D.Description className="mt-1 text-xs text-stone-500">{description}</D.Description>
          ) : (
            // Radix wants a description; a screen reader gets the title again.
            <D.Description className="sr-only">{title}</D.Description>
          )}
          <div className="mt-4">{children}</div>
          {dismissible && (
            <D.Close aria-label="Close" className="absolute right-3 top-3 text-stone-400 hover:text-stone-700">
              ×
            </D.Close>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
