import { useState } from "react";
import { useStore } from "@/store";
import { GlobeHemisphereWest, PersonSimpleWalk, SignIn, SpeakerHigh, SpeakerSlash, Wheelchair } from "phosphor-react";
import { stopSpeaking } from "@/narration/voice";
import { LoginModal } from "@/ui/LoginModal";

/**
 * Minimal top bar: language + step-free toggles only. tamp has NO search — the
 * chatbot bar lives on the JOM side; journeys arrive via the poller in App.
 */
export function TopBar() {
  const language = useStore(s => s.language);
  const profile = useStore(s => s.profile);
  const setLanguage = useStore(s => s.setLanguage);
  const setProfile = useStore(s => s.setProfile);
  const voiceOn = useStore(s => s.voiceOn);
  const toggleVoice = useStore(s => s.toggleVoice);
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-oth-paper px-3 py-2.5 md:px-6 md:py-3">
      <span className="truncate text-base font-extrabold text-oth-ink">
        One Tampines Hub
      </span>

      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          onClick={() => {
            if (voiceOn) stopSpeaking(); // muting → silence the current line now
            toggleVoice();
          }}
          aria-label={
            language === "zh"
              ? voiceOn
                ? "关闭语音导航"
                : "开启语音导航"
              : voiceOn
                ? "Mute voice guidance"
                : "Enable voice guidance"
          }
          aria-pressed={voiceOn}
          title={language === "zh" ? "语音导航" : "Voice guidance"}
          className={`grid h-10 w-10 place-items-center rounded-xl shadow-sm ring-1 transition ${
            voiceOn
              ? "bg-oth-primary text-white ring-oth-primary"
              : "bg-white text-oth-ink ring-neutral-200"
          }`}
        >
          {voiceOn ? <SpeakerHigh size={20} weight="bold" /> : <SpeakerSlash size={20} weight="bold" />}
        </button>

        <button
          onClick={() => setLanguage(language === "en" ? "zh" : "en")}
          className="flex h-10 items-center gap-1 rounded-xl bg-white px-2.5 text-oth-ink shadow-sm ring-1 ring-neutral-200"
          aria-label={language === "zh" ? "切换语言" : "Toggle language"}
        >
          <GlobeHemisphereWest size={20} weight="bold" />
          <span className="text-sm font-bold">{language === "en" ? "EN" : "中"}</span>
        </button>

        {/* Step-free is the default (elderly-first). The control always shows
            which mode is active rather than hiding state behind one icon. */}
        <div
          role="group"
          aria-label={language === "zh" ? "路线类型" : "Route type"}
          className="flex h-10 items-center rounded-xl bg-white p-0.5 shadow-sm ring-1 ring-neutral-200"
        >
          <button
            onClick={() => setProfile("stepFree")}
            aria-pressed={profile === "stepFree"}
            title={language === "zh" ? "无障碍（仅电梯）路线" : "Step-free (lift-only) routing"}
            className={`flex h-9 items-center gap-1 rounded-[10px] px-2.5 text-sm font-bold transition ${
              profile === "stepFree" ? "bg-oth-primary text-white" : "text-oth-ink"
            }`}
          >
            <Wheelchair size={18} weight="bold" />
            <span>{language === "zh" ? "无障碍" : "Step-free"}</span>
          </button>
          <button
            onClick={() => setProfile("default")}
            aria-pressed={profile === "default"}
            title={language === "zh" ? "可走楼梯／扶梯" : "Allow stairs & escalators"}
            className={`flex h-9 items-center gap-1 rounded-[10px] px-2.5 text-sm font-bold transition ${
              profile === "default" ? "bg-oth-primary text-white" : "text-oth-ink"
            }`}
          >
            <PersonSimpleWalk size={18} weight="bold" />
            <span>{language === "zh" ? "可走楼梯" : "Stairs OK"}</span>
          </button>
        </div>

        <button
          onClick={() => setLoginOpen(true)}
          className="flex h-10 items-center gap-1 rounded-xl bg-white px-2.5 text-oth-ink shadow-sm ring-1 ring-neutral-200"
          aria-label={language === "zh" ? "登录" : "Log in"}
        >
          <SignIn size={20} weight="bold" />
          <span className="text-sm font-bold">{language === "zh" ? "登录" : "Login"}</span>
        </button>
      </div>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} language={language} />
    </div>
  );
}
