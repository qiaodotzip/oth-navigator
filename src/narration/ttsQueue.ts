import type { Language, NarrationSegment } from "@/data/types";

type Job = { text: string; lang: Language; onStart?: () => void; onEnd?: () => void };

let queue: Job[] = [];
let speaking = false;

function langTag(l: Language) {
  return l === "zh" ? "zh-CN" : "en-US";
}

function pickVoice(lang: Language): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const tag = langTag(lang);
  const exact = voices.find(v => v.lang === tag);
  if (exact) return exact;
  const prefix = voices.find(v => v.lang.startsWith(tag.split("-")[0]));
  return prefix ?? null;
}

function speakNext() {
  if (speaking) return;
  const job = queue.shift();
  if (!job) return;
  speaking = true;
  const utt = new SpeechSynthesisUtterance(job.text);
  utt.lang = langTag(job.lang);
  const v = pickVoice(job.lang);
  if (v) utt.voice = v;
  utt.onstart = () => job.onStart?.();
  utt.onend = () => {
    speaking = false;
    job.onEnd?.();
    speakNext();
  };
  window.speechSynthesis.speak(utt);
}

export function enqueueSegments(
  segments: NarrationSegment[],
  lang: Language,
  onSegmentEnd: (key: string) => void,
) {
  for (const seg of segments) {
    queue.push({
      text: lang === "zh" ? seg.zh : seg.en,
      lang,
      onEnd: () => onSegmentEnd(seg.key),
    });
  }
  speakNext();
}

export function cancelAll() {
  queue = [];
  window.speechSynthesis.cancel();
  speaking = false;
}
