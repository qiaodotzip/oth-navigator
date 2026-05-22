import { ReactNode } from "react";

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-neutral-900 p-4">
      <div
        className="relative overflow-hidden rounded-[2.5rem] bg-oth-paper shadow-2xl"
        style={{ width: 390, height: 844 }}
      >
        {children}
      </div>
    </div>
  );
}
