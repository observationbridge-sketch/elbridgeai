import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Brain, BookOpen, PenTool, Mic, MicOff, Headphones, CheckCircle,
  ArrowRight, Loader2, Star, Volume2, Trophy, Flame, RefreshCw,
  Eye, EyeOff,
} from "lucide-react";
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
  acceptableKeywords?: string[];
  widaLevel: string;
  audioDescription?: string;
  theme?: string;
}

interface AnchorSentence {
  sentence: string;
  theme: string;
  category: string;
  keyWords: string[];
}

interface Part1Scores {
  listen: boolean;
  repeat: number; // word match count
  repeatTotal: number;
  write: number;
  writeTotal: number;
  record: number;
  recordTotal: number;
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

const TOTAL_STEPS = 13; // 5 Part 1 + 8 Part 2

// ─── Helper: flexible word matching ───
function compareWords(input: string, target: string): { matched: number; total: number } {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);
  const targetWords = normalize(target);
  const inputWords = normalize(input);
  let matched = 0;
  const used = new Set<number>();
  for (const tw of targetWords) {
    const idx = inputWords.findIndex((w, i) => !used.has(i) && (w === tw || levenshtein(w, tw) <= 2));
    if (idx !== -1) {
      matched++;
      used.add(idx);
    }
  }
  return { matched, total: targetWords.length };
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function getBadge(scores: Part1Scores): { icon: any; label: string; color: string } {
  const totalPossible = scores.repeatTotal + scores.writeTotal + scores.recordTotal;
  const totalEarned = scores.repeat + scores.write + scores.record;
  const pct = totalPossible > 0 ? totalEarned / totalPossible : 0;
  if (pct >= 0.9) return { icon: Trophy, label: "🏆 Language Champion!", color: "text-warning" };
  if (pct >= 0.7) return { icon: Flame, label: "🔥 Great Effort!", color: "text-accent" };
  return { icon: Star, label: "⭐ Keep Practicing!", color: "text-primary" };
}

const StudentSession = () => {
  const { sessionId, studentId } = useParams();
  const navigate = useNavigate();
  const tts = useTTS();
  const speech = useSpeechRecognition();

  // Session state
  const [loading, setLoading] = useState(true);
  const [globalStep, setGlobalStep] = useState(0); // 0-12 total
  const [sessionEnded, setSessionEnded] = useState(false);

  // Part 1 state
  const [anchor, setAnchor] = useState<AnchorSentence | null>(null);
  const [part1Step, setPart1Step] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [part1Feedback, setPart1Feedback] = useState<string | null>(null);
  const [part1ShowSentence, setPart1ShowSentence] = useState(true);
  const [part1Answer, setPart1Answer] = useState("");
  const [part1Submitted, setPart1Submitted] = useState(false);
  const [part1Scores, setPart1Scores] = useState<Part1Scores>({
    listen: false, repeat: 0, repeatTotal: 0, write: 0, writeTotal: 0, record: 0, recordTotal: 0,
  });

  // Part 2 state
  const [currentActivity, setCurrentActivity] = useState<Activity | null>(null);
  const [activityIndex, setActivityIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [part2Score, setPart2Score] = useState(0);

  const inPart1 = globalStep < 5;
  const inPart2 = globalStep >= 5 && globalStep < 13;

  // ─── Load anchor sentence on mount ───
  useEffect(() => {
    const loadAnchor = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("generate-anchor-sentence", {
          body: { grade: "3-5" },
        });
        if (error) throw error;
        setAnchor(data as AnchorSentence);
      } catch {
        setAnchor({
          sentence: "The brave explorer climbed the mountain to discover what was hiding behind the clouds.",
          theme: "Nature & animals",
          category: "Descriptive language models",
          keyWords: ["brave", "explorer", "climbed", "mountain", "discover", "hiding", "clouds"],
        });
      } finally {
        setLoading(false);
      }
    };
    loadAnchor();
  }, []);

  // Auto-play TTS for Step 1
  useEffect(() => {
    if (!loading && inPart1 && part1Step === 1 && anchor && tts.isSupported) {
      const timer = setTimeout(() => tts.speak(anchor.sentence), 600);
      return () => clearTimeout(timer);
    }
  }, [loading, inPart1, part1Step, anchor]);

  // Sync speech transcript
  useEffect(() => {
    if (speech.transcript) {
      if (inPart1) setPart1Answer(speech.transcript);
      else setAnswer(speech.transcript);
    }
  }, [speech.transcript]);

  // ─── Part 1 handlers ───
  const handlePart1Next = () => {
    tts.stop();
    speech.resetTranscript();
    setPart1Answer("");
    setPart1Submitted(false);
    setPart1Feedback(null);
    setPart1ShowSentence(true);

    if (part1Step < 5) {
      setPart1Step((s) => (s + 1) as 1 | 2 | 3 | 4 | 5);
      setGlobalStep((g) => g + 1);
    } else {
      // Move to Part 2
      setGlobalStep(5);
      fetchPart2Activity(0);
    }
  };

  const handleStep1Done = () => {
    setPart1Scores((s) => ({ ...s, listen: true }));
    // Save listening response
    saveResponse("listening", "Listened to anchor sentence", "heard", anchor?.sentence || "", true, "Entering");
    handlePart1Next();
  };

  const handleStep2Submit = () => {
    if (!anchor || !part1Answer.trim()) return;
    const { matched, total } = compareWords(part1Answer, anchor.sentence);
    setPart1Scores((s) => ({ ...s, repeat: matched, repeatTotal: total }));
    const pct = total > 0 ? matched / total : 0;
    const feedback = pct >= 0.8
      ? "Great job! You said it really well! 🌟"
      : pct >= 0.5
        ? `Nice try! You got ${matched} out of ${total} words. Here's the sentence again: "${anchor.sentence}"`
        : `Good effort! You got ${matched} out of ${total} words. Here's the sentence again: "${anchor.sentence}"`;
    setPart1Feedback(feedback);
    setPart1Submitted(true);
    saveResponse("speaking", `Repeat: ${anchor.sentence}`, part1Answer, anchor.sentence, pct >= 0.5, "Entering");
  };

  const handleStep3Submit = () => {
    if (!anchor || !part1Answer.trim()) return;
    const { matched, total } = compareWords(part1Answer, anchor.sentence);
    setPart1Scores((s) => ({ ...s, write: matched, writeTotal: total }));
    const pct = total > 0 ? matched / total : 0;
    setPart1ShowSentence(true); // reveal sentence for comparison
    const feedback = pct >= 0.8
      ? `Excellent writing! You remembered ${matched} out of ${total} words! ✍️🌟`
      : `Good try! You got ${matched} out of ${total} words. Compare your answer above. ✍️`;
    setPart1Feedback(feedback);
    setPart1Submitted(true);
    saveResponse("writing", `Write from memory: ${anchor.sentence}`, part1Answer, anchor.sentence, pct >= 0.5, "Entering");
  };

  const handleStep4Submit = () => {
    if (!anchor || !part1Answer.trim()) return;
    const { matched, total } = compareWords(part1Answer, anchor.sentence);
    setPart1Scores((s) => ({ ...s, record: matched, recordTotal: total }));
    const pct = total > 0 ? matched / total : 0;
    const feedback = pct >= 0.9
      ? `Perfect sentence! You used ${matched} out of ${total} words! 🎤🏆`
      : pct >= 0.7
        ? `You used ${matched} out of ${total} words — great effort! 🎤🌟`
        : `You used ${matched} out of ${total} words — keep practicing! 🎤💪`;
    setPart1Feedback(feedback);
    setPart1Submitted(true);
    saveResponse("speaking", `Record: ${anchor.sentence}`, part1Answer, anchor.sentence, pct >= 0.5, "Entering");
  };

  // ─── Part 2 handlers ───
  const fetchPart2Activity = useCallback(async (index: number) => {
    setLoading(true);
    setShowFeedback(false);
    setAnswer("");
    setSelectedOption(null);
    speech.resetTranscript();
    tts.stop();

    try {
      const { data, error } = await supabase.functions.invoke("generate-activity", {
        body: { domain: "reading", grade: "3-5", activityIndex: index, theme: anchor?.theme },
      });
      if (error) throw error;
      setCurrentActivity(data as Activity);
    } catch {
      setCurrentActivity(getFallbackActivity(["reading", "listening", "speaking", "writing"][index % 4] as Domain));
    } finally {
      setLoading(false);
    }
  }, [anchor]);

  // Auto-play TTS for listening activities in Part 2
  useEffect(() => {
    if (!loading && inPart2 && currentActivity?.domain === "listening" && tts.isSupported) {
      const textToRead = currentActivity.audioDescription || currentActivity.question;
      const timer = setTimeout(() => tts.speak(textToRead), 500);
      return () => clearTimeout(timer);
    }
  }, [loading, currentActivity, inPart2]);

  const submitPart2Answer = async () => {
    if (!currentActivity) return;
    const userAnswer = currentActivity.type === "multiple_choice" ? selectedOption : answer;
    if (!userAnswer) { toast.error("Please provide an answer!"); return; }

    const normalizeText = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const userNorm = normalizeText(userAnswer);
    let correct: boolean;

    if (currentActivity.type === "multiple_choice") {
      correct = userAnswer.toLowerCase().trim() === currentActivity.correctAnswer.toLowerCase().trim();
    } else {
      const keywords: string[] = currentActivity.acceptableKeywords || [];
      if (keywords.length > 0) {
        const matchCount = keywords.filter((kw) => userNorm.includes(kw.toLowerCase())).length;
        correct = matchCount >= Math.max(2, Math.ceil(keywords.length * 0.3));
      } else {
        const correctNorm = normalizeText(currentActivity.correctAnswer);
        const userWords = userNorm.split(/\s+/);
        const correctWords = correctNorm.split(/\s+/);
        const matchCount = userWords.filter((w) => correctWords.includes(w)).length;
        correct = matchCount >= Math.ceil(correctWords.length * 0.4);
      }
      if (!correct && userNorm.split(/\s+/).length >= 3) correct = true;
    }

    setIsCorrect(correct);
    setShowFeedback(true);
    if (correct) setPart2Score((s) => s + 1);
    tts.stop();

    saveResponse(
      currentActivity.domain,
      currentActivity.question,
      userAnswer,
      currentActivity.correctAnswer,
      correct,
      currentActivity.widaLevel
    );
  };

  const nextPart2Activity = () => {
    tts.stop();
    const nextIdx = activityIndex + 1;
    if (nextIdx >= 8) {
      setSessionEnded(true);
      return;
    }
    setActivityIndex(nextIdx);
    setGlobalStep(5 + nextIdx);
    fetchPart2Activity(nextIdx);
  };

  // ─── Save response helper ───
  const saveResponse = async (
    domain: string, question: string, studentAnswer: string,
    correctAnswer: string, isCorrect: boolean, widaLevel: string
  ) => {
    try {
      await supabase.from("student_responses").insert({
        session_id: sessionId,
        student_id: studentId,
        domain,
        question,
        student_answer: studentAnswer,
        correct_answer: correctAnswer,
        is_correct: isCorrect,
        wida_level: widaLevel,
      });
    } catch { /* non-blocking */ }
  };

  // ─── Session ended screen ───
  if (sessionEnded) {
    const totalCorrect = part2Score + (part1Scores.listen ? 1 : 0);
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md card-shadow text-center">
          <CardContent className="pt-8 pb-8 space-y-6">
            <Star className="h-16 w-16 text-warning mx-auto" />
            <h2 className="text-2xl font-bold text-foreground">Amazing Work! 🎉</h2>
            <p className="text-lg text-muted-foreground">You completed today's session!</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Language Builder</p>
                <p className="text-2xl font-bold text-primary">5/5</p>
                <p className="text-xs text-muted-foreground">steps completed</p>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Practice</p>
                <p className="text-2xl font-bold text-accent">{part2Score}/8</p>
                <p className="text-xs text-muted-foreground">correct answers</p>
              </div>
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

  // ─── Main render ───
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
              {inPart1 ? `Part 1 • Step ${part1Step}/5` : `Part 2 • ${activityIndex + 1}/8`}
            </span>
            <div className="w-32">
              <Progress value={((globalStep + 1) / TOTAL_STEPS) * 100} />
            </div>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-muted-foreground">
              {inPart1 ? "Preparing your Daily Language Builder..." : "Getting your next activity ready..."}
            </p>
          </div>
        ) : inPart1 && anchor ? (
          <Part1View
            step={part1Step}
            anchor={anchor}
            tts={tts}
            speech={speech}
            part1Answer={part1Answer}
            setPart1Answer={setPart1Answer}
            part1Submitted={part1Submitted}
            part1Feedback={part1Feedback}
            part1ShowSentence={part1ShowSentence}
            setPart1ShowSentence={setPart1ShowSentence}
            part1Scores={part1Scores}
            onStep1Done={handleStep1Done}
            onStep2Submit={handleStep2Submit}
            onStep3Submit={handleStep3Submit}
            onStep4Submit={handleStep4Submit}
            onNext={handlePart1Next}
          />
        ) : inPart2 && currentActivity ? (
          <Part2View
            activity={currentActivity}
            answer={answer}
            setAnswer={setAnswer}
            selectedOption={selectedOption}
            setSelectedOption={setSelectedOption}
            showFeedback={showFeedback}
            isCorrect={isCorrect}
            speech={speech}
            tts={tts}
            onSubmit={submitPart2Answer}
            onNext={nextPart2Activity}
          />
        ) : null}
      </main>
    </div>
  );
};

// ═══════════════════════════════════════════════
// Part 1 — Daily Language Builder
// ═══════════════════════════════════════════════
interface Part1Props {
  step: 1 | 2 | 3 | 4 | 5;
  anchor: AnchorSentence;
  tts: ReturnType<typeof useTTS>;
  speech: ReturnType<typeof useSpeechRecognition>;
  part1Answer: string;
  setPart1Answer: (v: string) => void;
  part1Submitted: boolean;
  part1Feedback: string | null;
  part1ShowSentence: boolean;
  setPart1ShowSentence: (v: boolean) => void;
  part1Scores: Part1Scores;
  onStep1Done: () => void;
  onStep2Submit: () => void;
  onStep3Submit: () => void;
  onStep4Submit: () => void;
  onNext: () => void;
}

function Part1View({
  step, anchor, tts, speech, part1Answer, setPart1Answer,
  part1Submitted, part1Feedback, part1ShowSentence, setPart1ShowSentence,
  part1Scores, onStep1Done, onStep2Submit, onStep3Submit, onStep4Submit, onNext,
}: Part1Props) {
  const stepTitles = [
    "", "Step 1: Listen 🎧", "Step 2: Repeat 🗣️", "Step 3: Write ✍️",
    "Step 4: Record 🎤", "Step 5: Your Results 🏆",
  ];

  return (
    <Card className="card-shadow border-border">
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-muted-foreground bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            Daily Language Builder
          </span>
        </div>
        <h3 className="text-lg font-bold text-foreground">{stepTitles[step]}</h3>
      </div>

      <CardContent className="pt-4 space-y-6">
        {/* ─── Step 1: Listen ─── */}
        {step === 1 && (
          <>
            <div className="bg-muted/50 rounded-lg p-6 border border-border text-center space-y-4">
              <Headphones className="h-10 w-10 text-warning mx-auto" />
              <p className="text-lg font-medium text-foreground leading-relaxed">
                {anchor.sentence}
              </p>
              {tts.isSupported && (
                <Button
                  variant="outline"
                  onClick={() => tts.speak(anchor.sentence)}
                  disabled={tts.isSpeaking}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${tts.isSpeaking ? "animate-spin" : ""}`} />
                  {tts.isSpeaking ? "Playing..." : "Replay"}
                </Button>
              )}
            </div>
            <Button variant="hero" className="w-full" size="lg" onClick={onStep1Done}>
              I heard it ✓ <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </>
        )}

        {/* ─── Step 2: Repeat ─── */}
        {step === 2 && (
          <>
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <p className="text-sm text-muted-foreground mb-1">Say this sentence out loud:</p>
              <p className="text-foreground font-medium">{anchor.sentence}</p>
            </div>
            <MicrophoneInput
              speech={speech}
              answer={part1Answer}
              setAnswer={setPart1Answer}
              disabled={part1Submitted}
            />
            {!part1Submitted ? (
              <Button variant="hero" className="w-full" size="lg" onClick={onStep2Submit} disabled={!part1Answer.trim()}>
                Check My Speaking
              </Button>
            ) : (
              <>
                <FeedbackBanner feedback={part1Feedback} positive={part1Scores.repeatTotal > 0 && part1Scores.repeat / part1Scores.repeatTotal >= 0.5} />
                <Button variant="hero" className="w-full" size="lg" onClick={onNext}>
                  Next Step <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </>
            )}
          </>
        )}

        {/* ─── Step 3: Write ─── */}
        {step === 3 && (
          <>
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Type the sentence from memory:</p>
                {part1Submitted && (
                  <button onClick={() => setPart1ShowSentence(!part1ShowSentence)} className="text-xs text-primary flex items-center gap-1">
                    {part1ShowSentence ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {part1ShowSentence ? "Hide" : "Show"} sentence
                  </button>
                )}
              </div>
              {(part1Submitted && part1ShowSentence) && (
                <p className="text-foreground font-medium">{anchor.sentence}</p>
              )}
              {!part1Submitted && (
                <p className="text-muted-foreground text-xs italic">The sentence is hidden — write from memory!</p>
              )}
            </div>
            <Input
              value={part1Answer}
              onChange={(e) => setPart1Answer(e.target.value)}
              placeholder="Type the sentence here..."
              className="h-12"
              disabled={part1Submitted}
            />
            {!part1Submitted ? (
              <Button variant="hero" className="w-full" size="lg" onClick={onStep3Submit} disabled={!part1Answer.trim()}>
                Check My Writing
              </Button>
            ) : (
              <>
                <FeedbackBanner feedback={part1Feedback} positive={part1Scores.writeTotal > 0 && part1Scores.write / part1Scores.writeTotal >= 0.5} />
                <Button variant="hero" className="w-full" size="lg" onClick={onNext}>
                  Next Step <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </>
            )}
          </>
        )}

        {/* ─── Step 4: Record ─── */}
        {step === 4 && (
          <>
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <p className="text-sm text-muted-foreground mb-1">Record yourself saying the full sentence — your best try!</p>
              <p className="text-foreground font-medium">{anchor.sentence}</p>
            </div>
            <MicrophoneInput
              speech={speech}
              answer={part1Answer}
              setAnswer={setPart1Answer}
              disabled={part1Submitted}
            />
            {!part1Submitted ? (
              <Button variant="hero" className="w-full" size="lg" onClick={onStep4Submit} disabled={!part1Answer.trim()}>
                Check My Recording
              </Button>
            ) : (
              <>
                <FeedbackBanner feedback={part1Feedback} positive={part1Scores.recordTotal > 0 && part1Scores.record / part1Scores.recordTotal >= 0.7} />
                <Button variant="hero" className="w-full" size="lg" onClick={onNext}>
                  Next Step <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </>
            )}
          </>
        )}

        {/* ─── Step 5: AI Feedback Summary ─── */}
        {step === 5 && (
          <Step5Summary anchor={anchor} scores={part1Scores} onContinue={onNext} />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Step 5 Summary Card ───
function Step5Summary({ anchor, scores, onContinue }: {
  anchor: AnchorSentence; scores: Part1Scores; onContinue: () => void;
}) {
  const badge = getBadge(scores);
  const BadgeIcon = badge.icon;

  const repeatPct = scores.repeatTotal > 0 ? Math.round((scores.repeat / scores.repeatTotal) * 100) : 0;
  const writePct = scores.writeTotal > 0 ? Math.round((scores.write / scores.writeTotal) * 100) : 0;
  const recordPct = scores.recordTotal > 0 ? Math.round((scores.record / scores.recordTotal) * 100) : 0;

  const strengths: string[] = [];
  const practice: string[] = [];

  if (repeatPct >= 70) strengths.push("Speaking clearly");
  else practice.push("Repeat sentences out loud more");

  if (writePct >= 70) strengths.push("Writing from memory");
  else practice.push("Practice writing sentences from memory");

  if (recordPct >= 80) strengths.push("Fluent recording");
  else practice.push("Record yourself speaking full sentences");

  if (strengths.length === 0) strengths.push("Completing all the steps — great effort!");

  return (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <BadgeIcon className={`h-16 w-16 mx-auto ${badge.color}`} />
        <h3 className="text-xl font-bold text-foreground">{badge.label}</h3>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted rounded-lg p-3 text-center">
          <Mic className="h-5 w-5 text-success mx-auto mb-1" />
          <p className="text-lg font-bold text-foreground">{repeatPct}%</p>
          <p className="text-xs text-muted-foreground">Repeat</p>
        </div>
        <div className="bg-muted rounded-lg p-3 text-center">
          <PenTool className="h-5 w-5 text-accent mx-auto mb-1" />
          <p className="text-lg font-bold text-foreground">{writePct}%</p>
          <p className="text-xs text-muted-foreground">Write</p>
        </div>
        <div className="bg-muted rounded-lg p-3 text-center">
          <Mic className="h-5 w-5 text-primary mx-auto mb-1" />
          <p className="text-lg font-bold text-foreground">{recordPct}%</p>
          <p className="text-xs text-muted-foreground">Record</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="bg-success/10 border border-success/20 rounded-lg p-3">
          <p className="text-sm font-medium text-success mb-1">✅ What you did well:</p>
          <ul className="text-sm text-foreground space-y-1">
            {strengths.map((s, i) => <li key={i}>• {s}</li>)}
          </ul>
        </div>
        {practice.length > 0 && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
            <p className="text-sm font-medium text-primary mb-1">📝 One thing to practice:</p>
            <p className="text-sm text-foreground">{practice[0]}</p>
          </div>
        )}
      </div>

      <div className="bg-muted/50 rounded-lg p-4 border border-border text-center">
        <p className="text-xs text-muted-foreground mb-1">Today's anchor sentence:</p>
        <p className="text-foreground font-bold">{anchor.sentence}</p>
      </div>

      <Button variant="hero" className="w-full" size="lg" onClick={onContinue}>
        Continue to Practice <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Part 2 — Free Domain Practice
// ═══════════════════════════════════════════════
interface Part2Props {
  activity: Activity;
  answer: string;
  setAnswer: (v: string) => void;
  selectedOption: string | null;
  setSelectedOption: (v: string | null) => void;
  showFeedback: boolean;
  isCorrect: boolean;
  speech: ReturnType<typeof useSpeechRecognition>;
  tts: ReturnType<typeof useTTS>;
  onSubmit: () => void;
  onNext: () => void;
}

function Part2View({
  activity, answer, setAnswer, selectedOption, setSelectedOption,
  showFeedback, isCorrect, speech, tts, onSubmit, onNext,
}: Part2Props) {
  const Icon = DOMAIN_ICONS[activity.domain];
  return (
    <Card className="card-shadow border-border">
      <div className="px-6 pt-6 flex items-center gap-2">
        <span className="text-xs font-medium bg-accent/10 text-accent px-2 py-0.5 rounded-full">
          Free Practice
        </span>
        <Icon className={`h-5 w-5 ${DOMAIN_COLORS[activity.domain]}`} />
        <span className={`text-sm font-medium ${DOMAIN_COLORS[activity.domain]}`}>
          {DOMAIN_LABELS[activity.domain]}
        </span>
        <span className="text-xs text-muted-foreground ml-auto bg-muted px-2 py-0.5 rounded-full">
          {activity.widaLevel}
        </span>
      </div>

      <CardContent className="pt-4 space-y-6">
        {/* Passage */}
        {activity.passage && (
          <div className="bg-muted/50 rounded-lg p-4 border border-border">
            <p className="text-foreground leading-relaxed">{activity.passage}</p>
          </div>
        )}

        {/* Listening audio area */}
        {activity.domain === "listening" && activity.audioDescription && (
          <div className="bg-secondary/50 rounded-lg p-4 border border-border space-y-3">
            <div className="flex items-center gap-3">
              <Headphones className="h-6 w-6 text-warning flex-shrink-0" />
              <p className="text-foreground text-sm italic">{activity.audioDescription}</p>
            </div>
            {tts.isSupported && (
              <Button
                variant="outline" size="sm"
                onClick={() => tts.speak(activity.audioDescription || activity.question)}
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
        <h3 className="text-lg font-medium text-foreground">{activity.question}</h3>

        {/* Answer area */}
        {!showFeedback && (
          <>
            {activity.type === "multiple_choice" && activity.options ? (
              <div className="space-y-2">
                {activity.options.map((opt) => (
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
            ) : activity.type === "speaking_prompt" ? (
              <MicrophoneInput speech={speech} answer={answer} setAnswer={setAnswer} />
            ) : (
              <Input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer..."
                className="h-12"
              />
            )}
            <Button variant="hero" className="w-full" size="lg" onClick={onSubmit} disabled={!selectedOption && !answer}>
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
                  {isCorrect ? "Great job! 🌟" : "Good try! Keep learning! 💪"}
                </p>
                {!isCorrect && (
                  <p className="text-sm text-muted-foreground mt-1">
                    The correct answer was: <strong>{activity.correctAnswer}</strong>
                  </p>
                )}
              </div>
            </div>
            <Button variant="hero" className="w-full" size="lg" onClick={onNext}>
              Next Activity <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════
// Shared Components
// ═══════════════════════════════════════════════
function MicrophoneInput({ speech, answer, setAnswer, disabled }: {
  speech: ReturnType<typeof useSpeechRecognition>;
  answer: string;
  setAnswer: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      {speech.isSupported ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground text-center">
            Tap the mic to start. Tap again when you are done speaking.
          </p>
          <button
            onClick={speech.isListening ? speech.stopListening : speech.startListening}
            disabled={disabled}
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-lg ${
              disabled ? "bg-muted text-muted-foreground" :
              speech.isListening
                ? "bg-destructive text-destructive-foreground animate-pulse scale-110"
                : "bg-success text-success-foreground hover:scale-105"
            }`}
          >
            {speech.isListening ? <MicOff className="h-10 w-10" /> : <Mic className="h-10 w-10" />}
          </button>
          <p className="text-xs text-muted-foreground">
            {speech.isListening ? "🔴 Recording... tap the mic to stop" : "Ready to listen"}
          </p>
          {answer && (
            <div className="w-full bg-muted/50 rounded-lg p-3 border border-border">
              <p className="text-xs text-muted-foreground mb-1">What I heard:</p>
              <p className="text-foreground">{answer}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 text-center">
          <p className="text-sm text-muted-foreground">
            🎤 Speech recognition is not available. Please type your answer instead.
          </p>
        </div>
      )}
      <Input
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder={speech.isSupported ? "Or type your answer here..." : "Type your spoken answer here..."}
        className="h-12"
        disabled={disabled}
      />
    </div>
  );
}

function FeedbackBanner({ feedback, positive }: { feedback: string | null; positive: boolean }) {
  if (!feedback) return null;
  return (
    <div className={`rounded-lg p-4 flex items-start gap-3 ${
      positive ? "bg-success/10 border border-success/20" : "bg-primary/10 border border-primary/20"
    }`}>
      <CheckCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${positive ? "text-success" : "text-primary"}`} />
      <p className={`font-medium text-sm ${positive ? "text-success" : "text-primary"}`}>{feedback}</p>
    </div>
  );
}

// ─── Fallback activities ───
function getFallbackActivity(domain: Domain): Activity {
  const activities: Record<Domain, Activity> = {
    reading: {
      domain: "reading", type: "multiple_choice",
      passage: "The butterfly landed on the bright red flower. It moved its wings slowly. The butterfly was looking for sweet nectar.",
      question: "What was the butterfly looking for?",
      options: ["Water", "Nectar", "Seeds", "Leaves"],
      correctAnswer: "Nectar", widaLevel: "Developing",
    },
    writing: {
      domain: "writing", type: "short_answer",
      question: "A baby bird just learned to fly! Write one sentence about how the bird feels. Start with: The bird feels...",
      correctAnswer: "The bird feels happy and free.",
      acceptableKeywords: ["bird", "feels", "happy", "free", "excited", "fly", "sky"],
      widaLevel: "Entering",
    },
    speaking: {
      domain: "speaking", type: "speaking_prompt",
      question: "Imagine you found a treasure chest in your backyard. What is inside? Tell me about it!",
      correctAnswer: "Inside the treasure chest I found gold coins and a magic map.",
      acceptableKeywords: ["treasure", "found", "inside", "gold", "magic", "special", "coins"],
      widaLevel: "Developing",
    },
    listening: {
      domain: "listening", type: "multiple_choice",
      audioDescription: "Listen to this story: Sam went to the park with his dog Rex. Rex loved to chase the ball. Sam threw the ball far and Rex ran very fast to catch it.",
      question: "What did Rex love to do at the park?",
      options: ["Swim", "Chase the ball", "Sleep", "Dig holes"],
      correctAnswer: "Chase the ball", widaLevel: "Entering",
    },
  };
  return activities[domain];
}

export default StudentSession;
