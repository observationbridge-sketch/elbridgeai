import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Brain, BookOpen, PenTool, Mic, MicOff, Headphones, CheckCircle, ArrowRight, Loader2, Star, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTTS } from "@/hooks/use-tts";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

type Domain = "reading" | "writing" | "speaking" | "listening";

interface Activity {
  domain: Domain;
  type: "multiple_choice" | "short_answer" | "speaking_prompt" | "listening_prompt";
  question: string;
  passage?: string;
  options?: string[];
  correctAnswer: string;
  widaLevel: string;
  audioDescription?: string;
}

const DOMAIN_ICONS: Record<Domain, any> = {
  reading: BookOpen,
  writing: PenTool,
  speaking: Mic,
  listening: Headphones,
};

const DOMAIN_COLORS: Record<Domain, string> = {
  reading: "text-primary",
  writing: "text-accent",
  speaking: "text-success",
  listening: "text-warning",
};

const DOMAIN_LABELS: Record<Domain, string> = {
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
  listening: "Listening",
};

const StudentSession = () => {
  const { sessionId, studentId } = useParams();
  const navigate = useNavigate();
  const [currentActivity, setCurrentActivity] = useState<Activity | null>(null);
  const [activityIndex, setActivityIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(0);
  const [totalActivities] = useState(12);
  const [sessionEnded, setSessionEnded] = useState(false);

  const tts = useTTS();
  const speech = useSpeechRecognition();

  // Domain rotation: Reading → Listening → Speaking → Writing (matches edge function)
  const domainOrder: Domain[] = ["reading", "listening", "speaking", "writing"];

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    setShowFeedback(false);
    setAnswer("");
    setSelectedOption(null);
    speech.resetTranscript();
    tts.stop();

    const domain = domainOrder[activityIndex % 4];

    try {
      const { data, error } = await supabase.functions.invoke("generate-activity", {
        body: { domain, grade: "3-5", activityIndex },
      });

      if (error) throw error;
      setCurrentActivity(data as Activity);
    } catch {
      setCurrentActivity(getFallbackActivity(domain));
    } finally {
      setLoading(false);
    }
  }, [activityIndex]);

  // Auto-play TTS for listening activities
  useEffect(() => {
    if (!loading && currentActivity?.domain === "listening" && tts.isSupported) {
      const textToRead = currentActivity.audioDescription || currentActivity.question;
      // Small delay so the UI renders first
      const timer = setTimeout(() => tts.speak(textToRead), 500);
      return () => clearTimeout(timer);
    }
  }, [loading, currentActivity]);

  useEffect(() => {
    if (activityIndex < totalActivities) {
      fetchActivity();
    } else {
      setSessionEnded(true);
    }
  }, [activityIndex, fetchActivity, totalActivities]);

  // Sync speech transcript to answer
  useEffect(() => {
    if (speech.transcript) {
      setAnswer(speech.transcript);
    }
  }, [speech.transcript]);

  const submitAnswer = async () => {
    if (!currentActivity) return;

    const userAnswer = currentActivity.type === "multiple_choice" ? selectedOption : answer;
    if (!userAnswer) {
      toast.error("Please provide an answer!");
      return;
    }

    // Flexible grading based on activity type
    let correct: boolean;
    const normalizeText = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const userNorm = normalizeText(userAnswer);

    if (currentActivity.type === "multiple_choice") {
      correct = userAnswer.toLowerCase().trim() === currentActivity.correctAnswer.toLowerCase().trim();
    } else {
      // For speaking & writing: check against acceptableKeywords or flexible word matching
      const keywords: string[] = (currentActivity as any).acceptableKeywords || [];
      if (keywords.length > 0) {
        const matchCount = keywords.filter(kw => userNorm.includes(kw.toLowerCase())).length;
        // Accept if at least 2 keywords match, or 30% of keywords
        correct = matchCount >= Math.max(2, Math.ceil(keywords.length * 0.3));
      } else {
        // Fallback: compare against correctAnswer with word overlap
        const correctNorm = normalizeText(currentActivity.correctAnswer);
        const userWords = userNorm.split(/\s+/);
        const correctWords = correctNorm.split(/\s+/);
        const matchCount = userWords.filter(w => correctWords.includes(w)).length;
        correct = matchCount >= Math.ceil(correctWords.length * 0.4);
      }
      // For open-ended: if student wrote at least 3 words, give credit (encourage effort)
      if (!correct && userNorm.split(/\s+/).length >= 3) {
        correct = true;
      }
    }

    setIsCorrect(correct);
    setShowFeedback(true);
    if (correct) setScore((s) => s + 1);

    // Stop any audio
    tts.stop();

    try {
      await supabase.from("student_responses").insert({
        session_id: sessionId,
        student_id: studentId,
        domain: currentActivity.domain,
        question: currentActivity.question,
        student_answer: userAnswer,
        correct_answer: currentActivity.correctAnswer,
        is_correct: correct,
        wida_level: currentActivity.widaLevel,
      });
    } catch {
      // Non-blocking
    }
  };

  const nextActivity = () => {
    tts.stop();
    setActivityIndex((i) => i + 1);
  };

  if (sessionEnded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md card-shadow text-center">
          <CardContent className="pt-8 pb-8 space-y-6">
            <Star className="h-16 w-16 text-warning mx-auto" />
            <h2 className="text-2xl font-bold text-foreground">Great Job! 🎉</h2>
            <p className="text-lg text-muted-foreground">
              You completed {totalActivities} activities!
            </p>
            <div className="bg-muted rounded-lg p-4">
              <p className="text-3xl font-bold text-primary">{score}/{totalActivities}</p>
              <p className="text-sm text-muted-foreground">correct answers</p>
            </div>
            <p className="text-muted-foreground">You practiced Reading, Writing, Speaking, and Listening today!</p>
            <Button variant="hero" onClick={() => navigate("/")} className="w-full">
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            <span className="font-bold text-foreground">ElbridgeAI</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {activityIndex + 1} / {totalActivities}
            </span>
            <div className="w-32">
              <Progress value={((activityIndex + 1) / totalActivities) * 100} />
            </div>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-muted-foreground">Getting your next activity ready...</p>
          </div>
        ) : currentActivity ? (
          <Card className="card-shadow border-border">
            {/* Domain badge */}
            <div className="px-6 pt-6 flex items-center gap-2">
              {(() => {
                const Icon = DOMAIN_ICONS[currentActivity.domain];
                return <Icon className={`h-5 w-5 ${DOMAIN_COLORS[currentActivity.domain]}`} />;
              })()}
              <span className={`text-sm font-medium ${DOMAIN_COLORS[currentActivity.domain]}`}>
                {DOMAIN_LABELS[currentActivity.domain]}
              </span>
              {currentActivity.domain === "listening" && (
                <Volume2 className="h-4 w-4 text-warning ml-1" />
              )}
              {currentActivity.domain === "speaking" && (
                <Mic className="h-4 w-4 text-success ml-1" />
              )}
              <span className="text-xs text-muted-foreground ml-auto bg-muted px-2 py-0.5 rounded-full">
                {currentActivity.widaLevel}
              </span>
            </div>

            <CardContent className="pt-4 space-y-6">
              {/* Passage */}
              {currentActivity.passage && (
                <div className="bg-muted/50 rounded-lg p-4 border border-border">
                  <p className="text-foreground leading-relaxed">{currentActivity.passage}</p>
                </div>
              )}

              {/* Listening: audio player area */}
              {currentActivity.domain === "listening" && currentActivity.audioDescription && (
                <div className="bg-secondary/50 rounded-lg p-4 border border-border space-y-3">
                  <div className="flex items-center gap-3">
                    <Headphones className="h-6 w-6 text-warning flex-shrink-0" />
                    <p className="text-foreground text-sm italic">{currentActivity.audioDescription}</p>
                  </div>
                  {tts.isSupported && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => tts.speak(currentActivity.audioDescription || currentActivity.question)}
                      disabled={tts.isSpeaking}
                      className="gap-2"
                    >
                      <Volume2 className={`h-4 w-4 ${tts.isSpeaking ? "animate-pulse text-warning" : ""}`} />
                      {tts.isSpeaking ? "Playing..." : "Replay Audio"}
                    </Button>
                  )}
                </div>
              )}

              {/* Question */}
              <h3 className="text-lg font-medium text-foreground">{currentActivity.question}</h3>

              {/* Answer area */}
              {!showFeedback && (
                <>
                  {currentActivity.type === "multiple_choice" && currentActivity.options ? (
                    <div className="space-y-2">
                      {currentActivity.options.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setSelectedOption(opt)}
                          className={`w-full text-left p-3 rounded-lg border transition-all ${
                            selectedOption === opt
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <span className="text-foreground">{opt}</span>
                        </button>
                      ))}
                    </div>
                  ) : currentActivity.type === "speaking_prompt" ? (
                    <div className="space-y-4">
                      {/* Microphone button */}
                      {speech.isSupported ? (
                        <div className="flex flex-col items-center gap-3">
                          <p className="text-sm text-muted-foreground text-center">
                            Tap the mic to start. Tap again when you are done speaking.
                          </p>
                          <button
                            onClick={speech.isListening ? speech.stopListening : speech.startListening}
                            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-lg ${
                              speech.isListening
                                ? "bg-destructive text-destructive-foreground animate-pulse scale-110"
                                : "bg-success text-success-foreground hover:scale-105"
                            }`}
                          >
                            {speech.isListening ? (
                              <MicOff className="h-10 w-10" />
                            ) : (
                              <Mic className="h-10 w-10" />
                            )}
                          </button>
                          <p className="text-xs text-muted-foreground">
                            {speech.isListening
                              ? "🔴 Recording... tap the mic to stop"
                              : "Ready to listen"}
                          </p>
                          {answer && (
                            <div className="w-full bg-muted/50 rounded-lg p-3 border border-border">
                              <p className="text-xs text-muted-foreground mb-1">What I heard:</p>
                              <p className="text-foreground">{answer}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 text-center">
                            <p className="text-sm text-muted-foreground">
                              🎤 Speech recognition is not available in your browser. Please type your answer instead.
                            </p>
                          </div>
                        </div>
                      )}
                      {/* Always show text input as fallback or for editing */}
                      <Input
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder={speech.isSupported ? "Or type your answer here..." : "Type your spoken answer here..."}
                        className="h-12"
                      />
                    </div>
                  ) : (
                    <Input
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Type your answer..."
                      className="h-12"
                    />
                  )}

                  <Button
                    variant="hero"
                    className="w-full"
                    size="lg"
                    onClick={submitAnswer}
                    disabled={!selectedOption && !answer}
                  >
                    Submit Answer
                  </Button>
                </>
              )}

              {/* Feedback */}
              {showFeedback && (
                <div className="space-y-4">
                  <div className={`rounded-lg p-4 flex items-start gap-3 ${
                    isCorrect ? "bg-success/10 border border-success/20" : "bg-destructive/10 border border-destructive/20"
                  }`}>
                    <CheckCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${isCorrect ? "text-success" : "text-destructive"}`} />
                    <div>
                      <p className={`font-medium ${isCorrect ? "text-success" : "text-destructive"}`}>
                        {isCorrect
                          ? currentActivity.type === "speaking_prompt"
                            ? "Nice speaking! You said it well! 🎤🌟"
                            : "Great job! 🌟"
                          : currentActivity.type === "speaking_prompt"
                            ? "Good effort! Try saying it again next time! 💪🎤"
                            : "Good try! Keep learning! 💪"
                        }
                      </p>
                      {!isCorrect && (
                        <p className="text-sm text-muted-foreground mt-1">
                          The correct answer was: <strong>{currentActivity.correctAnswer}</strong>
                        </p>
                      )}
                    </div>
                  </div>
                  <Button variant="hero" className="w-full" size="lg" onClick={nextActivity}>
                    Next Activity <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
};

function getFallbackActivity(domain: Domain): Activity {
  const activities: Record<Domain, Activity> = {
    reading: {
      domain: "reading",
      type: "multiple_choice",
      passage: "The butterfly landed on the bright red flower. It moved its wings slowly up and down. The butterfly was looking for sweet nectar to drink.",
      question: "What was the butterfly looking for?",
      options: ["Water", "Nectar", "Seeds", "Leaves"],
      correctAnswer: "Nectar",
      widaLevel: "Developing",
    },
    writing: {
      domain: "writing",
      type: "short_answer",
      question: "Write a sentence about your favorite animal. Use at least one describing word (adjective).",
      correctAnswer: "any descriptive sentence",
      widaLevel: "Developing",
    },
    speaking: {
      domain: "speaking",
      type: "speaking_prompt",
      question: "Say this sentence out loud: 'The cat sat on the mat and looked at the bird.'",
      correctAnswer: "The cat sat on the mat and looked at the bird.",
      widaLevel: "Emerging",
    },
    listening: {
      domain: "listening",
      type: "multiple_choice",
      audioDescription: "🔊 Listen: 'The teacher told the students to open their books to page 15 and read the first paragraph quietly.'",
      question: "What did the teacher ask the students to do first?",
      options: ["Write a story", "Open their books", "Go outside", "Draw a picture"],
      correctAnswer: "Open their books",
      widaLevel: "Developing",
    },
  };
  return activities[domain];
}

export default StudentSession;
