import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Brain, BookOpen, PenTool, Mic, MicOff, Headphones, CheckCircle,
  ArrowRight, Loader2, Star, Volume2, Trophy, Flame, RefreshCw,
  Eye, EyeOff, Target, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTTS } from "@/hooks/use-tts";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

type Domain = "reading" | "writing" | "speaking" | "listening";
type Strategy = "sentence_frames" | "sentence_expansion" | "quick_writes";

interface AnchorSentence {
  sentence: string;
  theme: string;
  category: string;
  keyWords: string[];
}

interface Part1Scores {
  listen: boolean;
  repeat: number;
  repeatTotal: number;
  write: number;
  writeTotal: number;
  record: number;
  recordTotal: number;
}

interface Part2Activity {
  type: string;
  question: string;
  passage?: string;
  sentenceFrame?: string;
  baseSentence?: string;
  expansionHint?: string;
  sentenceStarter?: string | null;
  wordBank?: string[] | null;
  modelAnswer: string;
  acceptableKeywords: string[];
  difficulty: number;
  theme: string;
  strategy: Strategy;
  weakestDomain: string;
  strategyReason: string;
}

const STRATEGY_LABELS: Record<Strategy, { label: string; icon: any; color: string; targetDomain: string }> = {
  sentence_frames: { label: "Sentence Frames", icon: BookOpen, color: "text-primary", targetDomain: "Reading & Listening" },
  sentence_expansion: { label: "Sentence Expansion", icon: Mic, color: "text-success", targetDomain: "Speaking" },
  quick_writes: { label: "Quick Writes", icon: PenTool, color: "text-accent", targetDomain: "Writing" },
};

const TOTAL_STEPS = 8; // 5 Part 1 + 3 Part 2

// ─── Helpers ───
function compareWords(input: string, target: string): { matched: number; total: number } {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);
  const targetWords = normalize(target);
  const inputWords = normalize(input);
  let matched = 0;
  const used = new Set<number>();
  for (const tw of targetWords) {
    const idx = inputWords.findIndex((w, i) => !used.has(i) && (w === tw || levenshtein(w, tw) <= 2));
    if (idx !== -1) { matched++; used.add(idx); }
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

function flexibleGrade(input: string, keywords: string[]): boolean {
  const norm = input.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (keywords.length > 0) {
    const matchCount = keywords.filter((kw) => norm.includes(kw.toLowerCase())).length;
    if (matchCount >= Math.max(2, Math.ceil(keywords.length * 0.3))) return true;
  }
  // Effort-based: 3+ words is always credit
  if (norm.split(/\s+/).length >= 3) return true;
  return false;
}

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════
const StudentSession = () => {
  const { sessionId, studentId } = useParams();
  const navigate = useNavigate();
  const tts = useTTS();
  const speech = useSpeechRecognition();

  // Session state
  const [loading, setLoading] = useState(true);
  const [globalStep, setGlobalStep] = useState(0);
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
  const [part2Activity, setPart2Activity] = useState<Part2Activity | null>(null);
  const [part2Index, setPart2Index] = useState(0);
  const [part2Answer, setPart2Answer] = useState("");
  const [part2Submitted, setPart2Submitted] = useState(false);
  const [part2Feedback, setPart2Feedback] = useState<string | null>(null);
  const [part2IsCorrect, setPart2IsCorrect] = useState(false);
  const [part2Score, setPart2Score] = useState(0);
  const [part2Strategy, setPart2Strategy] = useState<Strategy | null>(null);
  const [part2StrategyReason, setPart2StrategyReason] = useState("");
  const [domainScores, setDomainScores] = useState<Record<string, number> | null>(null);

  const inPart1 = globalStep < 5;
  const inPart2 = globalStep >= 5 && globalStep < 8;

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

    // Also load student history for adaptive Part 2
    const loadHistory = async () => {
      if (!studentId) return;
      try {
        // Look up this student's name to find historical data
        const { data: studentData } = await supabase
          .from("session_students")
          .select("student_name")
          .eq("id", studentId)
          .single();

        if (studentData?.student_name) {
          // Find all student IDs with same name
          const { data: allStudents } = await supabase
            .from("session_students")
            .select("id")
            .eq("student_name", studentData.student_name);

          if (allStudents && allStudents.length > 0) {
            const studentIds = allStudents.map((s) => s.id);
            const { data: responses } = await supabase
              .from("student_responses")
              .select("domain, is_correct")
              .in("student_id", studentIds);

            if (responses && responses.length > 0) {
              const scores: Record<string, { correct: number; total: number }> = {};
              for (const r of responses) {
                if (!scores[r.domain]) scores[r.domain] = { correct: 0, total: 0 };
                scores[r.domain].total++;
                if (r.is_correct) scores[r.domain].correct++;
              }
              const pctScores: Record<string, number> = {};
              for (const [domain, data] of Object.entries(scores)) {
                pctScores[domain] = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
              }
              setDomainScores(pctScores);
              return;
            }
          }
        }
      } catch { /* use default */ }
      setDomainScores(null); // No history — will default to sentence_frames
    };

    loadAnchor();
    loadHistory();
  }, [studentId]);

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
      else setPart2Answer(speech.transcript);
    }
  }, [speech.transcript, inPart1]);

  // ─── Save response helper ───
  const saveResponse = async (
    domain: string, question: string, studentAnswer: string,
    correctAnswer: string, isCorrect: boolean, widaLevel: string,
    sessionPart: string, strategy?: string
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
        session_part: sessionPart,
        strategy: strategy || null,
      });
    } catch { /* non-blocking */ }
  };

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
    saveResponse("listening", "Listened to anchor sentence", "heard", anchor?.sentence || "", true, "Entering", "part1");
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
    saveResponse("speaking", `Repeat: ${anchor.sentence}`, part1Answer, anchor.sentence, pct >= 0.5, "Entering", "part1");
  };

  const handleStep3Submit = () => {
    if (!anchor || !part1Answer.trim()) return;
    const { matched, total } = compareWords(part1Answer, anchor.sentence);
    setPart1Scores((s) => ({ ...s, write: matched, writeTotal: total }));
    const pct = total > 0 ? matched / total : 0;
    setPart1ShowSentence(true);
    const feedback = pct >= 0.8
      ? `Excellent writing! You remembered ${matched} out of ${total} words! ✍️🌟`
      : `Good try! You got ${matched} out of ${total} words. Compare your answer above. ✍️`;
    setPart1Feedback(feedback);
    setPart1Submitted(true);
    saveResponse("writing", `Write from memory: ${anchor.sentence}`, part1Answer, anchor.sentence, pct >= 0.5, "Entering", "part1");
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
    saveResponse("speaking", `Record: ${anchor.sentence}`, part1Answer, anchor.sentence, pct >= 0.5, "Entering", "part1");
  };

  // ─── Part 2 handlers ───
  const fetchPart2Activity = useCallback(async (index: number) => {
    setLoading(true);
    setPart2Submitted(false);
    setPart2Feedback(null);
    setPart2Answer("");
    speech.resetTranscript();
    tts.stop();

    try {
      const { data, error } = await supabase.functions.invoke("generate-part2", {
        body: {
          grade: "3-5",
          theme: anchor?.theme,
          domainScores,
          questionIndex: index,
        },
      });
      if (error) throw error;
      const activity = data as Part2Activity;
      setPart2Activity(activity);
      setPart2Strategy(activity.strategy);
      setPart2StrategyReason(activity.strategyReason);
    } catch {
      toast.error("Failed to load activity. Using backup.");
      setPart2Activity({
        type: "sentence_frame",
        question: "Complete this sentence: The forest was ___ because ___.",
        sentenceFrame: "The forest was ___ because ___.",
        modelAnswer: "The forest was quiet because all the animals were sleeping.",
        acceptableKeywords: ["forest", "quiet", "animals", "sleeping", "dark", "peaceful"],
        difficulty: index + 1,
        theme: anchor?.theme || "Nature",
        strategy: "sentence_frames",
        weakestDomain: "none",
        strategyReason: "Default strategy",
      });
    } finally {
      setLoading(false);
    }
  }, [anchor, domainScores]);

  const submitPart2 = () => {
    if (!part2Activity || !part2Answer.trim()) {
      toast.error("Please provide an answer!");
      return;
    }

    const correct = flexibleGrade(part2Answer, part2Activity.acceptableKeywords || []);
    setPart2IsCorrect(correct);
    if (correct) setPart2Score((s) => s + 1);

    // Generate encouraging feedback
    let feedback: string;
    if (correct) {
      const msgs = [
        "Excellent work! 🌟",
        "Great job — you nailed it! ✨",
        "Wonderful response! Keep it up! 🎉",
      ];
      feedback = msgs[part2Index % msgs.length];
    } else {
      feedback = "Good effort! Here's a model answer to compare:";
    }
    setPart2Feedback(feedback);
    setPart2Submitted(true);
    tts.stop();

    // Determine domain for saving
    const domainMap: Record<string, string> = {
      sentence_frames: "reading",
      sentence_expansion: "speaking",
      quick_writes: "writing",
    };
    const domain = domainMap[part2Activity.strategy] || "reading";

    saveResponse(
      domain,
      part2Activity.question,
      part2Answer,
      part2Activity.modelAnswer,
      correct,
      part2Activity.difficulty <= 1 ? "Entering" : part2Activity.difficulty <= 2 ? "Developing" : "Expanding",
      "part2",
      part2Activity.strategy
    );
  };

  const nextPart2 = () => {
    tts.stop();
    const nextIdx = part2Index + 1;
    if (nextIdx >= 3) {
      setSessionEnded(true);
      return;
    }
    setPart2Index(nextIdx);
    setGlobalStep(5 + nextIdx);
    fetchPart2Activity(nextIdx);
  };

  // ─── Session ended screen ───
  if (sessionEnded) {
    const strategyMeta = part2Strategy ? STRATEGY_LABELS[part2Strategy] : null;
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
                <p className="text-2xl font-bold text-accent">{part2Score}/3</p>
                <p className="text-xs text-muted-foreground">correct answers</p>
              </div>
            </div>

            {strategyMeta && (
              <div className="bg-muted/50 rounded-lg p-4 border border-border text-left space-y-2">
                <div className="flex items-center gap-2">
                  <Target className={`h-4 w-4 ${strategyMeta.color}`} />
                  <span className="text-sm font-medium text-foreground">
                    Strategy: {strategyMeta.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{part2StrategyReason}</p>
              </div>
            )}

            {/* Growth tip */}
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-left">
              <p className="text-sm font-medium text-primary mb-1">💡 Growth Tip:</p>
              <p className="text-sm text-foreground">
                {part2Score >= 3
                  ? "You're doing amazing! Try reading a short book or story tonight to keep building your skills."
                  : part2Score >= 2
                    ? "Great progress! Practice writing 2-3 sentences about your day before bed."
                    : "Every practice session makes you stronger! Try saying new English words out loud when you hear them."}
              </p>
            </div>

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
              {inPart1 ? `Part 1 • Step ${part1Step}/5` : `Part 2 • ${part2Index + 1}/3`}
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
        ) : inPart2 && part2Activity ? (
          <Part2StrategyView
            activity={part2Activity}
            index={part2Index}
            answer={part2Answer}
            setAnswer={setPart2Answer}
            submitted={part2Submitted}
            feedback={part2Feedback}
            isCorrect={part2IsCorrect}
            speech={speech}
            tts={tts}
            onSubmit={submitPart2}
            onNext={nextPart2}
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
          <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            Daily Language Builder
          </span>
        </div>
        <h3 className="text-lg font-bold text-foreground">{stepTitles[step]}</h3>
      </div>

      <CardContent className="pt-4 space-y-6">
        {step === 1 && (
          <>
            <div className="bg-muted/50 rounded-lg p-6 border border-border text-center space-y-4">
              <Headphones className="h-10 w-10 text-warning mx-auto" />
              <p className="text-lg font-medium text-foreground leading-relaxed">{anchor.sentence}</p>
              {tts.isSupported && (
                <Button variant="outline" onClick={() => tts.speak(anchor.sentence)} disabled={tts.isSpeaking} className="gap-2">
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

        {step === 2 && (
          <>
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <p className="text-sm text-muted-foreground mb-1">Say this sentence out loud:</p>
              <p className="text-foreground font-medium">{anchor.sentence}</p>
            </div>
            <MicrophoneInput speech={speech} answer={part1Answer} setAnswer={setPart1Answer} disabled={part1Submitted} />
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
              {part1Submitted && part1ShowSentence && (
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

        {step === 4 && (
          <>
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <p className="text-sm text-muted-foreground mb-1">Record yourself saying the full sentence — your best try!</p>
              <p className="text-foreground font-medium">{anchor.sentence}</p>
            </div>
            <MicrophoneInput speech={speech} answer={part1Answer} setAnswer={setPart1Answer} disabled={part1Submitted} />
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

        {step === 5 && <Step5Summary anchor={anchor} scores={part1Scores} onContinue={onNext} />}
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
  if (repeatPct >= 70) strengths.push("Speaking clearly"); else practice.push("Repeat sentences out loud more");
  if (writePct >= 70) strengths.push("Writing from memory"); else practice.push("Practice writing sentences from memory");
  if (recordPct >= 80) strengths.push("Fluent recording"); else practice.push("Record yourself speaking full sentences");
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
// Part 2 — Strategy-Based Practice
// ═══════════════════════════════════════════════
interface Part2Props {
  activity: Part2Activity;
  index: number;
  answer: string;
  setAnswer: (v: string) => void;
  submitted: boolean;
  feedback: string | null;
  isCorrect: boolean;
  speech: ReturnType<typeof useSpeechRecognition>;
  tts: ReturnType<typeof useTTS>;
  onSubmit: () => void;
  onNext: () => void;
}

function Part2StrategyView({
  activity, index, answer, setAnswer, submitted, feedback, isCorrect,
  speech, tts, onSubmit, onNext,
}: Part2Props) {
  const strategyMeta = STRATEGY_LABELS[activity.strategy];
  const StrategyIcon = strategyMeta.icon;

  return (
    <Card className="card-shadow border-border">
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-medium bg-accent/10 px-2 py-0.5 rounded-full flex items-center gap-1 ${strategyMeta.color}`}>
            <StrategyIcon className="h-3 w-3" />
            {strategyMeta.label}
          </span>
          <span className="text-xs text-muted-foreground ml-auto bg-muted px-2 py-0.5 rounded-full">
            {index + 1} of 3
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Targeting: {strategyMeta.targetDomain}
        </p>
      </div>

      <CardContent className="pt-4 space-y-6">
        {/* Strategy-specific content */}
        {activity.strategy === "sentence_frames" && (
          <SentenceFrameActivity
            activity={activity}
            answer={answer}
            setAnswer={setAnswer}
            submitted={submitted}
          />
        )}

        {activity.strategy === "sentence_expansion" && (
          <SentenceExpansionActivity
            activity={activity}
            answer={answer}
            setAnswer={setAnswer}
            submitted={submitted}
            speech={speech}
          />
        )}

        {activity.strategy === "quick_writes" && (
          <QuickWriteActivity
            activity={activity}
            answer={answer}
            setAnswer={setAnswer}
            submitted={submitted}
          />
        )}

        {/* Submit / Feedback */}
        {!submitted ? (
          <Button variant="hero" className="w-full" size="lg" onClick={onSubmit} disabled={!answer.trim()}>
            Submit Answer
          </Button>
        ) : (
          <div className="space-y-4">
            <div className={`rounded-lg p-4 flex items-start gap-3 ${
              isCorrect ? "bg-success/10 border border-success/20" : "bg-primary/10 border border-primary/20"
            }`}>
              <CheckCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${isCorrect ? "text-success" : "text-primary"}`} />
              <div>
                <p className={`font-medium text-sm ${isCorrect ? "text-success" : "text-primary"}`}>{feedback}</p>
                <div className="mt-2 bg-muted/50 rounded p-2">
                  <p className="text-xs text-muted-foreground mb-1">Model answer:</p>
                  <p className="text-sm text-foreground font-medium">{activity.modelAnswer}</p>
                </div>
              </div>
            </div>
            <Button variant="hero" className="w-full" size="lg" onClick={onNext}>
              {index < 2 ? "Next Activity" : "Finish Session"} <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Sentence Frames Activity ───
function SentenceFrameActivity({ activity, answer, setAnswer, submitted }: {
  activity: Part2Activity; answer: string; setAnswer: (v: string) => void; submitted: boolean;
}) {
  return (
    <>
      {activity.passage && (
        <div className="bg-muted/50 rounded-lg p-4 border border-border">
          <p className="text-xs text-muted-foreground mb-1">📖 Read this passage:</p>
          <p className="text-foreground leading-relaxed">{activity.passage}</p>
        </div>
      )}
      <h3 className="text-lg font-medium text-foreground">{activity.question}</h3>
      {activity.sentenceFrame && (
        <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
          <p className="text-sm text-muted-foreground mb-1">Sentence frame:</p>
          <p className="text-foreground font-medium italic">{activity.sentenceFrame}</p>
        </div>
      )}
      <Input
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Complete the sentence..."
        className="h-12"
        disabled={submitted}
      />
    </>
  );
}

// ─── Sentence Expansion Activity ───
function SentenceExpansionActivity({ activity, answer, setAnswer, submitted, speech }: {
  activity: Part2Activity; answer: string; setAnswer: (v: string) => void; submitted: boolean;
  speech: ReturnType<typeof useSpeechRecognition>;
}) {
  return (
    <>
      <div className="bg-success/5 rounded-lg p-4 border border-success/20 text-center space-y-2">
        <Zap className="h-6 w-6 text-success mx-auto" />
        <p className="text-sm text-muted-foreground">Say this sentence out loud:</p>
        <p className="text-lg font-bold text-foreground">{activity.baseSentence}</p>
        {activity.expansionHint && (
          <p className="text-sm text-accent font-medium">
            ➕ Add: {activity.expansionHint}
          </p>
        )}
      </div>
      <h3 className="text-base font-medium text-foreground">{activity.question}</h3>
      <MicrophoneInput speech={speech} answer={answer} setAnswer={setAnswer} disabled={submitted} />
    </>
  );
}

// ─── Quick Write Activity ───
function QuickWriteActivity({ activity, answer, setAnswer, submitted }: {
  activity: Part2Activity; answer: string; setAnswer: (v: string) => void; submitted: boolean;
}) {
  return (
    <>
      <h3 className="text-lg font-medium text-foreground">{activity.question}</h3>
      {activity.sentenceStarter && (
        <div className="bg-accent/5 rounded-lg p-3 border border-accent/20">
          <p className="text-sm text-muted-foreground mb-1">You can start with:</p>
          <p className="text-foreground font-medium italic">{activity.sentenceStarter}</p>
        </div>
      )}
      {activity.wordBank && activity.wordBank.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-3 border border-border">
          <p className="text-sm text-muted-foreground mb-2">📚 Word bank — use these words if you'd like:</p>
          <div className="flex flex-wrap gap-2">
            {activity.wordBank.map((word, i) => (
              <span key={i} className="px-3 py-1 bg-primary/10 text-primary text-sm rounded-full font-medium">
                {word}
              </span>
            ))}
          </div>
        </div>
      )}
      <div>
        <Textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Write your answer here..."
          className="min-h-[120px]"
          disabled={submitted}
        />
        <p className="text-xs text-muted-foreground mt-2">
          ⏱️ Most students finish in about 2 minutes! Write at least 2-3 sentences.
        </p>
      </div>
    </>
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
              disabled ? "bg-muted text-muted-foreground"
              : speech.isListening
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

export default StudentSession;
