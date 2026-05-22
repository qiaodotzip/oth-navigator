import { useRef, useState } from "react";

// Note: SpeechRecognition / SpeechRecognitionEvent are not in this TS lib version,
// so we fall back to `any` for the recognition object and event payloads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;

export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const recogRef = useRef<SR>(null);

  function start(lang: "en-US" | "zh-CN") {
    const Ctor =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }).SpeechRecognition ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!Ctor) return;
    const recog = new Ctor();
    recog.lang = lang;
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recog.onresult = (e: any) =>
      setTranscript(e.results[0][0].transcript);
    recog.onend = () => setListening(false);
    recog.onerror = () => setListening(false);
    recog.start();
    recogRef.current = recog;
    setListening(true);
  }
  function stop() {
    recogRef.current?.stop();
    setListening(false);
  }

  return { transcript, listening, start, stop };
}
