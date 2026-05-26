import { useEffect, useState } from "react";
import { MagnifyingGlass, Microphone, DownloadSimple } from "phosphor-react";
import { useStore } from "@/store";
import { ServiceIcon } from "./iconMap";
import { PURPOSE_TILES } from "@/intent/synonyms";

export function IntentEntry({
  onSubmit,
  onReceiveJourney,
  onVoiceTap,
  voiceListening,
  voiceTranscript,
}: {
  onSubmit: (query: string) => void;
  onReceiveJourney?: () => void;
  onVoiceTap?: () => void;
  voiceListening?: boolean;
  voiceTranscript?: string;
}) {
  const language = useStore(s => s.language);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (voiceTranscript) setQuery(voiceTranscript);
  }, [voiceTranscript]);

  const submit = () => {
    const q = query.trim();
    if (q) onSubmit(q);
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
          placeholder={language === "zh" ? "例如：更新护照" : "e.g. renew my passport"}
          className="w-full bg-transparent text-base font-medium text-oth-ink placeholder:text-neutral-400 focus:outline-none"
          aria-label="Describe what you need"
        />
        {onVoiceTap && (
          <button
            type="button"
            onClick={onVoiceTap}
            aria-label={voiceListening ? "Stop listening" : "Search by voice"}
            aria-pressed={voiceListening}
            className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full transition ${
              voiceListening ? "animate-pulse bg-rose-500 text-white" : "bg-oth-primary/10 text-oth-primary"
            }`}
          >
            <Microphone size={22} weight="fill" />
          </button>
        )}
      </form>
      {voiceListening && (
        <p className="mt-1.5 px-1 text-xs font-semibold text-rose-500">
          {language === "zh" ? "正在聆听…请说出需求" : "Listening… say what you need"}
        </p>
      )}

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
