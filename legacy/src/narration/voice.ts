import type { Language } from "@/data/types";
import { RETRIEVAL_BASE } from "@/data/retrieval";

/**
 * Spoken turn-by-turn guidance. Primary path is the backend's ElevenLabs
 * endpoint (`/api/tts`). The browser's speechSynthesis is used ONLY as a
 * fallback when the backend can't return audio — a non-200 (key blocked /
 * ElevenLabs errored) or an unreachable backend. It never plays on top of a
 * working ElevenLabs line: by then we've already committed to the audio path.
 * We hold the playing Audio so a new step (or a tap) cancels the previous line.
 */

// `_aborted` marks an element we stopped on purpose (tap Next / mute / new step).
// Clearing `src` to release it fires an `error` event and pausing rejects a
// pending `play()`; the flag lets those handlers tell an intentional stop from a
// real failure.
type ManagedAudio = HTMLAudioElement & { _aborted?: boolean };
let currentAudio: ManagedAudio | null = null;
// Bumped on every stop. An in-flight speak() compares its captured value after
// each await and bails if a newer line (or a stop) has superseded it — fixes
// out-of-order fetches starting an old line on top of the current one.
let speakSeq = 0;

function langTag(l: Language): string {
  return l === "zh" ? "zh-CN" : "en-US";
}

// Prefer the OS's newer neural voices over the robotic legacy ones — same
// heuristic JOM uses so the fallback voice doesn't sound like a phone tree.
function pickVoice(lang: Language): SpeechSynthesisVoice | null {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const isNeural = (v: SpeechSynthesisVoice) =>
    /natural|online|neural|enhanced|premium|wavenet|siri/i.test(v.name);
  const priority =
    lang === "zh"
      ? ["zh-SG", "zh-CN", "zh-TW", "zh-HK"]
      : ["en-SG", "en-AU", "en-GB", "en-US", "en-NZ"];
  for (const tag of priority) {
    const v = voices.find(x => x.lang === tag && isNeural(x));
    if (v) return v;
  }
  const prefix = priority[0].split("-")[0];
  const anyNeural = voices.find(v => isNeural(v) && v.lang?.startsWith(prefix));
  if (anyNeural) return anyNeural;
  for (const tag of priority) {
    const v = voices.find(x => x.lang === tag);
    if (v) return v;
  }
  return voices.find(v => v.lang?.startsWith(prefix)) ?? voices[0];
}

// Fallback only — used when ElevenLabs is unavailable, never alongside it.
function speakWithBrowser(text: string, lang: Language) {
  if (!("speechSynthesis" in window)) return;
  const utt = new SpeechSynthesisUtterance(text);
  const v = pickVoice(lang);
  if (v) {
    utt.voice = v;
    utt.lang = v.lang;
  } else {
    utt.lang = langTag(lang);
  }
  utt.rate = 0.95; // a touch slower — kinder for elderly listeners
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utt);
}

/** Stop whatever line is currently playing (ElevenLabs audio or browser voice). */
export function stopSpeaking() {
  speakSeq++; // invalidate any speak() currently awaiting a fetch
  if (currentAudio) {
    const a = currentAudio;
    currentAudio = null;
    a._aborted = true;
    try {
      a.pause();
    } catch {
      /* ignore */
    }
    a.src = "";
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Speak a guidance line. Cancels any line already playing. */
export async function speak(text: string, lang: Language) {
  const clean = text.trim();
  if (!clean) return;
  stopSpeaking();
  const seq = speakSeq; // our generation; a later stop/speak bumps speakSeq past it
  try {
    const resp = await fetch(`${RETRIEVAL_BASE}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean.slice(0, 7900) }),
    });
    if (seq !== speakSeq) return; // superseded while fetching — drop this line
    if (!resp.ok) {
      // Key blocked / ElevenLabs errored (502/503/…). Fall back so the demo
      // still talks. No ElevenLabs audio exists yet, so nothing overlaps.
      console.warn(`[voice] TTS ${resp.status} — falling back to browser voice`);
      speakWithBrowser(clean, lang);
      return;
    }
    const blob = await resp.blob();
    if (seq !== speakSeq) return; // superseded while reading the body
    const url = URL.createObjectURL(blob);
    const audio: ManagedAudio = new Audio(url);
    currentAudio = audio;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
    };
    audio.addEventListener("ended", cleanup);
    // ElevenLabs succeeded — a stop/end just clears the element. Do NOT fall
    // back here, or an intentional stop (src="") would speak over the next line.
    audio.addEventListener("error", cleanup);
    try {
      await audio.play();
    } catch (e) {
      if (audio._aborted) return; // pause() during a stop rejects play() — expected
      console.warn("[voice] audio.play() blocked:", e);
      cleanup();
    }
  } catch (e) {
    if (seq !== speakSeq) return;
    // Backend unreachable — fall back to the browser voice.
    console.warn("[voice] TTS request failed — falling back to browser voice:", e);
    speakWithBrowser(clean, lang);
  }
}

// Voice lists load async on most browsers; touch once so a first fallback line
// isn't the robotic default.
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
}
