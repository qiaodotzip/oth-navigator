import { useState } from "react";
import { MagnifyingGlass, DownloadSimple } from "phosphor-react";
import { useStore } from "@/store";
import { ServiceIcon } from "./iconMap";
import { PURPOSE_TILES } from "@/intent/synonyms";

export function IntentEntry({
  onSubmit,
  onReceiveJourney,
}: {
  // fromText=true marks a typed free-text prompt (asks the backend concierge);
  // tile taps omit it and take the instant local path.
  onSubmit: (query: string, fromText?: boolean) => void;
  onReceiveJourney?: () => void;
}) {
  const language = useStore(s => s.language);
  const [query, setQuery] = useState("");

  const submit = () => {
    const q = query.trim();
    if (q) onSubmit(q, true);
  };

  return (
    <div className="flex flex-col px-4 py-4">
      <h2 className="mb-3 text-lg font-extrabold text-oth-ink">
        {language === "zh" ? "今天需要办理什么？" : "What do you need to do today?"}
      </h2>

      <form
        onSubmit={e => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2 rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-neutral-200 focus-within:ring-2 focus-within:ring-oth-primary"
      >
        <MagnifyingGlass size={22} weight="bold" className="text-neutral-400" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={
            language === "zh"
              ? "例如：我失业了，付不起房贷"
              : "e.g. I lost my job and can't pay my mortgage"
          }
          className="w-full bg-transparent text-base font-medium text-oth-ink placeholder:text-neutral-400 focus:outline-none"
          aria-label="Describe what you need"
        />
      </form>

      <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-neutral-400">
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

      {onReceiveJourney && (
        <button
          type="button"
          onClick={onReceiveJourney}
          className="mt-4 inline-flex items-center gap-2 self-start rounded-xl border border-dashed border-oth-primary/50 bg-oth-primary/5 px-3 py-2 text-sm font-semibold text-oth-primary transition active:scale-95 hover:bg-oth-primary/10"
        >
          <DownloadSimple size={18} weight="bold" />
          {language === "zh" ? "接收行程（演示）" : "Receive Journey (demo)"}
        </button>
      )}
    </div>
  );
}
