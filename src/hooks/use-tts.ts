import { useState, useCallback, useRef, useEffect } from "react";

function selectBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // Priority 1: Google US English
  const google = voices.find(v => v.name.includes("Google") && v.lang.startsWith("en"));
  if (google) return google;

  // Priority 2: Cloud-enhanced en-US voice
  const cloudEnUS = voices.find(v => v.lang === "en-US" && !v.localService);
  if (cloudEnUS) return cloudEnUS;

  // Priority 3: Any en-US voice
  const anyEnUS = voices.find(v => v.lang === "en-US");
  if (anyEnUS) return anyEnUS;

  // Priority 4: Any English voice
  const anyEn = voices.find(v => v.lang.startsWith("en"));
  if (anyEn) return anyEn;

  return null;
}

export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const bestVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        bestVoiceRef.current = selectBestVoice(voices);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const cleaned = text.replace(/🔊\s*/g, "").replace(/Listen:\s*/i, "").trim();
    const utterance = new SpeechSynthesisUtterance(cleaned);

    if (bestVoiceRef.current) {
      utterance.voice = bestVoiceRef.current;
    }

    utterance.rate = 0.9;
    utterance.pitch = 1.05;
    utterance.volume = 1;
    utterance.lang = "en-US";

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  return { speak, stop, isSpeaking, isSupported };
}
