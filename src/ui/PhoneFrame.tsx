import { ReactNode } from "react";

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-neutral-900 p-3 md:p-0">
      {/* Phone-framed on narrow screens (the senior's-mobile-app story); edge-to-
          edge on desktop so the map hero fills the projector — the panel keeps its
          own max-width, so the extra room all goes to the map. */}
      <div
        className="relative overflow-hidden rounded-[2rem] bg-oth-paper shadow-2xl
                   w-[min(94vw,390px)] h-[min(96vh,844px)]
                   md:w-screen md:h-screen md:rounded-none md:shadow-none"
      >
        {children}
      </div>
    </div>
  );
}
