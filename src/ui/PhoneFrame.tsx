import { ReactNode } from "react";

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-neutral-900 p-3 md:p-6">
      <div
        className="relative overflow-hidden rounded-[2rem] md:rounded-[2.5rem] bg-oth-paper shadow-2xl
                   w-[min(94vw,390px)] h-[min(96vh,844px)]
                   md:w-[min(70vw,820px)] md:h-[min(96vh,1180px)]"
      >
        {children}
      </div>
    </div>
  );
}
