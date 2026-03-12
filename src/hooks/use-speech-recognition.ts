import { useState, useCallback, useRef } from "react";

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const accumulatedRef = useRef("");
  const sessionFinalsRef = useRef("");

  const isSupported = typeof window !== "undefined" && 
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const startListening = useCallback(() => {
    if (!isSupported) return;

    sessionFinalsRef.current = "";

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

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

    // If recognition ends unexpectedly (e.g. silence timeout on some browsers),
    // save what we have and restart automatically
    recognition.onend = () => {
      // Snapshot session finals into accumulated before potential restart
      accumulatedRef.current += sessionFinalsRef.current;
      sessionFinalsRef.current = "";
      // Only restart if we're still supposed to be listening
      if (recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          setIsListening(false);
        }
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error === "aborted" || e.error === "no-speech") return;
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isSupported]);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null; // prevent auto-restart in onend
    recognition?.stop();
    setIsListening(false);
    // Finalize accumulated
    setTranscript((prev) => {
      accumulatedRef.current = prev;
      return prev;
    });
  }, []);

  const resetTranscript = useCallback(() => {
    accumulatedRef.current = "";
    setTranscript("");
  }, []);

  return { isListening, transcript, startListening, stopListening, resetTranscript, isSupported };
}
