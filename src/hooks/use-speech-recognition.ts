import { useState, useCallback, useRef } from "react";

const isMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const accumulatedRef = useRef("");
  const sessionFinalsRef = useRef("");
  const shouldListenRef = useRef(false);

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const mobile = isMobileDevice();

  const createRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";

    if (mobile) {
      // Mobile: single-shot sessions, auto-restart loop
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        let text = "";
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            text += event.results[i][0].transcript;
          }
        }
        if (text) {
          accumulatedRef.current += text;
          setTranscript(accumulatedRef.current);
        }
      };

      recognition.onend = () => {
        // Auto-restart if still supposed to be listening
        if (shouldListenRef.current) {
          try {
            const newRec = createRecognition();
            recognitionRef.current = newRec;
            newRec.start();
          } catch {
            shouldListenRef.current = false;
            setIsListening(false);
          }
        }
      };
    } else {
      // Desktop: continuous mode with interim results
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let sessionFinal = "";
        let interim = "";
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            sessionFinal += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        sessionFinalsRef.current = sessionFinal;
        setTranscript(accumulatedRef.current + sessionFinal + interim);
      };

      recognition.onend = () => {
        accumulatedRef.current += sessionFinalsRef.current;
        sessionFinalsRef.current = "";
        if (shouldListenRef.current) {
          try {
            recognition.start();
          } catch {
            shouldListenRef.current = false;
            setIsListening(false);
          }
        }
      };
    }

    recognition.onerror = (e: any) => {
      if (e.error === "aborted" || e.error === "no-speech") return;
      shouldListenRef.current = false;
      setIsListening(false);
    };

    return recognition;
  }, [mobile]);

  const startListening = useCallback(() => {
    if (!isSupported) return;

    sessionFinalsRef.current = "";
    shouldListenRef.current = true;

    const recognition = createRecognition();
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isSupported, createRecognition]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      try { recognition.abort(); } catch {}
      try { recognition.stop(); } catch {}
    }
    setIsListening(false);
    // Finalize desktop session finals
    accumulatedRef.current += sessionFinalsRef.current;
    sessionFinalsRef.current = "";
    setTranscript(accumulatedRef.current);
  }, []);

  const resetTranscript = useCallback(() => {
    accumulatedRef.current = "";
    sessionFinalsRef.current = "";
    setTranscript("");
  }, []);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    resetTranscript,
    isSupported,
  };
}
