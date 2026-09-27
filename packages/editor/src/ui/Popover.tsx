import * as P from "@radix-ui/react-popover";
import type { ReactNode } from "react";

/** Wrap an item in this (asChild) to close the popover when it is chosen. */
export const PopoverClose = P.Close;

/**
 * A panel anchored to its trigger. The trigger must be a single element that
 * takes a ref — a Button, or a plain button or anchor.
 */
export function Popover({
  trigger,
  children,
  align = "start",
  open,
  onOpenChange,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-56 rounded-lg border border-stone-200 bg-white p-2 text-sm shadow-lg outline-none"
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
