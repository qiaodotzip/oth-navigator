import type { Language } from "@/data/types";
import { RETRIEVAL_BASE } from "@/data/retrieval";

/**
 * Spoken turn-by-turn guidance. Same path as JOM's Buddy voice: POST the line
 * to the backend's ElevenLabs endpoint (`/api/tts`) and play the MP3; if the
 * key isn't set (503) / it errors (502) / the network is down / autoplay is
 * blocked, fall back to the browser's speechSynthesis so navigation still talks.
 * We hold the playing Audio so a new step (or a tap) cancels the previous line.
 */

// `_aborted` marks an element we stopped on purpose (tap Next / mute / new step).
// Clearing `src` to release it fires an `error` event, and pausing rejects a
// pending `play()` — without this flag those paths would wrongly fall back to
// the browser voice on top of the next line.
type ManagedAudio = HTMLAudioElement & { _aborted?: boolean };
let currentAudio: ManagedAudio | null = null;
// Bumped on every stop. An in-flight speak() compares its captured value after
// each await and bails if a newer line (or a stop) has superseded it — fixes
// out-of-order fetches starting old audio on top of the current line.
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

/** Stop whatever is currently being spoken (ElevenLabs audio or browser voice). */
export function stopSpeaking() {
  speakSeq++; // invalidate any speak() currently awaiting a fetch
  if (currentAudio) {
    const a = currentAudio;
    currentAudio = null;
    a._aborted = true; // guards the error / play-reject / autoplay-check paths
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
      // 503 (no key) / 502 (ElevenLabs errored) → browser voice.
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
    audio.addEventListener("error", () => {
      cleanup();
      if (audio._aborted) return; // we stopped it on purpose — don't fall back
      speakWithBrowser(clean, lang);
    });
    try {
      await audio.play();
      // Chrome may resolve play() then silently block (expired user gesture,
      // no error event). Sanity-check and fall back if it never started — but
      // only if this line is still the active one and wasn't stopped.
      await new Promise(r => setTimeout(r, 150));
      if (audio._aborted || currentAudio !== audio) return;
      if (audio.paused && audio.currentTime === 0) {
        cleanup();
        speakWithBrowser(clean, lang);
      }
    } catch {
      if (audio._aborted) return; // pause() during stop rejects play() — expected
      cleanup();
      speakWithBrowser(clean, lang);
    }
  } catch {
    if (seq !== speakSeq) return; // superseded — don't fall back over the new line
    // Network error reaching the backend — browser voice.
    speakWithBrowser(clean, lang);
  }
}

// Voice lists load async on most browsers; touch once so the first line isn't
// the robotic default.
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
}
