import { ShieldCheck, X } from "phosphor-react";
import type { Language } from "@/data/types";

/**
 * Demo admin gate. There's no real auth — a single tap "logs in as admin" and
 * opens the staff dashboard (the #dashboard hash route, matched at the top of
 * App's render, so we set the hash and reload like the dashboard↔report links).
 */
export function LoginModal({
  open,
  onClose,
  language,
}: {
  open: boolean;
  onClose: () => void;
  language: Language;
}) {
  if (!open) return null;
  const zh = language === "zh";

  const enterDashboard = () => {
    window.location.hash = "#dashboard";
    window.location.reload();
  };

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-black/40 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={zh ? "管理员登录" : "Admin login"}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-oth-primary/10 text-oth-primary">
            <ShieldCheck size={24} weight="bold" />
          </div>
          <button
            onClick={onClose}
            aria-label={zh ? "关闭" : "Close"}
            className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <h2 className="mt-3 text-lg font-extrabold text-oth-ink">
          {zh ? "管理员登录" : "Admin login"}
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          {zh
            ? "以管理员身份登录以打开运营仪表板。"
            : "Sign in as an administrator to open the operations dashboard."}
        </p>

        <button
          onClick={enterDashboard}
          className="mt-5 w-full rounded-xl bg-oth-primary py-3 text-sm font-bold text-white shadow-sm transition hover:brightness-110 active:scale-[0.99]"
        >
          {zh ? "以管理员身份登录" : "Log in as admin"}
        </button>
      </div>
    </div>
  );
}
