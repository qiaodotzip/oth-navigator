import { useStore } from "@/store";
import { PersonSimpleWalk, GlobeHemisphereWest } from "phosphor-react";

const VOICE_INPUT_ENABLED = false;

export function TopBar({ onVoiceTap: _onVoiceTap }: { onVoiceTap: () => void }) {
  const language = useStore(s => s.language);
  const profile = useStore(s => s.profile);
  const setLanguage = useStore(s => s.setLanguage);
  const setProfile = useStore(s => s.setProfile);
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-oth-primary text-white">
      <button
        onClick={() => setLanguage(language === "en" ? "zh" : "en")}
        className="flex items-center gap-1 px-2 py-1 rounded bg-white/15"
        aria-label="Toggle language"
      >
        <GlobeHemisphereWest size={20} weight="bold" />
        <span className="text-sm font-semibold">{language === "en" ? "EN" : "中"}</span>
      </button>
      <button
        onClick={() => setProfile(profile === "default" ? "stepFree" : "default")}
        className={`flex items-center gap-1 px-2 py-1 rounded ${
          profile === "stepFree" ? "bg-oth-warm text-oth-ink" : "bg-white/15"
        }`}
        aria-label="Toggle step-free routing"
      >
        <PersonSimpleWalk size={20} weight="bold" />
        <span className="text-xs font-semibold">Step-free</span>
      </button>
      {VOICE_INPUT_ENABLED ? null : <span aria-hidden="true" className="w-9" />}
    </div>
  );
}
