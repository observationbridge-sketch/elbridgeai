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
  const [lastDurationSeconds, setLastDurationSeconds] = useState(0);
  const recognitionRef = useRef<any>(null);
  const accumulatedRef = useRef("");
  const sessionFinalsRef = useRef("");
  const shouldListenRef = useRef(false);
  const recordingStartRef = useRef<number>(0);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    recordingStartRef.current = Date.now();

    const recognition = createRecognition();
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isSupported, createRecognition]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    const duration = recordingStartRef.current > 0
      ? (Date.now() - recordingStartRef.current) / 1000
      : 0;
    setLastDurationSeconds(Math.round(duration * 10) / 10);
    recordingStartRef.current = 0;

    if (recognition) {
      try { recognition.stop(); } catch {
        try { recognition.abort(); } catch {}
      }
    }

    // Give browser 300ms to finish processing final speech segment before committing
    stopTimeoutRef.current = setTimeout(() => {
      stopTimeoutRef.current = null;
      accumulatedRef.current += sessionFinalsRef.current;
      sessionFinalsRef.current = "";
      setTranscript(accumulatedRef.current);
      setIsListening(false);
    }, 300);
  }, []);

  const resetTranscript = useCallback(() => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    accumulatedRef.current = "";
    sessionFinalsRef.current = "";
    setTranscript("");
    setLastDurationSeconds(0);
  }, []);

  return {
    isListening,
    transcript,
    lastDurationSeconds,
    startListening,
    stopListening,
    resetTranscript,
    isSupported,
  };
}
