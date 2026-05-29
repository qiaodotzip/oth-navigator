import { DownloadSimple } from "phosphor-react";
import { useStore } from "@/store";
import { ServiceIcon } from "./iconMap";
import { PURPOSE_TILES } from "@/intent/synonyms";

export function IntentEntry({
  onSubmit,
  onRoutingDemo,
}: {
  // Tile taps take the instant local path (fromText omitted). The typed
  // free-text → backend concierge path lives in the top-bar search.
  onSubmit: (query: string, fromText?: boolean) => void;
  onRoutingDemo?: () => void;
}) {
  const language = useStore(s => s.language);

  return (
    <div className="flex flex-col px-4 py-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-400">
        {language === "zh" ? "常见需求" : "Common needs"}
      </p>
      <div className="grid grid-cols-1 gap-2">
        {PURPOSE_TILES.map(t => (
          <button
            key={t.query}
            onClick={() => onSubmit(t.query)}
            className="flex items-center gap-2.5 rounded-2xl border border-neutral-200 bg-white p-3 text-left shadow-sm transition active:scale-[0.98] hover:border-oth-primary/40"
          >
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-oth-primary/10 text-oth-primary">
              <ServiceIcon iconKey={t.iconKey} size={22} />
            </span>
            <span className="text-sm font-bold text-oth-ink">
              {language === "zh" ? t.zh : t.en}
            </span>
          </button>
        ))}
      </div>

      {onRoutingDemo && (
        <button
          type="button"
          onClick={onRoutingDemo}
          className="mt-4 inline-flex items-center gap-2 self-start rounded-xl border border-dashed border-oth-primary/50 bg-oth-primary/5 px-3 py-2 text-sm font-semibold text-oth-primary transition active:scale-95 hover:bg-oth-primary/10"
        >
          <DownloadSimple size={18} weight="bold" />
          {language === "zh" ? "演示路线逻辑" : "Show routing logic"}
        </button>
      )}
    </div>
  );
}
