import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Brain, BookOpen, PenTool, Mic, MicOff, Headphones, CheckCircle,
  ArrowRight, Loader2, Star, Volume2, Trophy, Flame, RefreshCw,
  Eye, EyeOff, Target, Zap, Award, Users, Clock, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTTS } from "@/hooks/use-tts";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useGamification } from "@/hooks/use-gamification";
import { AnimalCompanion } from "@/components/gamification/AnimalCompanion";
import { PointsAnimation } from "@/components/gamification/PointsAnimation";
import { EvolutionCelebration } from "@/components/gamification/EvolutionCelebration";
import { BadgePopup } from "@/components/gamification/BadgePopup";
import { BadgeCollection } from "@/components/gamification/BadgeCollection";
import { Leaderboard } from "@/components/gamification/Leaderboard";
import { POINTS, BADGES } from "@/components/gamification/constants";

type Domain = "reading" | "writing" | "speaking" | "listening";
type Strategy = "sentence_frames" | "sentence_expansion" | "quick_writes";
type ChallengeType = "story_builder" | "speed_round" | "teach_it_back";

interface AnchorSentence {
  sentence: string;
  theme: string;
  topic: string;
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
  inputType?: string;
  options?: string[];
  audioClip?: string;
}

interface Part3Challenge {
  challengeType: ChallengeType;
  title: string;
  instruction: string;
  scenes?: string[];
  sentenceStarter?: string;
  sequenceWords?: string[];
  questions?: Array<{
    domain: string;
    passage?: string;
    audioDescription?: string;
    question: string;
    options: string[];
    correctAnswer: string;
  }>;
  guidingQuestions?: string[];
  vocabularyHints?: string[];
  acceptableKeywords?: string[];
  theme: string;
  topic: string;
}

const STRATEGY_LABELS: Record<Strategy, { label: string; icon: any; color: string; targetDomain: string }> = {
  sentence_frames: { label: "Sentence Frames", icon: BookOpen, color: "text-primary", targetDomain: "Reading & Listening" },
  sentence_expansion: { label: "Sentence Expansion", icon: Mic, color: "text-success", targetDomain: "Speaking" },
  quick_writes: { label: "Quick Writes", icon: PenTool, color: "text-accent", targetDomain: "Writing" },
};

// Part 1 = 8 steps, Part 2 = 6 activities (4 for K-2), Part 3 = 1 challenge
const TOTAL_STEPS_3_5 = 15;
const TOTAL_STEPS_K2 = 13; // 8 + 4 + 1

type GradeBand = "K-2" | "3-5";

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
  if (norm.split(/\s+/).length >= 3) return true;
  return false;
}

const BADGES_LOOKUP: Record<string, { icon: string; name: string }> = {};
BADGES.forEach((b) => { BADGES_LOOKUP[b.id] = { icon: b.icon, name: b.name }; });

function generateBlanks(sentence: string, keyWords: string[]): { blanked: string; missingWords: string[] } {
  const words = sentence.split(/\s+/);
  const keyLower = keyWords.map(w => w.toLowerCase());
  const candidates: number[] = [];
  words.forEach((w, i) => {
    const clean = w.toLowerCase().replace(/[^a-z']/g, '');
    if (keyLower.includes(clean) && clean.length > 2) candidates.push(i);
  });
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const count = Math.min(3, Math.max(2, shuffled.length));
  const picked = shuffled.slice(0, count).sort((a, b) => a - b);
  const missingWords = picked.map(i => words[i].replace(/[^a-zA-Z']/g, ''));
  const blanked = words.map((w, i) => picked.includes(i) ? '___' : w).join(' ');
  return { blanked, missingWords };
}

function jumbleSentence(passage: string): { original: string; jumbled: string[] } {
  const sentences = passage.split(/(?<=[.!?])\s+/).filter(Boolean);
  const target = sentences[0] || passage;
  const clean = target.replace(/[.!?]$/, '').trim();
  const words = clean.split(/\s+/);
  let shuffled = [...words].sort(() => Math.random() - 0.5);
  let attempts = 0;
  while (shuffled.join(' ') === words.join(' ') && attempts < 10) {
    shuffled = [...words].sort(() => Math.random() - 0.5);
    attempts++;
  }
  return { original: target.trim(), jumbled: shuffled };
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
  const [loadingMessage, setLoadingMessage] = useState("Getting your lesson ready...");
  const [globalStep, setGlobalStep] = useState(0);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [sessionTheme, setSessionTheme] = useState("");
  const [sessionTopic, setSessionTopic] = useState("");
  const [gradeBand, setGradeBand] = useState<GradeBand>("3-5");
  const [effectiveGradeBand, setEffectiveGradeBand] = useState<GradeBand>("3-5");
  const [gradeBandAdjusted, setGradeBandAdjusted] = useState(false);

  const totalSteps = effectiveGradeBand === "K-2" ? TOTAL_STEPS_K2 : TOTAL_STEPS_3_5;
  const part2Count = effectiveGradeBand === "K-2" ? 4 : 6;

  // Gamification
  const gamification = useGamification(studentName, teacherId);
  const [showView, setShowView] = useState<"session" | "badges" | "leaderboard">("session");

  // Part 1 state
  const [anchor, setAnchor] = useState<AnchorSentence | null>(null);
  const [part1Step, setPart1Step] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>(1);
  const [part1Feedback, setPart1Feedback] = useState<string | null>(null);
  const [part1ShowSentence, setPart1ShowSentence] = useState(true);
  const [part1Answer, setPart1Answer] = useState("");
  const [part1Submitted, setPart1Submitted] = useState(false);
  const [part1Scores, setPart1Scores] = useState<Part1Scores>({
    listen: false, repeat: 0, repeatTotal: 0, write: 0, writeTotal: 0, record: 0, recordTotal: 0,
  });
  const [hasSpoken, setHasSpoken] = useState(false);
  const [hasWritten, setHasWritten] = useState(false);
  const [ttsPreloaded, setTtsPreloaded] = useState(false);

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

  // Part 3 state
  const [part3Challenge, setPart3Challenge] = useState<Part3Challenge | null>(null);
  const [part3ShowIntro, setPart3ShowIntro] = useState(true);
  const [part3Answer, setPart3Answer] = useState("");
  const [part3Submitted, setPart3Submitted] = useState(false);
  const [part3Feedback, setPart3Feedback] = useState<string | null>(null);
  const [part3SpeedIndex, setPart3SpeedIndex] = useState(0);
  const [part3SpeedScore, setPart3SpeedScore] = useState(0);
  const [part3SpeedAnswers, setPart3SpeedAnswers] = useState<string[]>([]);
  const [part3StartTime, setPart3StartTime] = useState<number>(0);
  const [challengeCompleted, setChallengeCompleted] = useState<string | null>(null);

  const inPart1 = globalStep < 8;
  const inPart2 = globalStep >= 8 && globalStep < 8 + part2Count;
  const inPart3 = globalStep >= 8 + part2Count;

  // ─── Load student info, anchor sentence, and history on mount ───
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setLoadingMessage("Getting your lesson ready... 📚");
      if (!studentId || !sessionId) return;

      try {
        const { data: studentData } = await supabase
          .from("session_students")
          .select("student_name, session_id")
          .eq("id", studentId)
          .single();

        if (studentData) {
          setStudentName(studentData.student_name);
          const { data: sessionData } = await supabase
            .from("sessions")
            .select("teacher_id, grade_band")
            .eq("id", sessionId)
            .single();
          if (sessionData) {
            setTeacherId(sessionData.teacher_id);
            const gb = (sessionData as any).grade_band || "3-5";
            setGradeBand(gb as GradeBand);
            setEffectiveGradeBand(gb as GradeBand);
          }
        }
      } catch { /* proceed */ }

      try {
        const { data, error } = await supabase.functions.invoke("generate-anchor-sentence", {
          body: { grade: gradeBand || "3-5" },
        });
        if (error) throw error;
        const anchorData = data as AnchorSentence;
        if (!anchorData.topic) anchorData.topic = anchorData.theme;
        setAnchor(anchorData);
        setSessionTheme(anchorData.theme);
        setSessionTopic(anchorData.topic);
        setTtsPreloaded(true);
      } catch {
        const fallback: AnchorSentence = {
          sentence: "The ancient pyramids of Egypt were built thousands of years ago by skilled workers. They used massive stone blocks that weighed more than an elephant. These incredible structures still stand tall in the desert today.",
          theme: "Ancient Egypt",
          topic: "The building of the ancient pyramids",
          category: "Descriptive language models",
          keyWords: ["ancient", "pyramids", "Egypt", "built", "workers", "stone", "blocks", "elephant", "structures", "desert"],
        };
        setAnchor(fallback);
        setSessionTheme(fallback.theme);
        setSessionTopic(fallback.topic);
        setTtsPreloaded(true);
      }

      try {
        const { data: studentData } = await supabase
          .from("session_students")
          .select("student_name")
          .eq("id", studentId)
          .single();

        if (studentData?.student_name) {
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
            }
          }
        }
      } catch { /* use default */ }

      setLoading(false);
    };

    init();
  }, [studentId, sessionId]);

  useEffect(() => {
    if (studentName && teacherId) {
      gamification.loadData();
    }
  }, [studentName, teacherId]);

  // Auto-play TTS for Step 1 and Step 5 (Listen Again)
  useEffect(() => {
    if (!loading && inPart1 && anchor && tts.isSupported && ttsPreloaded) {
      if (part1Step === 1 || part1Step === 5) {
        const timer = setTimeout(() => tts.speak(anchor.sentence), 300);
        return () => clearTimeout(timer);
      }
    }
  }, [loading, inPart1, part1Step, anchor, ttsPreloaded]);

  useEffect(() => {
    if (speech.transcript) {
      if (inPart1) setPart1Answer(speech.transcript);
      else if (inPart2) setPart2Answer(speech.transcript);
      else if (inPart3) setPart3Answer(speech.transcript);
    }
  }, [speech.transcript, inPart1, inPart2, inPart3]);

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

    if (part1Step < 8) {
      setPart1Step((s) => (s + 1) as any);
      setGlobalStep((g) => g + 1);
    } else {
      // Part 1 complete → bonus points + grade band auto-adjustment
      gamification.addPoints(POINTS.PART1_COMPLETE);
      gamification.awardBadge("first_word");

      // Auto-adjust grade band based on Part 1 performance
      const totalPossible = part1Scores.repeatTotal + part1Scores.writeTotal + part1Scores.recordTotal;
      const totalEarned = part1Scores.repeat + part1Scores.write + part1Scores.record;
      const pct = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 50;

      let newBand = effectiveGradeBand;
      if (gradeBand === "3-5" && pct < 50) {
        newBand = "K-2";
        setEffectiveGradeBand("K-2");
        setGradeBandAdjusted(true);
        console.log("Auto-adjusted student to K-2 band (Part 1 score:", Math.round(pct), "%)");
      } else if (gradeBand === "K-2" && pct > 85) {
        newBand = "3-5";
        setEffectiveGradeBand("3-5");
        setGradeBandAdjusted(true);
        console.log("Auto-adjusted student to 3-5 band (Part 1 score:", Math.round(pct), "%)");
      }

      setGlobalStep(8);
      fetchPart2Activity(0);
    }
  };

  const handleStep1Done = () => {
    setPart1Scores((s) => ({ ...s, listen: true }));
    gamification.addPoints(POINTS.STEP1_LISTEN);
    saveResponse("listening", "Listened to anchor passage", "heard", anchor?.sentence || "", true, "Entering", "part1");
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
        ? `Nice try! You got ${matched} out of ${total} words. Here's the passage again: "${anchor.sentence}"`
        : `Good effort! You got ${matched} out of ${total} words. Here's the passage again: "${anchor.sentence}"`;
    setPart1Feedback(feedback);
    setPart1Submitted(true);
    gamification.addPoints(POINTS.STEP2_REPEAT);
    if (!hasSpoken) {
      setHasSpoken(true);
      gamification.awardBadge("first_voice");
    }
    saveResponse("speaking", `Repeat: ${anchor.sentence}`, part1Answer, anchor.sentence, pct >= 0.5, "Entering", "part1");
  };

  const handleStep6WriteSubmit = () => {
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
    gamification.addPoints(POINTS.STEP3_WRITE);
    if (!hasWritten) {
      setHasWritten(true);
      gamification.awardBadge("first_writer");
    }
    saveResponse("writing", `Write from memory: ${anchor.sentence}`, part1Answer, anchor.sentence, pct >= 0.5, "Entering", "part1");
  };

  const handleStep7RecordSubmit = () => {
    if (!anchor || !part1Answer.trim()) return;
    const { matched, total } = compareWords(part1Answer, anchor.sentence);
    setPart1Scores((s) => ({ ...s, record: matched, recordTotal: total }));
    const pct = total > 0 ? matched / total : 0;
    const feedback = pct >= 0.9
      ? `Perfect! You used ${matched} out of ${total} words! 🎤🏆`
      : pct >= 0.7
        ? `You used ${matched} out of ${total} words — great effort! 🎤🌟`
        : `You used ${matched} out of ${total} words — keep practicing! 🎤💪`;
    setPart1Feedback(feedback);
    setPart1Submitted(true);
    gamification.addPoints(POINTS.STEP4_RECORD);
    saveResponse("speaking", `Record: ${anchor.sentence}`, part1Answer, anchor.sentence, pct >= 0.5, "Entering", "part1");
  };

  // ─── Part 2 handlers ───
  const fetchPart2Activity = useCallback(async (index: number) => {
    setLoading(true);
    setLoadingMessage("Getting your next activity ready...");
    setPart2Submitted(false);
    setPart2Feedback(null);
    setPart2Answer("");
    speech.resetTranscript();
    tts.stop();

    try {
      const { data, error } = await supabase.functions.invoke("generate-part2", {
        body: {
          grade: effectiveGradeBand,
          theme: sessionTheme,
          topic: sessionTopic,
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
        question: `Complete this sentence about ${sessionTopic}: The ___ was ___ because ___.`,
        sentenceFrame: "The ___ was ___ because ___.",
        modelAnswer: `The ${sessionTopic} was fascinating because it taught us so much.`,
        acceptableKeywords: [sessionTopic.split(" ")[0]?.toLowerCase() || "topic", "because", "was"],
        difficulty: index + 1,
        theme: sessionTheme,
        strategy: "sentence_frames",
        weakestDomain: "none",
        strategyReason: "Default strategy",
        inputType: "typing",
      });
    } finally {
      setLoading(false);
    }
  }, [sessionTheme, sessionTopic, domainScores]);

  const submitPart2 = (overrideAnswer?: string) => {
    const answerText = overrideAnswer || part2Answer;
    if (!part2Activity || !answerText.trim()) {
      toast.error("Please provide an answer!");
      return;
    }
    if (overrideAnswer) setPart2Answer(overrideAnswer);

    let correct: boolean;
    if (part2Activity.inputType === "multiple_choice") {
      correct = answerText === part2Activity.modelAnswer;
    } else {
      correct = flexibleGrade(answerText, part2Activity.acceptableKeywords || []);
    }
    setPart2IsCorrect(correct);
    if (correct) setPart2Score((s) => s + 1);

    let feedback: string;
    if (correct) {
      const msgs = ["Excellent work! 🌟", "Great job — you nailed it! ✨", "Wonderful response! Keep it up! 🎉", "Amazing! 🏆", "You're doing great! 💪", "Fantastic answer! 🌈"];
      feedback = msgs[part2Index % msgs.length];
    } else {
      feedback = "Good effort! Here's a model answer to compare:";
    }
    setPart2Feedback(feedback);
    setPart2Submitted(true);
    tts.stop();

    gamification.addPoints(POINTS.PART2_ACTIVITY);

    const domainMap: Record<string, string> = {
      sentence_frames: "reading",
      sentence_expansion: "speaking",
      quick_writes: "writing",
    };
    const domain = domainMap[part2Activity.strategy] || "reading";

    saveResponse(
      domain,
      part2Activity.question,
      answerText,
      part2Activity.modelAnswer,
      correct,
      part2Activity.difficulty <= 2 ? "Entering" : part2Activity.difficulty <= 4 ? "Developing" : "Expanding",
      "part2",
      part2Activity.strategy
    );
  };

  const nextPart2 = () => {
    tts.stop();
    const nextIdx = part2Index + 1;
    if (nextIdx >= part2Count) {
      setGlobalStep(8 + part2Count);
      setPart3ShowIntro(true);
      fetchPart3Challenge();
      return;
    }
    setPart2Index(nextIdx);
    setGlobalStep(8 + nextIdx);
    fetchPart2Activity(nextIdx);
  };

  // ─── Part 3 handlers ───
  const fetchPart3Challenge = useCallback(async () => {
    setLoading(true);
    setLoadingMessage("Preparing your Language Challenge! 🎉");
    try {
      const challengeType = effectiveGradeBand === "K-2" ? "speed_round" : undefined;
      const { data, error } = await supabase.functions.invoke("generate-part3-challenge", {
        body: { grade: effectiveGradeBand, theme: sessionTheme, topic: sessionTopic, forceType: challengeType },
      });
      if (error) throw error;
      setPart3Challenge(data as Part3Challenge);
    } catch {
      toast.error("Failed to load challenge. Using backup.");
      setPart3Challenge({
        challengeType: "story_builder",
        title: "Story Builder",
        instruction: `Write a 4-6 sentence mini story about ${sessionTopic}!`,
        scenes: [
          `A bright morning in a place connected to ${sessionTopic}.`,
          `Something surprising happens related to ${sessionTopic}.`,
          `A character tries to solve a problem about ${sessionTopic}.`,
          `Everything works out and the character learns something new.`,
        ],
        sentenceStarter: "It all began when...",
        sequenceWords: ["first", "then", "next", "finally"],
        acceptableKeywords: [sessionTopic.split(" ")[0]?.toLowerCase() || "topic"],
        theme: sessionTheme,
        topic: sessionTopic,
      });
    } finally {
      setLoading(false);
      setPart3StartTime(Date.now());
    }
  }, [sessionTheme, sessionTopic]);

  const startPart3 = () => {
    setPart3ShowIntro(false);
    setPart3StartTime(Date.now());
  };

  const submitPart3StoryBuilder = () => {
    if (!part3Challenge || !part3Answer.trim()) {
      toast.error("Please write your story!");
      return;
    }
    const norm = part3Answer.toLowerCase();
    const seqWords = part3Challenge.sequenceWords || ["first", "then", "next", "finally"];
    const usedSeqWords = seqWords.filter((w) => norm.includes(w));
    const hasSequence = usedSeqWords.length >= 2;

    gamification.addPoints(POINTS.CHALLENGE_STORY_COMPLETE);
    if (hasSequence) gamification.addPoints(POINTS.CHALLENGE_STORY_SEQUENCE_BONUS);

    const feedback = hasSequence
      ? `Amazing story! You used sequence words (${usedSeqWords.join(", ")}) — that's advanced writing! 🌟 +${POINTS.CHALLENGE_STORY_COMPLETE + POINTS.CHALLENGE_STORY_SEQUENCE_BONUS} points!`
      : `Great story! Try using words like "first, then, next, finally" to make it even better! 📝 +${POINTS.CHALLENGE_STORY_COMPLETE} points!`;
    setPart3Feedback(feedback);
    setPart3Submitted(true);
    setChallengeCompleted("Story Builder");
    saveResponse("writing", "Part 3: Story Builder", part3Answer, part3Challenge.instruction, true, "Developing", "part3", "story_builder");
  };

  const submitPart3SpeedAnswer = (selectedOption: string) => {
    if (!part3Challenge?.questions) return;
    const q = part3Challenge.questions[part3SpeedIndex];
    const isCorrect = selectedOption === q.correctAnswer;
    if (isCorrect) {
      setPart3SpeedScore((s) => s + 1);
      gamification.addPoints(POINTS.CHALLENGE_SPEED_CORRECT);
    }
    setPart3SpeedAnswers((a) => [...a, selectedOption]);

    saveResponse(q.domain, q.question, selectedOption, q.correctAnswer, isCorrect, "Developing", "part3", "speed_round");

    if (part3SpeedIndex < 4) {
      setPart3SpeedIndex((i) => i + 1);
    } else {
      const elapsed = Math.round((Date.now() - part3StartTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      setPart3Feedback(`You completed the Speed Round in ${mins}:${secs.toString().padStart(2, "0")}! Score: ${part3SpeedScore + (isCorrect ? 1 : 0)}/5 🏎️`);
      setPart3Submitted(true);
      setChallengeCompleted("Speed Round");
    }
  };

  const submitPart3TeachItBack = () => {
    if (!part3Answer.trim()) {
      toast.error("Please record your explanation!");
      return;
    }
    gamification.addPoints(POINTS.CHALLENGE_TEACH_COMPLETE);
    const keywords = part3Challenge?.acceptableKeywords || [];
    const norm = part3Answer.toLowerCase();
    const usedWords = keywords.filter((kw) => norm.includes(kw.toLowerCase())).slice(0, 3);
    const feedback = usedWords.length > 0
      ? `Amazing! You explained ${sessionTopic} really well. You used these great words: ${usedWords.join(", ")}! 🎤🌟 +${POINTS.CHALLENGE_TEACH_COMPLETE} points!`
      : `Great job explaining ${sessionTopic}! Keep using topic vocabulary to make your explanations even stronger! 🎤 +${POINTS.CHALLENGE_TEACH_COMPLETE} points!`;
    setPart3Feedback(feedback);
    setPart3Submitted(true);
    setChallengeCompleted("Teach It Back");
    saveResponse("speaking", "Part 3: Teach It Back", part3Answer, sessionTopic, true, "Expanding", "part3", "teach_it_back");
  };

  const finishSession = () => {
    gamification.addPoints(POINTS.SESSION_COMPLETE);
    gamification.completeSession();
    if (domainScores) {
      for (const [, pct] of Object.entries(domainScores)) {
        if (pct >= 80) {
          gamification.addPoints(POINTS.DOMAIN_80_BONUS);
          break;
        }
      }
    }
    setSessionEnded(true);
  };

  // ─── Badge/Leaderboard screens ───
  if (showView === "badges") {
    return <BadgeCollection earnedBadgeIds={gamification.earnedBadgeIds} onBack={() => setShowView("session")} />;
  }
  if (showView === "leaderboard") {
    return <Leaderboard teacherId={teacherId} currentStudentName={studentName} onBack={() => setShowView("session")} />;
  }

  // ─── Session ended screen ───
  if (sessionEnded) {
    const strategyMeta = part2Strategy ? STRATEGY_LABELS[part2Strategy] : null;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md card-shadow text-center">
          <CardContent className="pt-8 pb-8 space-y-6">
            <AnimalCompanion points={gamification.totalPoints} studentName={studentName} />

            <h2 className="text-2xl font-bold text-foreground">Amazing Work! 🎉</h2>
            <p className="text-lg text-muted-foreground">
              Great work today, {studentName}! You explored <span className="font-bold text-primary">{sessionTopic}</span> like a true language learner! 🌟
            </p>

            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Points earned today</p>
              <p className="text-3xl font-bold text-warning">+{gamification.sessionPoints} ⭐</p>
              <p className="text-sm text-muted-foreground">Total: {gamification.totalPoints} points</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Language Builder</p>
                <p className="text-xl font-bold text-primary">✓</p>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Practice</p>
                <p className="text-xl font-bold text-accent">{part2Score}/6</p>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Challenge</p>
                <p className="text-xl font-bold text-success">✓</p>
                <p className="text-xs text-muted-foreground">{challengeCompleted}</p>
              </div>
            </div>

            {strategyMeta && (
              <div className="bg-muted/50 rounded-lg p-4 border border-border text-left space-y-2">
                <div className="flex items-center gap-2">
                  <Target className={`h-4 w-4 ${strategyMeta.color}`} />
                  <span className="text-sm font-medium text-foreground">Strategy: {strategyMeta.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{part2StrategyReason}</p>
              </div>
            )}

            {gamification.earnedBadgeIds.length > 0 && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                <p className="text-sm font-medium text-primary mb-2">🎖️ Your badges:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {gamification.earnedBadgeIds.slice(-5).map((id) => {
                    const badge = BADGES_LOOKUP[id];
                    return badge ? <span key={id} className="text-2xl" title={badge.name}>{badge.icon}</span> : null;
                  })}
                </div>
              </div>
            )}

            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-left">
              <p className="text-sm font-medium text-primary mb-1">💡 Growth Tip:</p>
              <p className="text-sm text-foreground">
                {part2Score >= 5
                  ? "You're doing amazing! Try reading a short book or story tonight to keep building your skills."
                  : part2Score >= 3
                    ? "Great progress! Practice writing 2-3 sentences about your day before bed."
                    : "Every practice session makes you stronger! Try saying new English words out loud when you hear them."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setShowView("badges")} className="gap-2">
                <Award className="h-4 w-4" /> My Badges
              </Button>
              <Button variant="outline" onClick={() => setShowView("leaderboard")} className="gap-2">
                <Users className="h-4 w-4" /> Leaderboard
              </Button>
            </div>

            <Button variant="hero" onClick={() => navigate("/")} className="w-full">
              Back to Home
            </Button>
          </CardContent>
        </Card>

        <PointsAnimation points={gamification.lastPointsEarned} show={gamification.showPointsAnim} onDone={() => gamification.setShowPointsAnim(false)} />
        {gamification.evolutionData && (
          <EvolutionCelebration show={true} animalEmoji={gamification.evolutionData.emoji} animalName={gamification.evolutionData.name} onClose={() => gamification.setEvolutionData(null)} />
        )}
        {gamification.pendingBadge && (
          <BadgePopup show={true} badgeIcon={gamification.pendingBadge.icon} badgeName={gamification.pendingBadge.name} onClose={() => gamification.setPendingBadge(null)} />
        )}
      </div>
    );
  }

  // ─── Progress label ───
  const getProgressLabel = () => {
    if (inPart1) return `Part 1 • Step ${part1Step}/8`;
    if (inPart2) return `Part 2 • Activity ${part2Index + 1}/6`;
    return "Part 3 • Challenge";
  };

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
          <div className="flex items-center gap-3">
            {gamification.loaded && (
              <AnimalCompanion points={gamification.totalPoints} studentName={studentName} compact />
            )}
            <div className="hidden sm:flex items-center gap-2">
              <button onClick={() => setShowView("badges")} className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-muted/80 flex items-center gap-1">
                <Award className="h-3 w-3" /> Badges
              </button>
              <button onClick={() => setShowView("leaderboard")} className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-muted/80 flex items-center gap-1">
                <Users className="h-3 w-3" /> Rank
              </button>
            </div>
          </div>
        </div>
        {sessionTopic && (
          <div className="px-4 py-1 bg-primary/5 border-b border-primary/10">
            <p className="text-xs text-center text-primary font-medium">
              📚 Today's Topic: <span className="font-bold">{sessionTopic}</span>
            </p>
          </div>
        )}
        <div className="px-4 pb-2 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{getProgressLabel()}</span>
            <Progress value={((globalStep + 1) / totalSteps) * 100} className="flex-1" />
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-muted-foreground">{loadingMessage}</p>
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
            onStep6WriteSubmit={handleStep6WriteSubmit}
            onStep7RecordSubmit={handleStep7RecordSubmit}
            onNext={handlePart1Next}
          />
        ) : inPart2 && part2Activity ? (
          <Part2StrategyView
            activity={part2Activity}
            index={part2Index}
            totalActivities={6}
            answer={part2Answer}
            setAnswer={setPart2Answer}
            submitted={part2Submitted}
            feedback={part2Feedback}
            isCorrect={part2IsCorrect}
            speech={speech}
            tts={tts}
            onSubmit={() => submitPart2()}
            onSubmitMC={(option: string) => submitPart2(option)}
            onNext={nextPart2}
          />
        ) : inPart3 ? (
          part3ShowIntro ? (
            <Card className="card-shadow border-border text-center">
              <CardContent className="pt-8 pb-8 space-y-6">
                <Sparkles className="h-16 w-16 text-warning mx-auto" />
                <h2 className="text-2xl font-bold text-foreground">🎉 Almost done!</h2>
                <p className="text-lg text-muted-foreground">Time for your Language Challenge!</p>
                <p className="text-sm text-muted-foreground">One fun final activity about <span className="font-bold text-primary">{sessionTopic}</span></p>
                <Button variant="hero" size="lg" className="w-full" onClick={startPart3}>
                  Let's Go! 🚀
                </Button>
              </CardContent>
            </Card>
          ) : part3Submitted && part3Feedback ? (
            <Card className="card-shadow border-border">
              <CardContent className="pt-8 pb-8 space-y-6">
                <div className="text-center">
                  <Trophy className="h-12 w-12 text-warning mx-auto mb-3" />
                  <h2 className="text-xl font-bold text-foreground">Challenge Complete! 🎉</h2>
                </div>
                <FeedbackBanner feedback={part3Feedback} positive={true} />
                <Button variant="hero" className="w-full" size="lg" onClick={finishSession}>
                  See My Results <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          ) : part3Challenge ? (
            <Part3ChallengeView
              challenge={part3Challenge}
              answer={part3Answer}
              setAnswer={setPart3Answer}
              speech={speech}
              tts={tts}
              speedIndex={part3SpeedIndex}
              onSubmitStory={submitPart3StoryBuilder}
              onSubmitSpeedAnswer={submitPart3SpeedAnswer}
              onSubmitTeach={submitPart3TeachItBack}
            />
          ) : null
        ) : null}
      </main>

      <PointsAnimation points={gamification.lastPointsEarned} show={gamification.showPointsAnim} onDone={() => gamification.setShowPointsAnim(false)} />
      {gamification.evolutionData && (
        <EvolutionCelebration show={true} animalEmoji={gamification.evolutionData.emoji} animalName={gamification.evolutionData.name} onClose={() => gamification.setEvolutionData(null)} />
      )}
      {gamification.pendingBadge && (
        <BadgePopup show={true} badgeIcon={gamification.pendingBadge.icon} badgeName={gamification.pendingBadge.name} onClose={() => gamification.setPendingBadge(null)} />
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════
// Part 1 — Daily Language Builder (8 steps)
// ═══════════════════════════════════════════════
interface Part1Props {
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
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
  onStep6WriteSubmit: () => void;
  onStep7RecordSubmit: () => void;
  onNext: () => void;
}

function Part1View({
  step, anchor, tts, speech, part1Answer, setPart1Answer,
  part1Submitted, part1Feedback, part1ShowSentence, setPart1ShowSentence,
  part1Scores, onStep1Done, onStep2Submit, onStep6WriteSubmit, onStep7RecordSubmit, onNext,
}: Part1Props) {
  // Local scaffold state
  const [blanks, setBlanks] = useState<{ blanked: string; missingWords: string[] } | null>(null);
  const [blankAnswers, setBlankAnswers] = useState<string[]>([]);
  const [blankSubmitted, setBlankSubmitted] = useState(false);
  const [jumble, setJumble] = useState<{ original: string; jumbled: string[] } | null>(null);
  const [jumbleAnswer, setJumbleAnswer] = useState("");
  const [jumbleSubmitted, setJumbleSubmitted] = useState(false);

  // Generate blanks when entering step 3
  useEffect(() => {
    if (step === 3 && !blanks) {
      const b = generateBlanks(anchor.sentence, anchor.keyWords);
      setBlanks(b);
      setBlankAnswers(new Array(b.missingWords.length).fill(""));
      setBlankSubmitted(false);
    }
  }, [step, anchor]);

  // Generate jumble when entering step 4
  useEffect(() => {
    if (step === 4 && !jumble) {
      const j = jumbleSentence(anchor.sentence);
      setJumble(j);
      setJumbleAnswer("");
      setJumbleSubmitted(false);
    }
  }, [step, anchor]);

  const handleBlankSubmit = () => {
    setBlankSubmitted(true);
  };

  const handleJumbleSubmit = () => {
    setJumbleSubmitted(true);
  };

  const stepTitles: Record<number, string> = {
    1: "Step 1: Listen 🎧",
    2: "Step 2: Repeat 🗣️",
    3: "Step 3: Fill in the Blanks 🔤",
    4: "Step 4: Jumbled Sentence 🧩",
    5: "Step 5: Listen One More Time 🎧",
    6: "Step 6: Write from Memory ✍️",
    7: "Step 7: Record 🎤",
    8: "Step 8: Your Results 🏆",
  };

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
        {/* Step 1: Listen */}
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

        {/* Step 2: Repeat */}
        {step === 2 && (
          <>
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <p className="text-sm text-muted-foreground mb-1">Say this passage out loud:</p>
              <p className="text-foreground font-medium leading-relaxed">{anchor.sentence}</p>
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

        {/* Step 3: Fill in the Blanks */}
        {step === 3 && blanks && (
          <>
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <p className="text-sm text-muted-foreground mb-2">Fill in the missing words:</p>
              <p className="text-foreground font-medium leading-relaxed text-lg">{blanks.blanked}</p>
            </div>
            <div className="space-y-3">
              {blanks.missingWords.map((word, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground w-16">Blank {i + 1}:</span>
                  {blankSubmitted ? (
                    <div className="flex items-center gap-2">
                      <span className="text-foreground font-bold">{word}</span>
                      {blankAnswers[i]?.toLowerCase().trim() === word.toLowerCase() ? (
                        <CheckCircle className="h-5 w-5 text-success" />
                      ) : (
                        <span className="text-sm text-muted-foreground">(you wrote: {blankAnswers[i] || "—"})</span>
                      )}
                    </div>
                  ) : (
                    <Input
                      value={blankAnswers[i] || ""}
                      onChange={(e) => {
                        const newAnswers = [...blankAnswers];
                        newAnswers[i] = e.target.value;
                        setBlankAnswers(newAnswers);
                      }}
                      placeholder="Type the missing word..."
                      className="flex-1 h-10"
                    />
                  )}
                </div>
              ))}
            </div>
            {!blankSubmitted ? (
              <Button variant="hero" className="w-full" size="lg" onClick={handleBlankSubmit} disabled={blankAnswers.some(a => !a.trim())}>
                Check My Answers
              </Button>
            ) : (
              <>
                <FeedbackBanner feedback="Great — you remember the key words! 🌟" positive={true} />
                <Button variant="hero" className="w-full" size="lg" onClick={onNext}>
                  Next Step <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </>
            )}
          </>
        )}

        {/* Step 4: Jumbled Sentence */}
        {step === 4 && jumble && (
          <>
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <p className="text-sm text-muted-foreground mb-2">Put these words back in the correct order:</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {jumble.jumbled.map((word, i) => (
                  <span key={i} className="px-3 py-1.5 bg-primary/10 text-primary text-sm rounded-full font-medium border border-primary/20">
                    {word}
                  </span>
                ))}
              </div>
            </div>
            <Input
              value={jumbleAnswer}
              onChange={(e) => setJumbleAnswer(e.target.value)}
              placeholder="Type the sentence in the correct order..."
              className="h-12"
              disabled={jumbleSubmitted}
            />
            {!jumbleSubmitted ? (
              <Button variant="hero" className="w-full" size="lg" onClick={handleJumbleSubmit} disabled={!jumbleAnswer.trim()}>
                Check My Sentence
              </Button>
            ) : (
              <>
                {(() => {
                  const { matched, total } = compareWords(jumbleAnswer, jumble.original);
                  const pct = total > 0 ? matched / total : 0;
                  return (
                    <>
                      <FeedbackBanner
                        feedback={pct >= 0.7 ? "Nice work putting it back together! 🧩🌟" : "Good try! Here's the correct sentence: 🧩"}
                        positive={pct >= 0.7}
                      />
                      <div className="bg-muted/50 rounded-lg p-3 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Correct sentence:</p>
                        <p className="text-foreground font-medium">{jumble.original}</p>
                      </div>
                    </>
                  );
                })()}
                <Button variant="hero" className="w-full" size="lg" onClick={onNext}>
                  Next Step <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </>
            )}
          </>
        )}

        {/* Step 5: Listen One More Time */}
        {step === 5 && (
          <>
            <div className="bg-muted/50 rounded-lg p-6 border border-border text-center space-y-4">
              <Headphones className="h-10 w-10 text-warning mx-auto" />
              <p className="text-sm text-muted-foreground">Listen to the passage one more time:</p>
              <p className="text-lg font-medium text-foreground leading-relaxed">{anchor.sentence}</p>
              {tts.isSupported && (
                <Button variant="outline" onClick={() => tts.speak(anchor.sentence)} disabled={tts.isSpeaking} className="gap-2">
                  <RefreshCw className={`h-4 w-4 ${tts.isSpeaking ? "animate-spin" : ""}`} />
                  {tts.isSpeaking ? "Playing..." : "Replay"}
                </Button>
              )}
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Listen carefully — you'll write this from memory next! 📝
            </p>
            <Button variant="hero" className="w-full" size="lg" onClick={onNext}>
              I'm ready to write ✓ <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </>
        )}

        {/* Step 6: Write from Memory */}
        {step === 6 && (
          <>
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Type the passage from memory:</p>
                {part1Submitted && (
                  <button onClick={() => setPart1ShowSentence(!part1ShowSentence)} className="text-xs text-primary flex items-center gap-1">
                    {part1ShowSentence ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {part1ShowSentence ? "Hide" : "Show"} passage
                  </button>
                )}
              </div>
              {part1Submitted && part1ShowSentence && (
                <p className="text-foreground font-medium leading-relaxed">{anchor.sentence}</p>
              )}
              {!part1Submitted && (
                <p className="text-muted-foreground text-xs italic">The passage is hidden — write from memory! You've got this after all that practice! 💪</p>
              )}
            </div>
            <Textarea
              value={part1Answer}
              onChange={(e) => setPart1Answer(e.target.value)}
              placeholder="Type the passage here..."
              className="min-h-[100px]"
              disabled={part1Submitted}
            />
            {!part1Submitted ? (
              <Button variant="hero" className="w-full" size="lg" onClick={onStep6WriteSubmit} disabled={!part1Answer.trim()}>
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

        {/* Step 7: Record */}
        {step === 7 && (
          <>
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <p className="text-sm text-muted-foreground mb-1">Record yourself saying the full passage — your best try!</p>
              <p className="text-foreground font-medium leading-relaxed">{anchor.sentence}</p>
            </div>
            <MicrophoneInput speech={speech} answer={part1Answer} setAnswer={setPart1Answer} disabled={part1Submitted} />
            {!part1Submitted ? (
              <Button variant="hero" className="w-full" size="lg" onClick={onStep7RecordSubmit} disabled={!part1Answer.trim()}>
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

        {/* Step 8: Results */}
        {step === 8 && <Step8Summary anchor={anchor} scores={part1Scores} onContinue={onNext} />}
      </CardContent>
    </Card>
  );
}

// ─── Step 8 Summary Card ───
function Step8Summary({ anchor, scores, onContinue }: {
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
        <p className="text-xs text-muted-foreground mb-1">Today's anchor passage:</p>
        <p className="text-foreground font-bold leading-relaxed">{anchor.sentence}</p>
      </div>
      <Button variant="hero" className="w-full" size="lg" onClick={onContinue}>
        Continue to Practice <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Part 2 — Strategy-Based Practice (6 activities with varied input types)
// ═══════════════════════════════════════════════
interface Part2Props {
  activity: Part2Activity;
  index: number;
  totalActivities: number;
  answer: string;
  setAnswer: (v: string) => void;
  submitted: boolean;
  feedback: string | null;
  isCorrect: boolean;
  speech: ReturnType<typeof useSpeechRecognition>;
  tts: ReturnType<typeof useTTS>;
  onSubmit: () => void;
  onSubmitMC: (option: string) => void;
  onNext: () => void;
}

function Part2StrategyView({
  activity, index, totalActivities, answer, setAnswer, submitted, feedback, isCorrect,
  speech, tts, onSubmit, onSubmitMC, onNext,
}: Part2Props) {
  const strategyMeta = STRATEGY_LABELS[activity.strategy];
  const StrategyIcon = strategyMeta.icon;
  const inputType = activity.inputType || "typing";

  return (
    <Card className="card-shadow border-border">
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-medium bg-accent/10 px-2 py-0.5 rounded-full flex items-center gap-1 ${strategyMeta.color}`}>
            <StrategyIcon className="h-3 w-3" />
            {strategyMeta.label}
          </span>
          <span className="text-xs text-muted-foreground ml-auto bg-muted px-2 py-0.5 rounded-full">
            {index + 1} of {totalActivities}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Targeting: {strategyMeta.targetDomain}</p>
      </div>

      <CardContent className="pt-4 space-y-6">
        {/* Passage (if present) */}
        {activity.passage && (
          <div className="bg-muted/50 rounded-lg p-4 border border-border">
            <p className="text-xs text-muted-foreground mb-1">📖 Read this passage:</p>
            <p className="text-foreground leading-relaxed">{activity.passage}</p>
          </div>
        )}

        {/* Audio clip (for listen_then_type) */}
        {inputType === "listen_then_type" && activity.audioClip && (
          <div className="bg-warning/5 rounded-lg p-4 border border-warning/20 text-center space-y-3">
            <Headphones className="h-8 w-8 text-warning mx-auto" />
            <p className="text-foreground leading-relaxed">{activity.audioClip}</p>
            {tts.isSupported && (
              <Button variant="outline" size="sm" onClick={() => tts.speak(activity.audioClip || "")}>
                <Volume2 className="h-4 w-4 mr-1" /> Play Audio
              </Button>
            )}
          </div>
        )}

        {/* Base sentence for expansion */}
        {activity.baseSentence && (
          <div className="bg-success/5 rounded-lg p-4 border border-success/20 text-center space-y-2">
            <Zap className="h-6 w-6 text-success mx-auto" />
            <p className="text-sm text-muted-foreground">
              {inputType === "recording" ? "Say this sentence out loud:" : "Build on this sentence:"}
            </p>
            <p className="text-lg font-bold text-foreground">{activity.baseSentence}</p>
            {activity.expansionHint && (
              <p className="text-sm text-accent font-medium">➕ Add: {activity.expansionHint}</p>
            )}
          </div>
        )}

        {/* Question */}
        <h3 className="text-lg font-medium text-foreground">{activity.question}</h3>

        {/* Sentence frame */}
        {activity.sentenceFrame && inputType !== "multiple_choice" && (
          <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
            <p className="text-sm text-muted-foreground mb-1">Sentence frame:</p>
            <p className="text-foreground font-medium italic">{activity.sentenceFrame}</p>
          </div>
        )}

        {/* Sentence starter */}
        {activity.sentenceStarter && (
          <div className="bg-accent/5 rounded-lg p-3 border border-accent/20">
            <p className="text-sm text-muted-foreground mb-1">You can start with:</p>
            <p className="text-foreground font-medium italic">{activity.sentenceStarter}</p>
          </div>
        )}

        {/* Word bank */}
        {activity.wordBank && activity.wordBank.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3 border border-border">
            <p className="text-sm text-muted-foreground mb-2">📚 Word bank — use these words if you'd like:</p>
            <div className="flex flex-wrap gap-2">
              {activity.wordBank.map((word, i) => (
                <span key={i} className="px-3 py-1 bg-primary/10 text-primary text-sm rounded-full font-medium">{word}</span>
              ))}
            </div>
          </div>
        )}

        {/* Input area based on inputType */}
        {!submitted && (
          <>
            {inputType === "multiple_choice" && activity.options ? (
              <div className="grid grid-cols-1 gap-3">
                {activity.options.map((option, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    className="justify-start text-left h-auto py-3 px-4 text-foreground hover:bg-primary/10 hover:border-primary/30"
                    onClick={() => onSubmitMC(option)}
                  >
                    <span className="font-bold text-primary mr-2">{String.fromCharCode(65 + i)}.</span>
                    {option}
                  </Button>
                ))}
              </div>
            ) : inputType === "recording" ? (
              <MicrophoneInput speech={speech} answer={answer} setAnswer={setAnswer} disabled={submitted} />
            ) : inputType === "record_then_type" ? (
              <div className="space-y-4">
                <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer here..." className="min-h-[100px]" disabled={submitted} />
                <MicrophoneInput speech={speech} answer={answer} setAnswer={setAnswer} disabled={submitted} />
                <p className="text-xs text-muted-foreground">✍️ Type your answer, then 🎤 record yourself saying it!</p>
              </div>
            ) : inputType === "listen_then_type" ? (
              <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer..." className="h-12" disabled={submitted} />
            ) : activity.strategy === "quick_writes" ? (
              <div>
                <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Write your answer here..." className="min-h-[120px]" disabled={submitted} />
                <p className="text-xs text-muted-foreground mt-2">⏱️ Most students finish in about 2 minutes! Write at least 2-3 sentences.</p>
              </div>
            ) : (
              <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer..." className="h-12" disabled={submitted} />
            )}

            {inputType !== "multiple_choice" && (
              <Button variant="hero" className="w-full" size="lg" onClick={onSubmit} disabled={!answer.trim()}>
                Submit Answer
              </Button>
            )}
          </>
        )}

        {/* Feedback */}
        {submitted && (
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
              {index < totalActivities - 1 ? "Next Activity" : "Continue to Challenge! 🎉"} <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════
// Part 3 — Fun Challenge
// ═══════════════════════════════════════════════
interface Part3Props {
  challenge: Part3Challenge;
  answer: string;
  setAnswer: (v: string) => void;
  speech: ReturnType<typeof useSpeechRecognition>;
  tts: ReturnType<typeof useTTS>;
  speedIndex: number;
  onSubmitStory: () => void;
  onSubmitSpeedAnswer: (option: string) => void;
  onSubmitTeach: () => void;
}

function Part3ChallengeView({
  challenge, answer, setAnswer, speech, tts, speedIndex,
  onSubmitStory, onSubmitSpeedAnswer, onSubmitTeach,
}: Part3Props) {
  if (challenge.challengeType === "story_builder") {
    return (
      <Card className="card-shadow border-border">
        <div className="px-6 pt-6">
          <span className="text-xs font-medium bg-warning/10 text-warning px-2 py-0.5 rounded-full">
            🏆 Language Challenge: Story Builder
          </span>
        </div>
        <CardContent className="pt-4 space-y-6">
          <h3 className="text-lg font-bold text-foreground">{challenge.instruction}</h3>
          <div className="space-y-3">
            {challenge.scenes?.map((scene, i) => (
              <div key={i} className="bg-muted/50 rounded-lg p-3 border border-border flex gap-3">
                <span className="bg-primary/10 text-primary text-sm font-bold rounded-full w-7 h-7 flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <p className="text-sm text-foreground">{scene}</p>
              </div>
            ))}
          </div>
          {challenge.sentenceStarter && (
            <div className="bg-accent/5 rounded-lg p-3 border border-accent/20">
              <p className="text-sm text-muted-foreground mb-1">You can start with:</p>
              <p className="text-foreground font-medium italic">{challenge.sentenceStarter}</p>
            </div>
          )}
          <div>
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Write your story here... (4-6 sentences)"
              className="min-h-[150px]"
            />
            <p className="text-xs text-muted-foreground mt-2">
              💡 Tip: Use words like <span className="font-medium">first, then, next, finally</span> to connect your scenes! +10 bonus points!
            </p>
          </div>
          <Button variant="hero" className="w-full" size="lg" onClick={onSubmitStory} disabled={!answer.trim()}>
            Submit My Story ✨
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (challenge.challengeType === "speed_round" && challenge.questions) {
    const q = challenge.questions[speedIndex];
    return (
      <Card className="card-shadow border-border">
        <div className="px-6 pt-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium bg-warning/10 text-warning px-2 py-0.5 rounded-full">
              🏎️ Speed Round
            </span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {speedIndex + 1} of 5
            </span>
          </div>
        </div>
        <CardContent className="pt-4 space-y-6">
          {q.passage && (
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <p className="text-xs text-muted-foreground mb-1">📖 Read this:</p>
              <p className="text-foreground leading-relaxed">{q.passage}</p>
            </div>
          )}
          {q.audioDescription && (
            <div className="bg-warning/5 rounded-lg p-4 border border-warning/20 text-center space-y-3">
              <Headphones className="h-8 w-8 text-warning mx-auto" />
              <p className="text-foreground leading-relaxed">{q.audioDescription}</p>
              {tts.isSupported && (
                <Button variant="outline" size="sm" onClick={() => tts.speak(q.audioDescription || "")}>
                  <Volume2 className="h-4 w-4 mr-1" /> Play Audio
                </Button>
              )}
            </div>
          )}
          <h3 className="text-lg font-medium text-foreground">{q.question}</h3>
          <div className="grid grid-cols-1 gap-3">
            {q.options.map((option, i) => (
              <Button
                key={i}
                variant="outline"
                className="justify-start text-left h-auto py-3 px-4 text-foreground hover:bg-primary/10 hover:border-primary/30"
                onClick={() => onSubmitSpeedAnswer(option)}
              >
                <span className="font-bold text-primary mr-2">{String.fromCharCode(65 + i)}.</span>
                {option}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (challenge.challengeType === "teach_it_back") {
    return (
      <Card className="card-shadow border-border">
        <div className="px-6 pt-6">
          <span className="text-xs font-medium bg-warning/10 text-warning px-2 py-0.5 rounded-full">
            🎓 Teach It Back
          </span>
        </div>
        <CardContent className="pt-4 space-y-6">
          <h3 className="text-lg font-bold text-foreground">{challenge.instruction}</h3>
          {challenge.guidingQuestions && challenge.guidingQuestions.length > 0 && (
            <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
              <p className="text-sm font-medium text-primary mb-2">💡 Try to include:</p>
              <ul className="space-y-1">
                {challenge.guidingQuestions.map((q, i) => (
                  <li key={i} className="text-sm text-foreground">• {q}</li>
                ))}
              </ul>
            </div>
          )}
          {challenge.vocabularyHints && challenge.vocabularyHints.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-3 border border-border">
              <p className="text-sm text-muted-foreground mb-2">📚 Key vocabulary from today:</p>
              <div className="flex flex-wrap gap-2">
                {challenge.vocabularyHints.map((word, i) => (
                  <span key={i} className="px-3 py-1 bg-accent/10 text-accent text-sm rounded-full font-medium">{word}</span>
                ))}
              </div>
            </div>
          )}
          <MicrophoneInput speech={speech} answer={answer} setAnswer={setAnswer} disabled={false} />
          <Button variant="hero" className="w-full" size="lg" onClick={onSubmitTeach} disabled={!answer.trim()}>
            Submit My Explanation 🎤
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
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
