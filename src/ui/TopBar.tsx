import { useStore } from "@/store";
import { GlobeHemisphereWest, PersonSimpleWalk } from "phosphor-react";

/**
 * Minimal top bar: language + step-free toggles only. tamp has NO search — the
 * chatbot bar lives on the JOM side; journeys arrive via the poller in App.
 */
export function TopBar() {
  const language = useStore(s => s.language);
  const profile = useStore(s => s.profile);
  const setLanguage = useStore(s => s.setLanguage);
  const setProfile = useStore(s => s.setProfile);

  return (
    <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-oth-paper px-3 py-2.5 md:px-6 md:py-3">
      <span className="truncate text-base font-extrabold text-oth-ink">
        One Tampines Hub
      </span>

      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          onClick={() => setLanguage(language === "en" ? "zh" : "en")}
          className="flex h-10 items-center gap-1 rounded-xl bg-white px-2.5 text-oth-ink shadow-sm ring-1 ring-neutral-200"
          aria-label={language === "zh" ? "切换语言" : "Toggle language"}
        >
          <GlobeHemisphereWest size={20} weight="bold" />
          <span className="text-sm font-bold">{language === "en" ? "EN" : "中"}</span>
        </button>

        <button
          onClick={() => setProfile(profile === "default" ? "stepFree" : "default")}
          aria-label={language === "zh" ? "无障碍（仅电梯）路线" : "Step-free (lift-only) routing"}
          aria-pressed={profile === "stepFree"}
          title={language === "zh" ? "无障碍路线" : "Step-free routing"}
          className={`grid h-10 w-10 place-items-center rounded-xl shadow-sm ring-1 transition ${
            profile === "stepFree"
              ? "bg-oth-primary text-white ring-oth-primary"
              : "bg-white text-oth-ink ring-neutral-200"
          }`}
        >
          <PersonSimpleWalk size={20} weight="bold" />
        </button>
      </div>
    </div>
  );
}
