import { useState, useCallback, useRef } from "react";

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const accumulatedRef = useRef("");

  const isSupported = typeof window !== "undefined" && 
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const startListening = useCallback(() => {
    if (!isSupported) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let finalPart = "";
      let interimPart = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalPart += result[0].transcript;
        } else {
          interimPart += result[0].transcript;
        }
      }
      // Accumulated finals from this recognition session + any interim
      const current = finalPart + interimPart;
      setTranscript(accumulatedRef.current + current);
    };

    // If recognition ends unexpectedly (e.g. silence timeout on some browsers),
    // save what we have and restart automatically
    recognition.onend = () => {
      // Snapshot the current transcript into accumulated
      setTranscript((prev) => {
        accumulatedRef.current = prev;
        return prev;
      });
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
