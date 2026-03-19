import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Brain, BookOpen, PenTool, Mic, MicOff, Headphones, CheckCircle,
  ArrowRight, Loader2, Star, Volume2, VolumeX, Trophy, Flame, RefreshCw,
  Eye, EyeOff, Target, Zap, Award, Users, Clock, Sparkles,
} from "lucide-react";
import { useSounds } from "@/hooks/use-sounds";
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
import { POINTS, POINTS_35, BADGES } from "@/components/gamification/constants";
import { getAnimalLevel, getAnimalLevel35, getNextLevel, getNextLevel35 } from "@/components/gamification/constants";
import { ThemeBackground, ThemePageWrapper, ThemedCard, ThemedCompanionGlow, ConfettiCelebration, MotivationalBanner, getThemeStyles } from "@/components/session/ThemeBackground";
import { WordBankFillBlanks } from "@/components/session/WordBankFillBlanks";
import { MemoryMatch } from "@/components/session/MemoryMatch";
import {
  normalizeWord, sentenceToWords, isExactWordOrderMatch, deduplicateChips,
  isSentenceFrameCorrect, buildSentenceFrameTiles, deterministicShuffle,
  MAX_WRONG_ATTEMPTS, CORRECT_AUTO_ADVANCE_MS, shouldForceRevealAfterAttempts,
  generateK2SentenceFrame,
} from "@/lib/k2-rules";

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
  sayIt: number;
  sayItTotal: number;
  dragDrop: number;
  dragDropTotal: number;
  memoryMatch: number;
  memoryMatchTotal: number;
  jumbled: number;
  jumbledTotal: number;
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

const STRATEGY_LABELS: Record<string, { label: string; icon: any; color: string; targetDomain: string }> = {
  sentence_frames: { label: "Sentence Frames", icon: BookOpen, color: "text-primary", targetDomain: "Reading & Listening" },
  sentence_frame: { label: "Sentence Frames", icon: BookOpen, color: "text-primary", targetDomain: "Reading & Listening" },
  sentence_expansion: { label: "Sentence Expansion", icon: Mic, color: "text-success", targetDomain: "Speaking" },
  quick_writes: { label: "Quick Writes", icon: PenTool, color: "text-accent", targetDomain: "Writing" },
  quick_write: { label: "Quick Write", icon: PenTool, color: "text-accent", targetDomain: "Writing" },
  say_and_expand: { label: "Say & Expand", icon: Mic, color: "text-success", targetDomain: "Speaking" },
  multiple_choice: { label: "Multiple Choice", icon: Brain, color: "text-primary", targetDomain: "Reading & Listening" },
  talk_to_companion: { label: "Talk to Companion", icon: Mic, color: "text-warning", targetDomain: "Speaking" },
  share_your_thoughts: { label: "Share Your Thoughts 🎤", icon: Mic, color: "text-warning", targetDomain: "Speaking" },
};

const DEFAULT_STRATEGY_META = { label: "Practice", icon: Star, color: "text-primary", targetDomain: "Language" };

// Part 1 = 5 steps, Part 2 = 6 activities (4 for K-2), Part 3 = 1 challenge
const TOTAL_STEPS_3_5 = 12; // 5 + 6 + 1
const TOTAL_STEPS_K2 = 10;  // 5 + 4 + 1

type GradeBand = "K-2" | "3-5";

// ─── Error Boundary for activity rendering ───
import React from "react";
class ActivityErrorBoundary extends React.Component<
  { children: React.ReactNode; onSkip: () => void; isK2?: boolean },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ActivityErrorBoundary] Caught render error:", error, info.componentStack);
  }
  componentDidUpdate(prevProps: any) {
    // Reset error state when activity changes
    if (prevProps.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <Card className="card-shadow border-border">
          <CardContent className="py-12 text-center space-y-4">
            <p className="text-3xl">😅</p>
            <p className={`font-medium ${this.props.isK2 ? "text-xl" : "text-lg"} text-foreground`}>
              Something went wrong with this activity.
            </p>
            <p className="text-sm text-muted-foreground">Error: {this.state.error?.message}</p>
            <Button variant="hero" size="lg" onClick={this.props.onSkip}>
              Skip to Next Activity →
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

// ─── Content validation ───
function validatePart2Activity(data: any): data is Part2Activity {
  if (!data) return false;
  if (!data.question || typeof data.question !== "string") return false;
  if (!data.modelAnswer || typeof data.modelAnswer !== "string") return false;
  // strategy may come as activity.type from edge function — accept either
  if (!data.strategy && !data.type) return false;
  if (!Array.isArray(data.acceptableKeywords)) return false;
  return true;
}

function validatePart3Challenge(data: any): data is Part3Challenge {
  if (!data) return false;
  if (!data.challengeType || typeof data.challengeType !== "string") return false;
  if (!data.title || typeof data.title !== "string") return false;
  if (!data.instruction || typeof data.instruction !== "string") return false;
  if (data.challengeType === "speed_round" && (!Array.isArray(data.questions) || data.questions.length === 0)) return false;
  return true;
}

// Auto-trigger finishSession when Part 3 completes
function Part3CompletionTrigger({ finishSession }: { finishSession: () => void }) {
  const triggered = useRef(false);
  useEffect(() => {
    if (!triggered.current) {
      triggered.current = true;
      const t = setTimeout(finishSession, 600);
      return () => clearTimeout(t);
    }
  }, [finishSession]);

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4 animate-fade-in">
      <Trophy className="h-16 w-16 text-warning animate-bounce" />
      <h2 className="text-2xl font-bold text-foreground">Challenge Complete! 🎉</h2>
      <p className="text-muted-foreground">Preparing your celebration...</p>
    </div>
  );
}

// Fetch with timeout helper
function fetchWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Request timed out")), timeoutMs)),
  ]);
}

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
  const totalPossible = scores.sayItTotal + scores.dragDropTotal + scores.memoryMatchTotal + scores.jumbledTotal;
  const totalEarned = scores.sayIt + scores.dragDrop + scores.memoryMatch + scores.jumbled;
  const pct = totalPossible > 0 ? totalEarned / totalPossible : 0;
  if (pct >= 0.9) return { icon: Trophy, label: "🏆 Language Champion!", color: "text-warning" };
  if (pct >= 0.7) return { icon: Flame, label: "🔥 Great Effort!", color: "text-accent" };
  return { icon: Star, label: "⭐ Keep Practicing!", color: "text-primary" };
}

function flexibleGrade(input: string, keywords: string[]): boolean {
  const norm = input.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (keywords.length === 0) return false;
  const matchCount = keywords.filter((kw) => norm.includes(kw.toLowerCase())).length;
  return matchCount >= Math.max(2, Math.ceil(keywords.length * 0.3));
}

function sentenceCount(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z']/g, ""))
    .filter(Boolean).length;
}

function isValidK2AnchorSentence(sentence: string): boolean {
  if (!sentence?.trim()) return false;
  if (sentenceCount(sentence) !== 1) return false;
  if (wordCount(sentence) > 10) return false;
  return true;
}

const BADGES_LOOKUP: Record<string, { icon: string; name: string }> = {};
BADGES.forEach((b) => { BADGES_LOOKUP[b.id] = { icon: b.icon, name: b.name }; });

interface FillInBlankPayload {
  sentence: string;
  blanks: Array<number | { index: number }>;
  answers: string[];
  wordBank: string[];
}

function validateFillInBlankPayload(payload: any): payload is FillInBlankPayload {
  if (!payload || typeof payload !== "object") return false;
  if (typeof payload.sentence !== "string" || !payload.sentence.trim()) return false;
  if (!Array.isArray(payload.blanks)) return false;
  if (!Array.isArray(payload.answers) || payload.answers.length === 0) return false;
  if (!Array.isArray(payload.wordBank) || payload.wordBank.length === 0) return false;
  return true;
}

function normalizeFillInBlankPayload(payload: any): { blanked: string; missingWords: string[]; wordBank: string[] } | null {
  // Legacy shape already used by WordBankFillBlanks
  if (
    payload &&
    typeof payload.blankedSentence === "string" &&
    Array.isArray(payload.missingWords) &&
    Array.isArray(payload.wordBank)
  ) {
    if (!payload.blankedSentence.includes("___") || payload.missingWords.length === 0) return null;
    return {
      blanked: payload.blankedSentence,
      missingWords: payload.missingWords,
      wordBank: payload.wordBank,
    };
  }

  // New explicit schema { sentence, blanks, answers, wordBank }
  if (!validateFillInBlankPayload(payload)) return null;
  if (!payload.sentence.includes("___") || payload.answers.length === 0) return null;

  return {
    blanked: payload.sentence,
    missingWords: payload.answers,
    wordBank: payload.wordBank,
  };
}

function generateBlanks(sentence: string, keyWords: string[], isK2?: boolean): { blanked: string; missingWords: string[]; wordBank: string[] } {
  const words = sentence.split(/\s+/);
  const keyLower = keyWords.map((w) => w.toLowerCase());
  const candidates: number[] = [];

  words.forEach((w, i) => {
    const clean = w.toLowerCase().replace(/[^a-z']/g, "");
    if (keyLower.includes(clean) && clean.length > 2) candidates.push(i);
  });

  // Safety fallback when Gemini keyWords are missing/misaligned
  if (candidates.length === 0) {
    const fallbackStopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "were", "was"]);
    words.forEach((w, i) => {
      const clean = w.toLowerCase().replace(/[^a-z']/g, "");
      if (clean.length > 3 && !fallbackStopWords.has(clean)) candidates.push(i);
    });
  }

  const shuffled = [...new Set(candidates)].sort(() => Math.random() - 0.5);
  const maxBlanks = isK2 ? 2 : 3;
  const count = Math.min(maxBlanks, Math.max(1, shuffled.length));
  const picked = shuffled.slice(0, count).sort((a, b) => a - b);

  // Ensure sentence still makes sense: don't blank consecutive words
  const filtered: number[] = [];
  for (const idx of picked) {
    if (filtered.length === 0 || idx - filtered[filtered.length - 1] > 1) {
      filtered.push(idx);
    }
  }

  // Absolute fallback: guarantee at least one blank
  if (filtered.length === 0 && words.length > 0) {
    const fallbackIdx = words.findIndex((w) => w.replace(/[^a-zA-Z']/g, "").length > 2);
    if (fallbackIdx >= 0) filtered.push(fallbackIdx);
  }

  const finalPicked = filtered.slice(0, maxBlanks);
  const missingWords = finalPicked.map((i) => words[i].replace(/[^a-zA-Z']/g, ""));
  const blanked = words.map((w, i) => (finalPicked.includes(i) ? "___" : w)).join(" ");

  const wordBank = [...missingWords];
  if (isK2) {
    const distractors = keyWords
      .filter((w) => !missingWords.map((m) => m.toLowerCase()).includes(w.toLowerCase()) && w.length > 2)
      .slice(0, 1);
    wordBank.push(...distractors);
  } else {
    const distractors = keyWords
      .filter((w) => !missingWords.map((m) => m.toLowerCase()).includes(w.toLowerCase()) && w.length > 2)
      .slice(0, 2);
    wordBank.push(...distractors);
  }

  const shuffledBank = [...new Set(wordBank)].sort(() => Math.random() - 0.5);
  return { blanked, missingWords, wordBank: shuffledBank };
}

function jumbleSentence(passage: string): { original: string; correctWords: string[]; jumbled: string[] } {
  const sentences = passage.split(/(?<=[.!?])\s+/).filter(Boolean);
  const target = sentences[0] || passage;
  const clean = target.replace(/[.!?]$/, "").trim();
  // Normalize all chips to lowercase — prevents "a" vs "A" duplicates
  const words = deduplicateChips(clean.split(/\s+/));

  let shuffled = [...words].sort(() => Math.random() - 0.5);
  let attempts = 0;
  while (isExactWordOrderMatch(shuffled, words) && attempts < 10) {
    shuffled = [...words].sort(() => Math.random() - 0.5);
    attempts++;
  }

  return { original: target.trim(), correctWords: words, jumbled: shuffled };
}

// ═══════════════════════════════════════════════
// Theme emoji lookup
// ═══════════════════════════════════════════════
const THEME_EMOJIS: Record<string, string> = {
  "Nature & animals": "🌿",
  "Superheroes": "⚡",
  "Fantasy & myths": "🧙",
  "Sports & games": "⚽",
  "Science": "🔬",
  "School & classroom life": "📚",
  "Social studies": "🗺️",
  "Character development": "💖",
};

function getThemeEmoji(theme: string): string {
  if (THEME_EMOJIS[theme]) return THEME_EMOJIS[theme];
  // Fuzzy match
  const lower = theme.toLowerCase();
  for (const [key, emoji] of Object.entries(THEME_EMOJIS)) {
    if (lower.includes(key.toLowerCase().split(" ")[0])) return emoji;
  }
  return "🌟";
}

// ═══════════════════════════════════════════════
// Session Loading Screen
// ═══════════════════════════════════════════════
const LOADING_PHRASES = [
  "Getting your adventure ready... 🚀",
  "Loading your words... 📚",
  "Building something awesome... ⭐",
  "Warming up your brain... 🧠",
  "Mixing up some fun activities... 🎨",
  "Your animal companion is stretching... 🐣",
  "Gathering your superpowers... 💪",
  "Sprinkling some magic... ✨",
  "Almost there, keep going... 🌟",
  "Preparing your challenge... 🏆",
  "Loading word adventures... 🎮",
  "Your lesson is almost ready... 🎉",
];

function SessionLoadingScreen({ studentName, theme }: { studentName: string; theme: string }) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % LOADING_PHRASES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  const emoji = getThemeEmoji(theme);

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-8 animate-fade-in">
      {/* Student name */}
      {studentName && (
        <p className="text-2xl font-bold text-white/90 tracking-wide">
          Hi {studentName}! 👋
        </p>
      )}

      {/* Big theme emoji with pulse */}
      <div
        className="text-[120px] leading-none"
        style={{
          animation: "loading-pulse 2s ease-in-out infinite",
        }}
      >
        {emoji}
      </div>

      {/* Cycling message */}
      <p
        key={phraseIndex}
        className="text-xl font-semibold text-white/80 animate-fade-in text-center"
      >
        {LOADING_PHRASES[phraseIndex]}
      </p>

      {/* Bouncing dots */}
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-3 h-3 rounded-full bg-white/60"
            style={{
              animation: "loading-bounce 1.4s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes loading-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15) rotate(5deg); }
        }
        @keyframes loading-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-12px); opacity: 1; }
        }
      `}</style>
    </div>
  );
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
  const [contentHistory, setContentHistory] = useState<any>(null);
  const [usedActivityFormats, setUsedActivityFormats] = useState<string[]>([]);
  const [usedVocabulary, setUsedVocabulary] = useState<string[]>([]);
  const [vocabularyResults, setVocabularyResults] = useState<Array<{ word: string; correct: boolean }>>([]);

  const totalSteps = effectiveGradeBand === "K-2" ? TOTAL_STEPS_K2 : TOTAL_STEPS_3_5;
  const part2Count = effectiveGradeBand === "K-2" ? 4 : 6;
  const pts = effectiveGradeBand === "3-5" ? POINTS_35 : POINTS;

  // Gamification & Sounds
  const gamification = useGamification(studentName, teacherId);
  const sounds = useSounds();
  const [showView, setShowView] = useState<"session" | "badges" | "leaderboard">("session");
  const quickWriteCountRef = useRef(0);

  // Play evolution sound when animal evolves
  useEffect(() => {
    if (gamification.evolutionData) {
      sounds.playEvolution();
    }
  }, [gamification.evolutionData]);

  // Part 1 state
  const [anchor, setAnchor] = useState<AnchorSentence | null>(null);
  const [part1Step, setPart1Step] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [part1Feedback, setPart1Feedback] = useState<string | null>(null);
  const [part1ShowSentence, setPart1ShowSentence] = useState(true);
  const [part1Answer, setPart1Answer] = useState("");
  const [part1Submitted, setPart1Submitted] = useState(false);
  const [part1Scores, setPart1Scores] = useState<Part1Scores>({
    listen: false, sayIt: 0, sayItTotal: 0, dragDrop: 0, dragDropTotal: 0,
    memoryMatch: 0, memoryMatchTotal: 0, jumbled: 0, jumbledTotal: 0,
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
  const [activityError, setActivityError] = useState(false);
  const [activityRetryCount, setActivityRetryCount] = useState(0);
  const [part2Score, setPart2Score] = useState(0);
  const [part2Strategy, setPart2Strategy] = useState<Strategy | null>(null);
  const [part2StrategyReason, setPart2StrategyReason] = useState("");
  const [domainScores, setDomainScores] = useState<Record<string, number> | null>(null);

  // K-2 Sentence Frame Adaptive Tier
  const [sentenceFrameTier, setSentenceFrameTier] = useState(1);
  const [tierConsecutiveCorrect, setTierConsecutiveCorrect] = useState(0);
  const [tierConsecutiveWrong, setTierConsecutiveWrong] = useState(0);

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

  // Conclusion state
  const [showConclusion, setShowConclusion] = useState(false);
  const [conclusionStep, setConclusionStep] = useState<1 | 2>(1);
  const [conclusionAnswer, setConclusionAnswer] = useState("");
  const [conclusionSubmitted, setConclusionSubmitted] = useState(false);
  const [conclusionNudgeShown, setConclusionNudgeShown] = useState(false);
  const [conclusionReaction, setConclusionReaction] = useState<string | null>(null);

  // Theme visual state
  const [showConfetti, setShowConfetti] = useState(false);
  const [showMotivational, setShowMotivational] = useState(false);

  // Prefetched activity cache (batch-generated at session start)
  const prefetchedPart2Ref = useRef<Record<number, Part2Activity>>({});
  const prefetchedPart3Ref = useRef<Part3Challenge | null>(null);
  const allPrefetchedRef = useRef(false);

  const prefetchSessionContent = useCallback(async (params: {
    grade: GradeBand;
    theme: string;
    topic: string;
    domainScores: Record<string, number> | null;
    history: any;
    setMsg?: (msg: string) => void;
  }) => {
    const { grade, theme, topic, domainScores, history, setMsg } = params;
    const total = grade === "K-2" ? 4 : 6;
    prefetchedPart2Ref.current = {};
    prefetchedPart3Ref.current = null;
    allPrefetchedRef.current = false;

    setMsg?.("Creating your activities... 🎨");

    // Generate ALL Part 2 activities in parallel
    const part2Results = await Promise.all(
      Array.from({ length: total }, async (_, index) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const { data, error } = await fetchWithTimeout(
              supabase.functions.invoke("generate-part2", {
                body: {
                  grade,
                  theme,
                  topic,
                  domainScores,
                  questionIndex: index,
                  contentHistory: history,
                  sentenceFrameTier: grade === "K-2" ? sentenceFrameTier : undefined,
                },
              }),
              15000
            );
            if (error) throw error;
            const activity = data as Part2Activity;
            console.log("[Prefetch][Part2] activity", { index, attempt: attempt + 1, type: activity.type });
            if (!validatePart2Activity(activity)) {
              console.error("[Prefetch][Part2] invalid schema", { index, activity });
              throw new Error("Invalid Part2 activity schema");
            }
            return activity;
          } catch (error) {
            console.error(`[Prefetch][Part2] attempt ${attempt + 1} failed for index ${index}`, error);
          }
        }
        return null;
      })
    );

    part2Results.forEach((activity, index) => {
      if (activity) {
        prefetchedPart2Ref.current[index] = activity;
      }
    });

    setMsg?.("Preparing your challenge... 🏆");

    // Generate Part 3 challenge
    const challengeType = grade === "K-2" ? "speed_round" : undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data, error } = await fetchWithTimeout(
          supabase.functions.invoke("generate-part3-challenge", {
            body: {
              grade,
              theme,
              topic,
              forceType: challengeType,
              contentHistory: history,
              weakestDomain: domainScores ? Object.entries(domainScores).sort((a, b) => ((a[1] as number) ?? 100) - ((b[1] as number) ?? 100))[0]?.[0] : undefined,
            },
          }),
          15000
        );
        if (error) throw error;
        console.log("[Prefetch][Part3] challenge", { attempt: attempt + 1, type: (data as any)?.challengeType });
        if (!validatePart3Challenge(data)) {
          console.error("[Prefetch][Part3] invalid schema", data);
          throw new Error("Invalid Part3 challenge schema");
        }
        prefetchedPart3Ref.current = data as Part3Challenge;
        break;
      } catch (error) {
        console.error(`[Prefetch][Part3] attempt ${attempt + 1} failed`, error);
      }
    }

    allPrefetchedRef.current = true;
    console.log("[Prefetch] completed", {
      part2Prefetched: Object.keys(prefetchedPart2Ref.current).length,
      part2Expected: total,
      hasPart3: Boolean(prefetchedPart3Ref.current),
    });
  }, []);

  const retryStep3FromGemini = useCallback(async (): Promise<AnchorSentence | null> => {
    try {
      const { data, error } = await fetchWithTimeout(
        supabase.functions.invoke("generate-anchor-sentence", {
          body: {
            grade: effectiveGradeBand,
            contentHistory,
            forcedTheme: sessionTheme || undefined,
          },
        }),
        6000
      );
      if (error) throw error;

      console.log("[FillInBlanks] Raw Gemini anchor response", data);
      const nextAnchor = data as AnchorSentence;
      if (!nextAnchor?.sentence || !Array.isArray(nextAnchor.keyWords) || nextAnchor.keyWords.length === 0) {
        throw new Error("Anchor response missing sentence/keyWords");
      }
      if (!nextAnchor.topic) nextAnchor.topic = nextAnchor.theme;

      setAnchor(nextAnchor);
      setSessionTheme(nextAnchor.theme);
      setSessionTopic(nextAnchor.topic);
      return nextAnchor;
    } catch (error) {
      console.error("[FillInBlanks] Gemini retry failed", error);
      return null;
    }
  }, [effectiveGradeBand, contentHistory, sessionTheme]);

  const inPart1 = globalStep < 5;
  const inPart2 = globalStep >= 5 && globalStep < 5 + part2Count;
  const inPart3 = globalStep >= 5 + part2Count;

  // ─── Load student info, anchor sentence, and history on mount ───
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setLoadingMessage("Getting your lesson ready... 📚");
      if (!studentId || !sessionId) return;

      let currentStudentName = "";
      let sessionForcedTheme: string | undefined;
      let sessionGradeBand: GradeBand = "3-5";
      let resolvedTheme = "";
      let resolvedTopic = "";
      let computedDomainScores: Record<string, number> | null = null;

      // Read theme from URL query param first (passed from ThemePicker)
      const urlParams = new URLSearchParams(window.location.search);
      const urlTheme = urlParams.get('theme');
      if (urlTheme) {
        sessionForcedTheme = decodeURIComponent(urlTheme);
        console.log("[init] theme from URL param:", sessionForcedTheme);
      }

      try {
        const { data: studentData } = await supabase
          .from("session_students")
          .select("student_name, session_id, theme")
          .eq("id", studentId)
          .single();

        if (studentData) {
          currentStudentName = studentData.student_name;
          setStudentName(studentData.student_name);
          // Only fall back to DB theme if URL param didn't provide one
          if (!sessionForcedTheme) {
            console.log("[init] no URL theme, checking DB:", studentData.theme);
            let studentTheme = studentData.theme;
            if (!studentTheme) {
              await new Promise(r => setTimeout(r, 1000));
              const { data: retryData } = await supabase
                .from("session_students")
                .select("theme")
                .eq("id", studentId)
                .single();
              studentTheme = retryData?.theme;
            }
            if (studentTheme) {
              sessionForcedTheme = studentTheme;
            }
            console.log("[init] sessionForcedTheme from DB:", sessionForcedTheme);
          }
          const { data: sessionData } = await supabase
            .from("sessions")
            .select("teacher_id, grade_band")
            .eq("id", sessionId)
            .single();
          if (sessionData) {
            setTeacherId(sessionData.teacher_id);
            const gb = ((sessionData as any).grade_band || "3-5") as GradeBand;
            sessionGradeBand = gb;
            setGradeBand(gb);
            setEffectiveGradeBand(gb);
          }
        }
      } catch { /* proceed */ }

      // Fetch content history for returning students
      let fetchedHistory: any = null;
      try {
        if (currentStudentName) {
          const { data: historyData } = await supabase
            .from("student_content_history")
            .select("theme, topic, key_vocabulary, vocabulary_results, activity_formats, challenge_type")
            .eq("student_name", currentStudentName)
            .order("session_date", { ascending: false })
            .limit(10);

          if (historyData && historyData.length > 0) {
            fetchedHistory = {
              themes: historyData.map((h: any) => h.theme),
              topics: historyData.map((h: any) => h.topic),
              vocabulary: historyData.flatMap((h: any) => h.key_vocabulary || []).slice(0, 30),
              activityFormats: historyData[0]?.activity_formats || [],
              challengeTypes: historyData.map((h: any) => h.challenge_type).filter(Boolean),
              vocabularyResults: historyData.flatMap((h: any) => h.vocabulary_results || []),
            };
            setContentHistory(fetchedHistory);
          }
        }
      } catch { /* proceed without history */ }

      try {
        const invokeBody = {
          grade: sessionGradeBand,
          contentHistory: fetchedHistory,
          forcedTheme: sessionForcedTheme,
        };
        console.log("[init] invoking generate-anchor-sentence with forcedTheme:", sessionForcedTheme);

        const { data, error } = await supabase.functions.invoke("generate-anchor-sentence", {
          body: invokeBody,
        });
        if (error) throw error;

        let anchorData = data as AnchorSentence;
        if (!anchorData.topic) anchorData.topic = anchorData.theme;

        if (sessionGradeBand === "K-2" && !isValidK2AnchorSentence(anchorData.sentence)) {
          console.warn("Invalid K-2 anchor received. Regenerating...");
          const { data: retryData, error: retryError } = await supabase.functions.invoke("generate-anchor-sentence", {
            body: invokeBody,
          });
          if (retryError) throw retryError;
          const retryAnchor = retryData as AnchorSentence;
          if (!retryAnchor.topic) retryAnchor.topic = retryAnchor.theme;
          if (!isValidK2AnchorSentence(retryAnchor.sentence)) {
            throw new Error("K-2 anchor validation failed after regeneration");
          }
          anchorData = retryAnchor;
        }

        setAnchor(anchorData);
        resolvedTheme = sessionForcedTheme || anchorData.theme;
        resolvedTopic = anchorData.topic;
        setSessionTheme(resolvedTheme);
        setSessionTopic(resolvedTopic);
        setTtsPreloaded(true);
      } catch {
        const fallback: AnchorSentence = sessionGradeBand === "K-2"
          ? {
              sentence: "The dog runs in the park.",
              theme: sessionForcedTheme || "Animals & nature",
              topic: "The dog runs in the park",
              category: "Descriptive language models",
              keyWords: ["dog", "runs", "park"],
            }
          : {
              sentence: "The ancient pyramids of Egypt were built thousands of years ago by skilled workers. They used massive stone blocks that weighed more than an elephant. These incredible structures still stand tall in the desert today.",
              theme: sessionForcedTheme || "Social studies",
              topic: "The building of the ancient pyramids",
              category: "Descriptive language models",
              keyWords: ["ancient", "pyramids", "Egypt", "built", "workers", "stone", "blocks", "elephant", "structures", "desert"],
            };
        setAnchor(fallback);
        setSessionTheme(fallback.theme);
        setSessionTopic(fallback.topic);
        resolvedTheme = fallback.theme;
        resolvedTopic = fallback.topic;
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
              computedDomainScores = pctScores;
              setDomainScores(pctScores);
            }
          }
        }
      } catch { /* use default */ }

      try {
        if (resolvedTheme && resolvedTopic) {
          setLoadingMessage("Building your activities... 🎨");
          await prefetchSessionContent({
            grade: sessionGradeBand,
            theme: resolvedTheme,
            topic: resolvedTopic,
            domainScores: computedDomainScores,
            history: fetchedHistory,
            setMsg: setLoadingMessage,
          });
        }
      } catch (error) {
        console.error("Activity pre-generation failed", error);
      }

      setLoading(false);
    };

    init();
  }, [studentId, sessionId, prefetchSessionContent]);

  useEffect(() => {
    if (studentName && teacherId) {
      gamification.loadData();
      // Load sentence frame tier from student_points
      supabase
        .from("student_points")
        .select("sentence_frame_tier")
        .eq("student_name", studentName)
        .eq("teacher_id", teacherId)
        .maybeSingle()
        .then(({ data }) => {
          if (data && (data as any).sentence_frame_tier) {
            setSentenceFrameTier((data as any).sentence_frame_tier);
          }
        });
    }
  }, [studentName, teacherId]);

  // Auto-play TTS for Step 1 (Listen & Look) — with fallback
  useEffect(() => {
    if (!loading && inPart1 && anchor && tts.isSupported && part1Step === 1) {
      const delay = ttsPreloaded ? 300 : 500;
      const timer = setTimeout(() => tts.speak(anchor.sentence), delay);
      return () => clearTimeout(timer);
    }
  }, [loading, inPart1, part1Step, anchor, ttsPreloaded]);

  // Global cleanup: stop speech recognition on unmount
  useEffect(() => {
    return () => {
      speech.stopListening();
    };
  }, []);

  // Reactive cleanup: kill speech + reset state on every activity/question/part change
  useEffect(() => {
    speech.stopListening();
    speech.resetTranscript();
    setPart1Answer("");
    setPart2Answer("");
    setPart3Answer("");
  }, [globalStep, part1Step, part2Index, part3SpeedIndex]);

  useEffect(() => {
    if (speech.transcript) {
      if (showConclusion) setConclusionAnswer(speech.transcript);
      else if (inPart1) setPart1Answer(speech.transcript);
      else if (inPart2 && part2Activity?.strategy !== "quick_writes") setPart2Answer(speech.transcript);
      else if (inPart3) setPart3Answer(speech.transcript);
    }
  }, [speech.transcript, inPart1, inPart2, inPart3, showConclusion, part2Activity?.strategy]);

  // ─── Save response helper ───
  const saveResponse = async (
    domain: string, question: string, studentAnswer: string,
    correctAnswer: string, isCorrect: boolean, widaLevel: string,
    sessionPart: string, strategy?: string,
    speakingMeta?: { speaking_duration_seconds: number; speaking_full_attempt: boolean }
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
        grade_band: effectiveGradeBand,
        ...(speakingMeta ? speakingMeta : {}),
      } as any);
    } catch { /* non-blocking */ }
  };

  // ─── Part 1 handlers ───
  // Global cleanup: kill speech recognition on any activity transition
  const killSpeech = useCallback(() => {
    if (speech.isListening) {
      speech.stopListening();
    }
    speech.resetTranscript();
  }, [speech]);

  const handlePart1Next = () => {
    tts.stop();
    killSpeech();
    setPart1Answer("");
    setPart1Submitted(false);
    setPart1Feedback(null);
    setPart1ShowSentence(true);

    if (part1Step < 5) {
      setPart1Step((s) => (s + 1) as any);
      setGlobalStep((g) => g + 1);
    } else {
      // Part 1 complete → award badge + grade band auto-adjustment
      gamification.awardBadge("first_word");

      // Auto-adjust grade band based on Part 1 performance
      const totalPossible = part1Scores.sayItTotal + part1Scores.dragDropTotal + part1Scores.memoryMatchTotal + part1Scores.jumbledTotal;
      const totalEarned = part1Scores.sayIt + part1Scores.dragDrop + part1Scores.memoryMatch + part1Scores.jumbled;
      const pct = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 50;

      let newBand = effectiveGradeBand;
      if (gradeBand === "3-5" && pct < 50) {
        newBand = "K-2";
        setEffectiveGradeBand("K-2");
        setGradeBandAdjusted(true);
        console.log("Auto-adjusted student to K-2 band (Part 1 score:", Math.round(pct), "%)");
      } else if (false) {
        // K-2 students placed by teacher must stay K-2 for the full session — no upward adjustment
        newBand = "3-5";
      }

      setGlobalStep(5);
      fetchPart2Activity(0);
    }
  };

  const handleStep1Done = () => {
    setPart1Scores((s) => ({ ...s, listen: true }));
    gamification.addPoints(pts.STEP1_LISTEN, effectiveGradeBand);
    saveResponse("listening", "Listened to anchor passage", "heard", anchor?.sentence || "", true, "Entering", "part1");
    handlePart1Next();
  };

  const handleStep2Submit = () => {
    if (!anchor || !part1Answer.trim()) return;
    const { matched, total } = compareWords(part1Answer, anchor.sentence);
    setPart1Scores((s) => ({ ...s, sayIt: matched, sayItTotal: total }));
    const pct = total > 0 ? matched / total : 0;
    setPart1Feedback("Great job! 🌟");
    setPart1Submitted(true);
    sounds.playCorrect();
    gamification.addPoints(pts.STEP2_SAY_IT, effectiveGradeBand);
    sounds.playPoints();
    if (!hasSpoken) {
      setHasSpoken(true);
      gamification.awardBadge("first_voice");
    }
    const speakingMeta = {
      speaking_duration_seconds: speech.lastDurationSeconds,
      speaking_full_attempt: speech.lastDurationSeconds >= (isK2 ? 2 : 4) && (anchor.keyWords || []).some(kw => part1Answer.toLowerCase().includes(kw.toLowerCase())),
    };
    saveResponse("speaking", `Say It: ${anchor.sentence}`, part1Answer, anchor.sentence, pct >= 0.5, "Entering", "part1", undefined, speakingMeta);
    // Auto-advance after 3 seconds
    setTimeout(() => handlePart1Next(), 3000);
  };

  const handleStep3Complete = (score: { correct: number; total: number }) => {
    setPart1Scores((s) => ({ ...s, dragDrop: score.correct, dragDropTotal: score.total }));
    gamification.addPoints(pts.STEP3_DRAG_DROP, effectiveGradeBand);
    sounds.playPoints();
    saveResponse("reading", "Drag & Drop fill-in-the-blank", `${score.correct}/${score.total}`, "completed", score.correct === score.total, "Entering", "part1");
  };

  const handleStep4Complete = (score: { correct: number; total: number }) => {
    setPart1Scores((s) => ({ ...s, memoryMatch: score.correct, memoryMatchTotal: score.total }));
    gamification.addPoints(pts.STEP4_MEMORY_MATCH, effectiveGradeBand);
    sounds.playPoints();
    saveResponse("reading", "Memory Match", `${score.correct}/${score.total}`, "completed", score.correct === score.total, "Entering", "part1");
  };

  const handleStep5Complete = (correct: boolean) => {
    setPart1Scores((s) => ({ ...s, jumbled: correct ? 1 : 0, jumbledTotal: 1 }));
    if (correct) {
      gamification.addPoints(pts.STEP5_JUMBLED, effectiveGradeBand);
      sounds.playPoints();
    }
    if (!hasWritten) {
      setHasWritten(true);
      gamification.awardBadge("first_writer");
    }
  };



  // ─── Part 2 handlers ───
  const makeFallbackActivity = useCallback((index: number): Part2Activity => ({
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
  }), [sessionTheme, sessionTopic]);

  const fetchPart2Activity = useCallback(async (index: number, retryAttempt = 0) => {
    setPart2Submitted(false);
    setPart2Feedback(null);
    setPart2Answer("");
    killSpeech();
    tts.stop();
    setActivityError(false);

    // Serve instantly from pre-generated cache — no loading screen
    const cachedActivity = prefetchedPart2Ref.current[index];
    if (cachedActivity && retryAttempt === 0) {
      setPart2Activity(cachedActivity);
      setPart2Strategy(cachedActivity.strategy);
      setPart2StrategyReason(cachedActivity.strategyReason || "Pre-generated at session start");
      setActivityRetryCount(0);
      setLoading(false);
      return;
    }

    // Fallback: fetch on-demand if cache miss (shouldn't happen normally)
    setLoading(true);
    setLoadingMessage(retryAttempt > 0 ? "Trying again..." : "Getting your next activity ready...");

    try {
      const { data, error } = await fetchWithTimeout(
        supabase.functions.invoke("generate-part2", {
          body: {
            grade: effectiveGradeBand,
            theme: sessionTheme,
            topic: sessionTopic,
            domainScores,
            questionIndex: index,
            contentHistory,
            sentenceFrameTier: effectiveGradeBand === "K-2" ? sentenceFrameTier : undefined,
          },
        }),
        8000
      );
      if (error) throw error;
      let activity = data as Part2Activity;

      // Content validation
      if (!validatePart2Activity(activity)) {
        console.error("Part 2 content validation failed. Received:", activity);
        throw new Error("Invalid activity content");
      }
      
      // CLIENT-SIDE VALIDATION: Ensure positions 5-6 don't have heavy/complex tasks
      if (index >= 4) {
        const activityText = JSON.stringify(activity).toLowerCase();
        const isHeavy = 
          activity.type === "story_builder" ||
          activityText.includes("4-scene") || activityText.includes("sequential") ||
          activityText.includes("multi-scene") || activityText.includes("organize sentences") ||
          (activityText.includes("scenes") && activityText.includes("order"));
        const sentenceMatch = (activity.question || "").match(/write\s+(\d+)\s+sentence/i);
        const tooManySentences = sentenceMatch && parseInt(sentenceMatch[1]) >= 3;
        
        if (isHeavy || tooManySentences) {
          console.warn(`Position ${index + 1} had heavy activity (type: ${activity.type}) — replacing with light fallback`);
          const isK2 = effectiveGradeBand === "K-2";
          if (index === 5) {
            activity = {
              type: "sentence_completion",
              inputType: isK2 ? "recording" : "typing",
              question: isK2 
                ? `Tell your animal companion: "My favorite thing about ${sessionTopic} is ___!" Say it out loud! 🎤`
                : `Complete this sentence about ${sessionTopic}: "The most interesting thing I learned is _____."`,
              modelAnswer: `The most interesting thing I learned about ${sessionTopic} is how amazing it is!`,
              acceptableKeywords: [sessionTopic.split(" ")[0]?.toLowerCase() || "learned", "interesting", "because"],
              difficulty: 6,
              theme: sessionTheme,
              strategy: activity.strategy || "sentence_frames",
              weakestDomain: activity.weakestDomain || "none",
              strategyReason: "Light ending activity (client fallback)",
            };
          } else {
            activity = {
              type: "true_false",
              inputType: isK2 ? "recording" : "multiple_choice",
              question: `True or False: ${sessionTopic} is something you might find in a story about ${sessionTheme}. Explain why in one sentence.`,
              options: isK2 ? undefined : ["True — it fits the theme!", "False — it doesn't fit.", "True — definitely!", "False — not at all."],
              modelAnswer: isK2 ? "True" : "True — it fits the theme!",
              acceptableKeywords: ["true", "because", sessionTopic.split(" ")[0]?.toLowerCase() || "yes"],
              difficulty: 5,
              theme: sessionTheme,
              strategy: activity.strategy || "sentence_frames",
              weakestDomain: activity.weakestDomain || "none",
              strategyReason: "Wind-down activity (client fallback)",
            };
          }
        }
      }
      
      prefetchedPart2Ref.current[index] = activity;
      setPart2Activity(activity);
      setPart2Strategy(activity.strategy);
      setPart2StrategyReason(activity.strategyReason);
      setActivityRetryCount(0);
      setLoading(false);
    } catch (err) {
      console.error("fetchPart2Activity failed (attempt", retryAttempt + 1, "):", err);
      if (retryAttempt < 2) {
        // Auto-retry silently for validation failures, show error for timeouts on 2nd attempt
        if (retryAttempt === 0) {
          // Silent retry
          fetchPart2Activity(index, retryAttempt + 1);
          return;
        } else {
          // Show error with retry button
          setActivityError(true);
          setActivityRetryCount(retryAttempt + 1);
          setLoading(false);
        }
      } else {
        // 3rd failure — use fallback and move on
        console.warn("Max retries reached, using fallback activity");
        setPart2Activity(makeFallbackActivity(index));
        setPart2Strategy("sentence_frames");
        setPart2StrategyReason("Fallback after retries");
        setActivityRetryCount(0);
        setLoading(false);
      }
    }
  }, [sessionTheme, sessionTopic, domainScores, effectiveGradeBand, contentHistory, makeFallbackActivity]);

  const submitPart2 = (overrideAnswer?: string) => {
    const answerText = overrideAnswer || part2Answer;
    if (!part2Activity || !answerText.trim()) {
      toast.error("Please provide an answer!");
      return;
    }
    if (overrideAnswer) setPart2Answer(overrideAnswer);

    // Quick writes: require at least 2 sentences before accepting
    if (part2Activity.strategy === "quick_writes" || part2Activity.type === "quick_write") {
      const qwSentences = answerText.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
      if (qwSentences.length < 2) {
        toast("Great start! Can you add one more sentence? ✍️");
        return;
      }
    }

    let correct: boolean;
    if (part2Activity.inputType === "multiple_choice" || part2Activity.inputType === "tap" || part2Activity.type === "multiple_choice") {
      // Normalize both sides for comparison
      const normAnswer = answerText.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "");
      const normModel = (part2Activity.modelAnswer || "").toLowerCase().trim().replace(/[^a-z0-9\s]/g, "");
      correct = normAnswer === normModel;
    } else {
      correct = flexibleGrade(answerText, part2Activity.acceptableKeywords || []);
    }
    setPart2IsCorrect(correct);

    // K-2 Sentence Frame tier tracking
    if (effectiveGradeBand === "K-2" && (part2Activity.strategy === "sentence_frames" || part2Activity.type === "sentence_frame")) {
      if (correct) {
        const newCorrect = tierConsecutiveCorrect + 1;
        setTierConsecutiveCorrect(newCorrect);
        setTierConsecutiveWrong(0);
        if (newCorrect >= 3 && sentenceFrameTier < 3) {
          const newTier = sentenceFrameTier + 1;
          setSentenceFrameTier(newTier);
          setTierConsecutiveCorrect(0);
          // Persist tier + reset drops on advancement
          supabase.from("student_points").update({ sentence_frame_tier: newTier, consecutive_tier_drops: 0 } as any)
            .eq("student_name", studentName).eq("teacher_id", teacherId).then(() => {});
          // Save tier history
          supabase.from("student_tier_history" as any).insert({
            student_name: studentName, teacher_id: teacherId, session_id: sessionId, tier: newTier,
          } as any).then(() => {});
        }
      } else {
        const newWrong = tierConsecutiveWrong + 1;
        setTierConsecutiveWrong(newWrong);
        setTierConsecutiveCorrect(0);
        if (newWrong >= 2 && sentenceFrameTier > 1) {
          const newTier = sentenceFrameTier - 1;
          setSentenceFrameTier(newTier);
          setTierConsecutiveWrong(0);
          // Persist tier + increment drops
          supabase.from("student_points").select("consecutive_tier_drops").eq("student_name", studentName).eq("teacher_id", teacherId).maybeSingle().then(({ data }) => {
            const drops = ((data as any)?.consecutive_tier_drops || 0) + 1;
            supabase.from("student_points").update({ sentence_frame_tier: newTier, consecutive_tier_drops: drops } as any)
              .eq("student_name", studentName).eq("teacher_id", teacherId).then(() => {});
          });
          // Save tier history
          supabase.from("student_tier_history" as any).insert({
            student_name: studentName, teacher_id: teacherId, session_id: sessionId, tier: newTier,
          } as any).then(() => {});
        }
      }
    }

    if (correct) {
      setPart2Score((s) => s + 1);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2200);
      sounds.playCorrect();
    } else {
      sounds.playWrong();
    }

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

    // Track activity formats and vocabulary
    if (part2Activity.type) {
      setUsedActivityFormats((prev) => [...new Set([...prev, part2Activity.type])]);
    }
    if (part2Activity.acceptableKeywords) {
      const newWords = part2Activity.acceptableKeywords;
      setUsedVocabulary((prev) => [...new Set([...prev, ...newWords])]);
      newWords.forEach((word) => {
        setVocabularyResults((prev) => [...prev, { word, correct }]);
      });
    }

    if (correct) {
      gamification.addPoints(pts.PART2_ACTIVITY, effectiveGradeBand);
      sounds.playPoints();
    }

    const domainMap: Record<string, string> = {
      sentence_frames: "reading",
      sentence_frame: "reading",
      sentence_expansion: "speaking",
      say_and_expand: "speaking",
      talk_to_companion: "speaking",
      share_your_thoughts: "speaking",
      quick_writes: "writing",
      quick_write: "writing",
      multiple_choice: "reading",
    };
    const domain = domainMap[part2Activity.strategy] || domainMap[part2Activity.type] || "reading";

    // Track quick_writes completions for badge
    if ((part2Activity.strategy === "quick_writes" || part2Activity.type === "quick_write") && effectiveGradeBand === "3-5") {
      quickWriteCountRef.current += 1;
      if (quickWriteCountRef.current >= 3) {
        gamification.awardBadge("quick_writer");
      }
    }

    const isRecordingActivity = part2Activity.inputType === "recording" || part2Activity.inputType === "record_then_type";
    const speakingMeta = isRecordingActivity && speech.lastDurationSeconds > 0 ? {
      speaking_duration_seconds: speech.lastDurationSeconds,
      speaking_full_attempt: speech.lastDurationSeconds >= (isK2 ? 2 : 4) && (part2Activity.acceptableKeywords || []).some(kw => answerText.toLowerCase().includes(kw.toLowerCase())),
    } : undefined;

    saveResponse(
      domain,
      part2Activity.question,
      answerText,
      part2Activity.modelAnswer,
      correct,
      part2Activity.difficulty <= 2 ? "Entering" : part2Activity.difficulty <= 4 ? "Developing" : "Expanding",
      "part2",
      part2Activity.strategy,
      speakingMeta
    );
  };

  const nextPart2 = () => {
    killSpeech();
    tts.stop();
    setShowMotivational(true);
    const nextIdx = part2Index + 1;
    if (nextIdx >= part2Count) {
    setGlobalStep(5 + part2Count);
    setPart3ShowIntro(true);
    fetchPart3Challenge();
    return;
  }
  setPart2Index(nextIdx);
  setGlobalStep(5 + nextIdx);
    fetchPart2Activity(nextIdx);
  };

  // ─── Part 3 handlers ───
  const makeFallbackChallenge = useCallback((): Part3Challenge => ({
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
  }), [sessionTheme, sessionTopic]);

  const fetchPart3Challenge = useCallback(async (retryAttempt = 0) => {
    killSpeech();
    setActivityError(false);

    // Serve instantly from pre-generated cache — no loading screen
    const cachedChallenge = prefetchedPart3Ref.current;
    if (cachedChallenge && retryAttempt === 0) {
      setPart3Challenge(cachedChallenge);
      setActivityRetryCount(0);
      setLoading(false);
      setPart3StartTime(Date.now());
      return;
    }

    // Fallback: fetch on-demand if cache miss
    setLoading(true);
    setLoadingMessage(retryAttempt > 0 ? "Trying again..." : "Preparing your Language Challenge! 🎉");

    try {
      const challengeType = effectiveGradeBand === "K-2" ? "speed_round" : undefined;
      const { data, error } = await fetchWithTimeout(
        supabase.functions.invoke("generate-part3-challenge", {
          body: { grade: effectiveGradeBand, theme: sessionTheme, topic: sessionTopic, forceType: challengeType, contentHistory, weakestDomain: domainScores ? Object.entries(domainScores).sort((a, b) => (a[1] ?? 100) - (b[1] ?? 100))[0]?.[0] : undefined },
        }),
        8000
      );
      if (error) throw error;

      if (!validatePart3Challenge(data)) {
        console.error("Part 3 content validation failed. Received:", data);
        throw new Error("Invalid challenge content");
      }

      prefetchedPart3Ref.current = data as Part3Challenge;
      setPart3Challenge(data as Part3Challenge);
      setActivityRetryCount(0);
      setLoading(false);
      setPart3StartTime(Date.now());
    } catch (err) {
      console.error("fetchPart3Challenge failed (attempt", retryAttempt + 1, "):", err);
      if (retryAttempt < 2) {
        if (retryAttempt === 0) {
          fetchPart3Challenge(retryAttempt + 1);
          return;
        } else {
          setActivityError(true);
          setActivityRetryCount(retryAttempt + 1);
          setLoading(false);
        }
      } else {
        console.warn("Max retries for Part 3, using fallback");
        setPart3Challenge(makeFallbackChallenge());
        setActivityRetryCount(0);
        setLoading(false);
        setPart3StartTime(Date.now());
      }
    }
  }, [sessionTheme, sessionTopic, effectiveGradeBand, contentHistory, makeFallbackChallenge]);

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
    const sentences = part3Answer.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const seqWords = part3Challenge.sequenceWords || ["first", "then", "next", "finally"];
    const usedSeqWords = seqWords.filter((w) => norm.includes(w));
    const hasSequence = usedSeqWords.length >= 2;
    const hasEnoughSentences = sentences.length >= 3;

    if (hasEnoughSentences && hasSequence) {
      // Full points
      gamification.addPoints(pts.CHALLENGE_STORY_COMPLETE + pts.CHALLENGE_STORY_SEQUENCE_BONUS, effectiveGradeBand);
      const feedback = `Amazing story! You used sequence words (${usedSeqWords.join(", ")}) — that's advanced writing! 🌟 +${pts.CHALLENGE_STORY_COMPLETE + pts.CHALLENGE_STORY_SEQUENCE_BONUS} points!`;
      setPart3Feedback(feedback);
      // Award sequence_master badge if 3+ sequence words used
      if (usedSeqWords.length >= 3 && effectiveGradeBand === "3-5") {
        gamification.awardBadge("sequence_master");
      }
    } else {
      // Half points + encouraging feedback
      const halfPoints = Math.round(pts.CHALLENGE_STORY_COMPLETE / 2);
      gamification.addPoints(halfPoints, effectiveGradeBand);
      const tips: string[] = [];
      if (!hasEnoughSentences) tips.push("try writing at least 3 sentences");
      if (!hasSequence) tips.push('use sequence words like "first, then, next, finally"');
      const feedback = `Good effort! Next time, ${tips.join(" and ")} to earn full points! 📝 +${halfPoints} points!`;
      setPart3Feedback(feedback);
    }
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
      gamification.addPoints(pts.CHALLENGE_SPEED_CORRECT, effectiveGradeBand);
      sounds.playCorrect();
      sounds.playPoints();
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2200);
    } else {
      sounds.playWrong();
    }
    setPart3SpeedAnswers((a) => [...a, selectedOption]);

    saveResponse(q.domain, q.question, selectedOption, q.correctAnswer, isCorrect, "Developing", "part3", "speed_round");

    if (part3SpeedIndex < (part3Challenge?.questions?.length ?? 1) - 1) {
      setPart3SpeedIndex((i) => i + 1);
    } else {
      const finalScore = part3SpeedScore + (isCorrect ? 1 : 0);
      const elapsed = Math.round((Date.now() - part3StartTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      setPart3Feedback(`You completed the Speed Round in ${mins}:${secs.toString().padStart(2, "0")}! Score: ${finalScore}/5 🏎️`);
      setPart3Submitted(true);
      setChallengeCompleted("Speed Round");
      // Award speed_star badge for perfect 5/5
      if (finalScore === 5 && effectiveGradeBand === "3-5") {
        gamification.awardBadge("speed_star");
      }
    }
  };

  const submitPart3TeachItBack = () => {
    if (!part3Answer.trim()) {
      toast.error("Please record your explanation!");
      return;
    }
    // For 3-5: require at least 20 words
    if (effectiveGradeBand !== "K-2") {
      const wc = part3Answer.trim().split(/\s+/).length;
      if (wc < 20) {
        toast("Tell me more! Try to explain with at least 2 sentences 🎤");
        return;
      }
    }
    gamification.addPoints(pts.CHALLENGE_TEACH_COMPLETE, effectiveGradeBand);
    const keywords = part3Challenge?.acceptableKeywords || [];
    const norm = part3Answer.toLowerCase();
    const usedWords = keywords.filter((kw) => norm.includes(kw.toLowerCase())).slice(0, 3);
    const feedback = usedWords.length > 0
      ? `Amazing! You explained ${sessionTopic} really well. You used these great words: ${usedWords.join(", ")}! 🎤🌟 +${pts.CHALLENGE_TEACH_COMPLETE} points!`
      : `Great job explaining ${sessionTopic}! Keep using topic vocabulary to make your explanations even stronger! 🎤 +${pts.CHALLENGE_TEACH_COMPLETE} points!`;
    setPart3Feedback(feedback);
    setPart3Submitted(true);
    setChallengeCompleted("Teach It Back");
    saveResponse("speaking", "Part 3: Teach It Back", part3Answer, sessionTopic, true, "Expanding", "part3", "teach_it_back");
  };

  const finishSession = async () => {
    sounds.playSessionComplete();
    gamification.addPoints(pts.SESSION_COMPLETE, effectiveGradeBand);
    gamification.completeSession({
      gradeBand: effectiveGradeBand,
      part2Score: part2Score,
      part2Count: part2Count,
      domainScores: domainScores || undefined,
    });
    if (domainScores) {
      for (const [domain, pct] of Object.entries(domainScores)) {
        if (pct >= 80) {
          gamification.addPoints(pts.DOMAIN_80_BONUS, effectiveGradeBand);
          // Award domain_ace badge for 3-5 students
          if (effectiveGradeBand === "3-5") {
            gamification.awardBadge("domain_ace");
          }
          break;
        }
      }
    }

    // Save content history
    try {
      const isBaseline = !contentHistory;
      await supabase.from("student_content_history").insert({
        student_name: studentName,
        teacher_id: teacherId,
        session_id: sessionId,
        theme: sessionTheme,
        topic: sessionTopic,
        key_vocabulary: usedVocabulary.concat(anchor?.keyWords || []),
        vocabulary_results: { ...vocabularyResults as any, part2Score, part2Count },
        activity_formats: usedActivityFormats,
        challenge_type: challengeCompleted?.toLowerCase().replace(/ /g, "_") || null,
        grade_band: effectiveGradeBand,
        is_baseline: isBaseline,
      } as any);
    } catch (e) {
      console.error("Failed to save content history:", e);
    }

    setSessionEnded(true);
  };

  // ─── K-2 feeling rating state ───
  const [showFeelingRating, setShowFeelingRating] = useState(false);
  const [feelingRatings, setFeelingRatings] = useState<number[]>([]);
  const [showResults, setShowResults] = useState(false);

  // ─── Badge/Leaderboard screens ───
  if (showView === "badges") {
    return <BadgeCollection earnedBadgeIds={gamification.earnedBadgeIds} onBack={() => setShowView("session")} />;
  }
  if (showView === "leaderboard") {
    return <Leaderboard teacherId={teacherId} currentStudentName={studentName} onBack={() => setShowView("session")} />;
  }

  // ─── Session ended — FULL CELEBRATION SCREEN (2 phases) ───

  if (sessionEnded) {
    // Force dark background on body to prevent ThemePageWrapper bleed-through
    document.body.style.background = '#0f0f1a';

    try {
    const animalLevel = effectiveGradeBand === "3-5" ? getAnimalLevel35(gamification.totalPoints) : getAnimalLevel(gamification.totalPoints);
    const nextLevel = effectiveGradeBand === "3-5" ? getNextLevel35(gamification.totalPoints) : getNextLevel(gamification.totalPoints);

    // Safety: if animalLevel is undefined, show a simple completion screen instead of white screen
    if (!animalLevel) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-6" style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}>
          <div className="text-[100px] leading-none">🎉</div>
          <h1 className="text-4xl font-bold text-white">Great job! You finished!</h1>
          <p className="text-xl text-blue-300 font-semibold">{studentName}</p>
          <p className="text-3xl font-bold text-yellow-400">+{gamification.sessionPoints} ⭐</p>
          <p className="text-gray-300">Total: <span className="font-bold text-white">{gamification.totalPoints} points</span></p>
          <Button variant="hero" size="lg" className="w-full max-w-xs text-xl py-7" onClick={() => navigate("/student/join")}>
            Done ✅
          </Button>
        </div>
      );
    }
    const totalActivities = 5 + part2Count + 1; // Part1(5) + Part2 + Part3(1)

    if (!showResults) {
      // ─── Phase 1: Full-screen celebration ───
      return (
        <div className="min-h-screen relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}>
          {/* Confetti background */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {["🌟", "⭐", "🎉", "✨", "💫", "🏆", "🎊", "💪", "🌈", "🎶", "🔥", "💎"].map((emoji, i) => (
              <span
                key={i}
                className="absolute text-2xl"
                style={{
                  left: `${5 + (i * 8) % 90}%`,
                  top: `${-10}%`,
                  animation: `confetti-fall ${2 + (i % 3)}s ease-in ${i * 0.15}s forwards`,
                }}
              >
                {emoji}
              </span>
            ))}
          </div>

          <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-6">
            <div className="w-full max-w-sm space-y-6 text-center">
              {/* Heading */}
              <div className="animate-fade-in">
                <h1 className="text-4xl font-bold text-white mb-2">You did it! 🎉</h1>
                <p className="text-xl text-blue-300 font-semibold">{studentName}</p>
              </div>

              {/* Animal companion — large and pulsing */}
              <div className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
                <div className="text-[100px] leading-none" style={{ animation: "loading-pulse 2s ease-in-out infinite" }}>
                  {animalLevel.emoji}
                </div>
                <p className="text-sm text-gray-400 mt-2">{animalLevel.name}</p>
              </div>

              {/* Points total */}
              <div className="animate-fade-in" style={{ animationDelay: "0.4s" }}>
                <p className="text-5xl font-bold text-yellow-400" style={{ animation: "loading-pulse 2s ease-in-out infinite" }}>
                  +{gamification.sessionPoints} ⭐
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  Total: <span className="font-bold text-white">{gamification.totalPoints} points</span>
                </p>
                {nextLevel && (
                  <p className="text-xs text-gray-400 mt-1">
                    {nextLevel.min - gamification.totalPoints} pts to {nextLevel.emoji} {nextLevel.name}!
                  </p>
                )}
              </div>

              {/* Badges earned this session */}
              {gamification.earnedBadgeIds.length > 0 && (
                <div className="animate-fade-in" style={{ animationDelay: "0.6s" }}>
                  <p className="text-sm font-medium text-white mb-2">🎖️ Badges Earned</p>
                  <div className="flex flex-wrap gap-3 justify-center">
                    {gamification.earnedBadgeIds.map((id) => {
                      const badge = BADGES_LOOKUP[id];
                      return badge ? (
                        <div key={id} className="flex flex-col items-center gap-1 rounded-lg px-3 py-2 border" style={{ background: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.15)" }}>
                          <span className="text-3xl">{badge.icon}</span>
                          <span className="text-[10px] text-gray-400">{badge.name}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              {/* See My Results button */}
              <div className="animate-fade-in pt-4" style={{ animationDelay: "0.8s" }}>
                <Button
                  variant="hero"
                  size="lg"
                  className="w-full text-xl py-7"
                  onClick={() => setShowResults(true)}
                >
                  See My Results 📊
                </Button>
              </div>
            </div>
          </div>

          {/* Confetti fall keyframes */}
          <style>{`
            @keyframes confetti-fall {
              0% { transform: translateY(0) rotate(0deg); opacity: 1; }
              100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
            }
          `}</style>

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

    // ─── Phase 2: Results summary ───
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}>
        <div className="w-full max-w-md space-y-6 animate-fade-in">
          <Card className="border" style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.15)" }}>
            <CardContent className="py-8 space-y-6">
              <div className="text-center">
                <div className="text-6xl mb-3">{animalLevel.emoji}</div>
                <h2 className="text-2xl font-bold text-white">
                  Great job today, {studentName}! 🌟
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl p-4 text-center border" style={{ background: "rgba(234,179,8,0.15)", borderColor: "rgba(234,179,8,0.25)" }}>
                  <p className="text-3xl font-bold text-yellow-400">{gamification.sessionPoints}</p>
                  <p className="text-xs text-gray-400 mt-1">Points Earned</p>
                </div>
                <div className="rounded-xl p-4 text-center border" style={{ background: "rgba(59,130,246,0.15)", borderColor: "rgba(59,130,246,0.25)" }}>
                  <p className="text-3xl font-bold text-blue-400">{totalActivities}</p>
                  <p className="text-xs text-gray-400 mt-1">Activities Done</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg p-3 text-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <p className="text-[10px] text-gray-400">Builder</p>
                  <p className="text-xl font-bold text-blue-400">✓</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <p className="text-[10px] text-gray-400">Practice</p>
                  <p className="text-xl font-bold text-teal-400">{part2Score}/{part2Count}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <p className="text-[10px] text-gray-400">Challenge</p>
                  <p className="text-xl font-bold text-green-400">✓</p>
                </div>
              </div>

              {gamification.earnedBadgeIds.length > 0 && (
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-2">Badges</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {gamification.earnedBadgeIds.map((id) => {
                      const badge = BADGES_LOOKUP[id];
                      return badge ? (
                        <span key={id} className="text-2xl" title={badge.name}>{badge.icon}</span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setShowView("badges")} className="gap-2">
                <Award className="h-4 w-4" /> My Badges
              </Button>
              <Button variant="outline" onClick={() => setShowView("leaderboard")} className="gap-2">
                <Users className="h-4 w-4" /> Leaderboard
              </Button>
            </div>
            <Button variant="hero" onClick={() => navigate("/student/join")} className="w-full text-lg py-6">
              Done ✅
            </Button>
          </div>
        </div>

        <PointsAnimation points={gamification.lastPointsEarned} show={gamification.showPointsAnim} onDone={() => gamification.setShowPointsAnim(false)} />
        {gamification.evolutionData && (
          <EvolutionCelebration show={true} animalEmoji={gamification.evolutionData.emoji} animalName={gamification.evolutionData.name} onClose={() => gamification.setEvolutionData(null)} />
        )}
        {gamification.pendingBadge && (
          <BadgePopup show={true} badgeIcon={gamification.pendingBadge.icon} badgeName={gamification.pendingBadge.name} onClose={() => gamification.setPendingBadge(null)} />
        )}
      </div>
    );
    } catch (celebrationError) {
      console.error("Celebration screen error:", celebrationError);
      return (
        <div style={{minHeight:'100vh', background:'#1a1a2e', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'24px'}}>
          <div style={{fontSize:'80px'}}>🎉</div>
          <h1 style={{color:'white', fontSize:'32px'}}>You did it, {studentName}!</h1>
          <p style={{color:'#aaa', fontSize:'20px'}}>{gamification.sessionPoints} points earned!</p>
          <button style={{background:'#6366f1', color:'white', padding:'16px 32px', borderRadius:'12px', fontSize:'20px', border:'none', cursor:'pointer'}} onClick={() => navigate('/student/join')}>Done ✅</button>
        </div>
      );
    }
  }

  // ─── Progress label ───
  const getProgressLabel = () => {
    if (isK2) {
      // Star-based progress for K-2
      const filled = globalStep + 1;
      const stars = Array.from({ length: totalSteps }, (_, i) => i < filled ? "⭐" : "☆");
      // Show max 8 stars for visual clarity
      const visibleStars = totalSteps > 8 
        ? stars.filter((_, i) => i % Math.ceil(totalSteps / 8) === 0 || i === totalSteps - 1).slice(0, 8)
        : stars;
      return visibleStars.join("");
    }
    if (inPart1) return `Part 1 • Step ${part1Step}/5`;
    if (inPart2) return `Part 2 • Activity ${part2Index + 1}/${part2Count}`;
    return "Part 3 • Challenge";
  };

  const isK2 = effectiveGradeBand === "K-2";


  const handleFeelingSelect = (feeling: number) => {
    setFeelingRatings(prev => [...prev, feeling]);
    setShowFeelingRating(false);
  };

  // ─── Main render ───
  return (
    <ThemePageWrapper theme={sessionTheme}>
    <div className={`min-h-screen ${isK2 ? "text-2xl leading-relaxed" : ""}`}>
      {/* Top bar */}
      <div className="border-b border-white/10 bg-black/30 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-white/80" />
            <span className="font-bold text-white">ElbridgeAI</span>
          </div>
          <div className="flex items-center gap-3">
            {gamification.loaded && (
              <ThemedCompanionGlow theme={sessionTheme}>
                <AnimalCompanion points={gamification.totalPoints} studentName={studentName} compact={!isK2} />
              </ThemedCompanionGlow>
            )}
            <button
              onClick={sounds.toggleMute}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
              title={sounds.muted ? "Unmute sounds" : "Mute sounds"}
            >
              {sounds.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <button onClick={() => setShowView("badges")} className="text-xs px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80 flex items-center gap-1">
                <Award className="h-3 w-3" /> Badges
              </button>
              <button onClick={() => setShowView("leaderboard")} className="text-xs px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80 flex items-center gap-1">
                <Users className="h-3 w-3" /> Rank
              </button>
            </div>
          </div>
        </div>
        {sessionTopic && (
          <div className="px-4 py-1 border-b border-white/5" style={{ background: getThemeStyles(sessionTheme).topicBannerBg }}>
            <p className={`text-center font-medium ${isK2 ? "text-base" : "text-xs"}`} style={{ color: getThemeStyles(sessionTheme).topicBannerText }}>
              📚 Today's Topic: <span className="font-bold">{sessionTopic}</span>
            </p>
          </div>
        )}
        <div className="px-4 pb-2 pt-1">
          <div className="flex items-center gap-2">
            {isK2 ? (
              <span className="text-sm text-white/80 whitespace-nowrap tracking-wider">{getProgressLabel()}</span>
            ) : (
              <>
                <span className="text-xs text-white/60 whitespace-nowrap">{getProgressLabel()}</span>
                <Progress value={((globalStep + 1) / totalSteps) * 100} className="flex-1" />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Animal Companion Profile Card — all grade bands */}
      {!loading && gamification.loaded && (
        <div className="flex justify-center py-4">
          <div className={`text-center ${isK2 ? "animate-bounce-slow" : "animate-bounce-fast"}`}>
            <AnimalCompanion points={gamification.totalPoints} studentName={studentName} compact={false} />
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {loading ? (
          <SessionLoadingScreen studentName={studentName} theme={sessionTheme} />
        ) : (
          <>
            <div className="p-1">
              {inPart1 && anchor ? (
                <Part1View
                  step={part1Step}
                  anchor={anchor}
                  tts={tts}
                  speech={speech}
                  part1Answer={part1Answer}
                  setPart1Answer={setPart1Answer}
                  part1Submitted={part1Submitted}
                  part1Feedback={part1Feedback}
                  onStep1Done={handleStep1Done}
                  onStep2Submit={handleStep2Submit}
                  onStep3Complete={handleStep3Complete}
                  onStep4Complete={handleStep4Complete}
                  onStep5Complete={handleStep5Complete}
                  onNext={handlePart1Next}
                  onRetryFillBlanks={retryStep3FromGemini}
                  isK2={isK2}
                />
               ) : inPart2 && part2Activity ? (
                <ActivityErrorBoundary onSkip={nextPart2} isK2={isK2} key={`part2-eb-${part2Index}`}>
                  <>
                    <Part2StrategyView
                      activity={part2Activity}
                      index={part2Index}
                      totalActivities={part2Count}
                      answer={part2Answer}
                      setAnswer={setPart2Answer}
                      submitted={part2Submitted}
                      feedback={part2Feedback}
                      isCorrect={part2IsCorrect}
                      speech={speech}
                      tts={tts}
                      onSubmit={(overrideAnswer?: string) => submitPart2(overrideAnswer)}
                      onSubmitMC={(option: string) => submitPart2(option)}
                      onNext={nextPart2}
                      isK2={isK2}
                      sentenceFrameTier={sentenceFrameTier}
                      sounds={sounds}
                      anchor={anchor}
                      gradeBand={effectiveGradeBand}
                    />
                    {/* K-2 Feeling Rating */}
                    {isK2 && part2Submitted && !showFeelingRating && (
                      <div className="mt-6 text-center">
                        <p className="text-lg font-medium text-white/80 mb-3">How did that feel?</p>
                        <div className="flex justify-center gap-6">
                          {[
                            { emoji: "😕", label: "Hard", value: 1 },
                            { emoji: "😐", label: "Okay", value: 2 },
                            { emoji: "😊", label: "Easy!", value: 3 },
                          ].map(({ emoji, label, value }) => (
                            <button
                              key={value}
                              onClick={() => handleFeelingSelect(value)}
                              className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-white/10 transition-all hover:scale-110 active:scale-95"
                            >
                              <span className="text-5xl">{emoji}</span>
                              <span className="text-sm text-white/60">{label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                </ActivityErrorBoundary>
              ) : inPart2 && !part2Activity ? (
                <Card className="card-shadow border-border">
                  <CardContent className="py-12 text-center space-y-4">
                    {activityError ? (
                      <>
                        <p className={`${isK2 ? "text-4xl" : "text-3xl"}`}>😅</p>
                        <p className={`font-medium ${isK2 ? "text-xl" : "text-lg"} text-foreground`}>
                          Oops! Something didn't load.
                        </p>
                        <Button
                          variant="hero"
                          className={isK2 ? "text-lg py-4" : ""}
                          onClick={() => fetchPart2Activity(part2Index, activityRetryCount)}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" /> Try Again 🔄
                        </Button>
                      </>
                    ) : isK2 ? (
                      <>
                        <div className="animate-bounce-slow">
                          <AnimalCompanion points={gamification.totalPoints} studentName={studentName} compact={false} />
                        </div>
                        <p className="text-xl text-muted-foreground">Getting ready... 🐣</p>
                      </>
                    ) : (
                      <>
                        <Loader2 className="h-10 w-10 text-primary mx-auto animate-spin" />
                        <p className="text-muted-foreground">Loading your activity...</p>
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : inPart3 ? (
                part3ShowIntro ? (
                  <Card className="card-shadow border-border text-center">
                    <CardContent className="pt-8 pb-8 space-y-6">
                      <Sparkles className={`${isK2 ? "h-20 w-20" : "h-16 w-16"} text-warning mx-auto`} />
                      <h2 className={`${isK2 ? "text-3xl" : "text-2xl"} font-bold text-foreground`}>🎉 Almost done!</h2>
                      <p className={`${isK2 ? "text-xl" : "text-lg"} text-muted-foreground`}>Time for your Language Challenge!</p>
                      <p className={`${isK2 ? "text-base" : "text-sm"} text-muted-foreground`}>One fun final activity about <span className="font-bold text-primary">{sessionTopic}</span></p>
                      <Button variant="hero" size="lg" className={`w-full ${isK2 ? "text-xl py-8" : ""}`} onClick={startPart3}>
                        Let's Go! 🚀
                      </Button>
                    </CardContent>
                  </Card>
                ) : part3Submitted && part3Feedback && !showConclusion ? (
                  // Part 3 done → show conclusion section
                  (() => {
                    // Trigger conclusion on first render
                    if (!showConclusion) {
                      setTimeout(() => setShowConclusion(true), 600);
                    }
                    return (
                      <div className="flex flex-col items-center justify-center py-16 space-y-4 animate-fade-in">
                        <Trophy className="h-16 w-16 text-warning animate-bounce" />
                        <h2 className="text-2xl font-bold text-foreground">Challenge Complete! 🎉</h2>
                        <p className="text-muted-foreground">One more thing...</p>
                      </div>
                    );
                  })()
                ) : showConclusion ? (
                  <ConclusionView
                    step={conclusionStep}
                    answer={conclusionAnswer}
                    setAnswer={setConclusionAnswer}
                    submitted={conclusionSubmitted}
                    nudgeShown={conclusionNudgeShown}
                    reaction={conclusionReaction}
                    sessionTopic={sessionTopic}
                    anchor={anchor}
                    speech={speech}
                    tts={tts}
                    isK2={isK2}
                    pts={pts}
                    gamification={gamification}
                    sounds={sounds}
                    onSubmit={(stepNum) => {
                      const minDuration = isK2 ? 2 : 4;
                      const keywords = anchor?.keyWords || [];
                      const transcript = conclusionAnswer.toLowerCase();
                      const hasKeyword = keywords.some(kw => transcript.includes(kw.toLowerCase()));
                      const hasDuration = speech.lastDurationSeconds >= minDuration;

                      if (!hasDuration && !hasKeyword && !conclusionNudgeShown) {
                        setConclusionNudgeShown(true);
                        speech.resetTranscript();
                        setConclusionAnswer("");
                        return;
                      }

                      setConclusionSubmitted(true);
                      const strategy = stepNum === 1 ? "conclusion_express" : "conclusion_level_up";
                      const points = stepNum === 1 ? pts.CONCLUSION_EXPRESS : pts.CONCLUSION_LEVEL_UP;
                      gamification.addPoints(points, effectiveGradeBand);
                      sounds.playCorrect();
                      sounds.playPoints();

                      const speakingMeta = {
                        speaking_duration_seconds: speech.lastDurationSeconds,
                        speaking_full_attempt: hasDuration && hasKeyword,
                      };
                      saveResponse("speaking", `Conclusion Step ${stepNum}: ${sessionTopic}`, conclusionAnswer, sessionTopic, true, "Developing", "conclusion", strategy, speakingMeta);

                      const reactionMsg = stepNum === 1
                        ? (isK2 ? "WOW! You're amazing! 🐣⭐" : "Incredible! You just taught ME something! 🌟")
                        : (isK2 ? "YOU DID IT! I'm so proud of you! 🎉🐣" : "That was your best sentence yet! You're a language superstar! 🏆");
                      setConclusionReaction(reactionMsg);

                      const advanceDelay = stepNum === 1 ? 1500 : 2000;
                      setTimeout(() => {
                        if (stepNum === 1) {
                          setConclusionStep(2);
                          setConclusionAnswer("");
                          setConclusionSubmitted(false);
                          setConclusionNudgeShown(false);
                          setConclusionReaction(null);
                          speech.resetTranscript();
                        } else {
                          finishSession();
                        }
                      }, advanceDelay);
                    }}
                  />
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
                ) : (
                  <Card className="card-shadow border-border">
                    <CardContent className="py-12 text-center space-y-4">
                      {activityError ? (
                        <>
                          <p className={`${isK2 ? "text-4xl" : "text-3xl"}`}>😅</p>
                          <p className={`font-medium ${isK2 ? "text-xl" : "text-lg"} text-foreground`}>
                            Oops! Something didn't load.
                          </p>
                          <Button
                            variant="hero"
                            className={isK2 ? "text-lg py-4" : ""}
                            onClick={() => fetchPart3Challenge(activityRetryCount)}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" /> Try Again 🔄
                          </Button>
                        </>
                      ) : isK2 ? (
                        <>
                          <div className="animate-bounce-slow">
                            <AnimalCompanion points={gamification.totalPoints} studentName={studentName} compact={false} />
                          </div>
                          <p className="text-xl text-muted-foreground">Getting ready... 🐣</p>
                        </>
                      ) : (
                        <>
                          <Loader2 className="h-10 w-10 text-primary mx-auto animate-spin" />
                          <p className="text-muted-foreground">Loading your challenge...</p>
                        </>
                      )}
                    </CardContent>
                  </Card>
                )
              ) : null}
            </div>
          </>
        )}
      </main>

      <ConfettiCelebration show={showConfetti} theme={sessionTheme} />
      <MotivationalBanner show={showMotivational} theme={sessionTheme} onDone={() => setShowMotivational(false)} />

      <PointsAnimation points={gamification.lastPointsEarned} show={gamification.showPointsAnim} onDone={() => gamification.setShowPointsAnim(false)} />
      {gamification.evolutionData && (
        <EvolutionCelebration show={true} animalEmoji={gamification.evolutionData.emoji} animalName={gamification.evolutionData.name} onClose={() => gamification.setEvolutionData(null)} />
      )}
      {gamification.pendingBadge && (
        <BadgePopup show={true} badgeIcon={gamification.pendingBadge.icon} badgeName={gamification.pendingBadge.name} onClose={() => gamification.setPendingBadge(null)} />
      )}
    </div>
    </ThemePageWrapper>
  );
};

// ═══════════════════════════════════════════════
// Part 1 — Literacy Squared (5 steps)
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
  onStep1Done: () => void;
  onStep2Submit: () => void;
  onStep3Complete: (score: { correct: number; total: number }) => void;
  onStep4Complete: (score: { correct: number; total: number }) => void;
  onStep5Complete: (correct: boolean) => void;
  onNext: () => void;
  onRetryFillBlanks: () => Promise<AnchorSentence | null>;
  isK2?: boolean;
}

function generateMemoryPairs(anchor: AnchorSentence, isK2?: boolean): { words: string[]; matches: string[] } {
  const keyWords = (anchor.keyWords || []).filter(w => w.length > 2);
  const pairCount = isK2 ? 3 : 4;
  const selected = keyWords.slice(0, pairCount);
  const sentenceWords = anchor.sentence.split(/\s+/).map(w => w.replace(/[^a-zA-Z']/g, "")).filter(w => w.length > 3 && !selected.map(s => s.toLowerCase()).includes(w.toLowerCase()));
  while (selected.length < pairCount && sentenceWords.length > 0) selected.push(sentenceWords.shift()!);
  while (selected.length < pairCount) selected.push(selected[selected.length - 1] || "word");
  if (isK2) {
    // Both cards show the same word: one plain, one bold colored — matching compares the word string
    return { words: selected, matches: selected.map(w => w) };
  }
  return { words: selected, matches: selected.map(w => `means "${w}"`) };
}

function WordTTSChips({ sentence, tts, isK2 }: { sentence: string; tts: ReturnType<typeof useTTS>; isK2: boolean }) {
  const [speakingWord, setSpeakingWord] = useState<number | null>(null);
  const words = sentence.split(/\s+/).filter(Boolean);

  const handleTap = (word: string, index: number) => {
    const clean = word.replace(/[.,!?;:"""''()]/g, "");
    if (!clean) return;
    setSpeakingWord(index);
    tts.speak(clean);
    setTimeout(() => setSpeakingWord(null), 800);
  };

  return (
    <div className="space-y-1">
      <p className={`${isK2 ? "text-base" : "text-xs"} text-muted-foreground font-medium`}>
        {isK2 ? "Tap a word to hear it! 👆" : "Tap any word to hear it again:"}
      </p>
      <div className="flex flex-wrap gap-2">
        {words.map((word, i) => (
          <button
            key={i}
            onClick={() => handleTap(word, i)}
            className={`rounded-full bg-primary/10 text-primary border border-primary/20 font-medium transition-all cursor-pointer hover:bg-primary/20 ${
              isK2 ? "text-lg min-h-[48px] px-4" : "text-sm px-3 py-1.5"
            } ${speakingWord === i ? "animate-pulse ring-2 ring-primary/40" : ""}`}
          >
            {word}
          </button>
        ))}
      </div>
    </div>
  );
}

function Part1View({
  step, anchor, tts, speech, part1Answer, setPart1Answer,
  part1Submitted, part1Feedback, onStep1Done, onStep2Submit,
  onStep3Complete, onStep4Complete, onStep5Complete, onNext, onRetryFillBlanks, isK2,
}: Part1Props) {
  const sounds = useSounds();
  const [blanks, setBlanks] = useState<{ blanked: string; missingWords: string[]; wordBank: string[] } | null>(null);
  const [step3Status, setStep3Status] = useState<"loading" | "ready" | "failed">("loading");
  const [step3RetryCount, setStep3RetryCount] = useState(0);
  const [showStep3WaitState, setShowStep3WaitState] = useState(false);
  const [jumble, setJumble] = useState<{ original: string; correctWords: string[]; jumbled: string[] } | null>(null);
  const [jumbleAnswer, setJumbleAnswer] = useState("");
  const [jumbleSubmitted, setJumbleSubmitted] = useState(false);
  const [jumbleTappedWords, setJumbleTappedWords] = useState<string[]>([]);
  const [jumbleIsCorrect, setJumbleIsCorrect] = useState<boolean | null>(null);
  const [jumbleAttempts, setJumbleAttempts] = useState(0);
  const [jumbleShake, setJumbleShake] = useState(false);
  const [jumbleTryAgainMsg, setJumbleTryAgainMsg] = useState<string | null>(null);
  const [usedJumbleIndices, setUsedJumbleIndices] = useState<Set<number>>(new Set());

  // Speaking nudge state for Step 2 (Say It)
  const [speakingNudgeMsg, setSpeakingNudgeMsg] = useState<string | null>(null);
  const [speakingAttemptCount, setSpeakingAttemptCount] = useState(0);

  // Reset nudge on step change
  useEffect(() => {
    setSpeakingNudgeMsg(null);
    setSpeakingAttemptCount(0);
  }, [step]);

  const handleStep2WithNudge = useCallback(() => {
    // Only gate if speech recognition was used (not typed)
    if (speech.isSupported && speech.lastDurationSeconds > 0) {
      const minDuration = isK2 ? 2 : 4;
      const keywords = anchor.keyWords || [];
      const transcript = part1Answer.toLowerCase();
      const hasKeyword = keywords.some(kw => transcript.includes(kw.toLowerCase()));
      const hasMinDuration = speech.lastDurationSeconds >= minDuration;

      if (!hasMinDuration && !hasKeyword && speakingAttemptCount === 0) {
        setSpeakingAttemptCount(1);
        setSpeakingNudgeMsg(
          isK2 ? "Try again — say the whole sentence! 🎤" : "Give it another try — say the full sentence! 🎤"
        );
        // Reset transcript so they can try again
        speech.resetTranscript();
        setPart1Answer("");
        return;
      }
    }
    setSpeakingNudgeMsg(null);
    onStep2Submit();
  }, [speech, isK2, anchor, part1Answer, speakingAttemptCount, onStep2Submit, setPart1Answer]);

  const prepareStep3Content = useCallback(async (attempt = 0, sourceAnchor?: AnchorSentence) => {
    const anchorToUse = sourceAnchor || anchor;
    setStep3Status("loading");
    setShowStep3WaitState(false);

    const waitTimer = setTimeout(() => {
      setShowStep3WaitState(true);
    }, 6000);

    try {
      const generated = generateBlanks(anchorToUse.sentence, anchorToUse.keyWords || [], isK2);
      const rawFillPayload = {
        sentence: generated.blanked,
        blanks: generated.missingWords.map((_, index) => ({ index })),
        answers: generated.missingWords,
        wordBank: generated.wordBank,
      };
      console.log("[FillInBlanks] raw payload", rawFillPayload);

      const normalized = normalizeFillInBlankPayload(rawFillPayload);
      if (!normalized) {
        throw new Error("Invalid fill-in payload schema");
      }

      setBlanks(normalized);
      setStep3Status("ready");
      setStep3RetryCount(0);
    } catch (error) {
      console.error("[FillInBlanks] step 3 content generation failed", { attempt: attempt + 1, error });
      if (attempt < 1) {
        setStep3RetryCount(attempt + 1);
        setShowStep3WaitState(true);
        setTimeout(async () => {
          const regeneratedAnchor = await onRetryFillBlanks();
          await prepareStep3Content(attempt + 1, regeneratedAnchor || anchorToUse);
        }, 3000);
      } else {
        setStep3Status("failed");
      }
    } finally {
      clearTimeout(waitTimer);
    }
  }, [anchor, isK2, onRetryFillBlanks]);

  // Reset jumble state when anchor changes
  useEffect(() => {
    if (anchor?.sentence) {
      setJumble(jumbleSentence(anchor.sentence));
      setJumbleAnswer("");
      setJumbleSubmitted(false);
      setJumbleTappedWords([]);
      setJumbleIsCorrect(null);
      setJumbleAttempts(0);
      setJumbleShake(false);
      setJumbleTryAgainMsg(null);
      setUsedJumbleIndices(new Set());
    }
  }, [anchor]);

  useEffect(() => {
    if (step !== 3) return;
    prepareStep3Content(0);
  }, [step, anchor, prepareStep3Content]);

  // K-2: Tap a chip to add to build area
  const handleChipTap = (word: string, index: number) => {
    if (!isK2 || jumbleSubmitted) return;
    const newTapped = [...jumbleTappedWords, word]; // already lowercase from jumbleSentence
    setJumbleTappedWords(newTapped);
    setJumbleAnswer(newTapped.join(" "));
    setUsedJumbleIndices((prev) => new Set([...prev, index]));
  };

  // K-2: Tap a chip in the build area to remove it and return to the chip row
  const handleBuildChipRemove = (buildIndex: number) => {
    if (jumbleSubmitted || !jumble) return;
    const removedWord = jumbleTappedWords[buildIndex];
    const originalIndex = jumble.jumbled.findIndex(
      (w, i) => w === removedWord && usedJumbleIndices.has(i)
    );
    const newTapped = jumbleTappedWords.filter((_, i) => i !== buildIndex);
    setJumbleTappedWords(newTapped);
    setJumbleAnswer(newTapped.join(" "));
    if (originalIndex !== -1) {
      setUsedJumbleIndices((prev) => {
        const next = new Set(prev);
        next.delete(originalIndex);
        return next;
      });
    }
  };

  // Submit jumbled sentence — strict index-by-index word array comparison
  const handleJumbleSubmit = () => {
    if (!jumble) return;

    const studentWords = isK2
      ? jumbleTappedWords.map(normalizeWord).filter(Boolean)
      : sentenceToWords(jumbleAnswer);

    const isCorrect = isExactWordOrderMatch(studentWords, jumble.correctWords);

    if (!isCorrect) {
      // WRONG — award 0 points
      const newAttempts = jumbleAttempts + 1;
      setJumbleAttempts(newAttempts);
      sounds.playWrong();

      if (newAttempts >= MAX_WRONG_ATTEMPTS) {
        // 2nd wrong: reveal answer, show Next button
        setJumbleIsCorrect(false);
        setJumbleSubmitted(true);
        setJumbleTryAgainMsg(null);
        onStep5Complete(false);
      } else {
        // 1st wrong: shake + try again, tiles stay visible
        setJumbleShake(true);
        setJumbleTryAgainMsg("Try again! 🌟");
        setTimeout(() => {
          setJumbleShake(false);
          setJumbleTappedWords([]);
          setJumbleAnswer("");
          setUsedJumbleIndices(new Set());
        }, 800);
      }
      return;
    }

    // CORRECT — award points
    setJumbleIsCorrect(true);
    setJumbleSubmitted(true);
    setJumbleTryAgainMsg(null);
    sounds.playCorrect();
    onStep5Complete(true);
  };

  const memoryPairs = useMemo(() => generateMemoryPairs(anchor, isK2), [anchor, isK2]);

  const stepTitles: Record<number, string> = {
    1: "Step 1: Listen & Look 🎧",
    2: "Step 2: Say It 🎤",
    3: "Step 3: Drag & Drop 🧩",
    4: "Step 4: Memory Match 🃏",
    5: "Step 5: Jumbled Sentence ✍️",
  };

  return (
    <Card className="card-shadow border-border">
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">Literacy Squared</span>
        </div>
        <h3 className="text-lg font-bold text-foreground">{stepTitles[step]}</h3>
      </div>
      <CardContent className={`pt-4 space-y-6 ${isK2 ? "text-[22px]" : ""}`}>
        {/* Step 1: Listen & Look */}
        {step === 1 && (
          <>
            <div className={`bg-muted/50 rounded-lg ${isK2 ? "p-8" : "p-6"} border border-border text-center space-y-4`}>
              <Headphones className={`${isK2 ? "h-14 w-14" : "h-10 w-10"} text-warning mx-auto`} />
              <div className={`${isK2 ? "text-6xl my-4 animate-bounce-slow" : "text-4xl my-3 animate-bounce-fast"}`}>
                {anchor.theme?.toLowerCase().includes("space") ? "🔴🪐" :
                 anchor.theme?.toLowerCase().includes("ocean") ? "🌊🐠" :
                 anchor.theme?.toLowerCase().includes("nature") ? "🌿🦋" :
                 anchor.theme?.toLowerCase().includes("superhero") ? "🦸‍♂️💥" :
                 anchor.theme?.toLowerCase().includes("fantasy") ? "🧙✨" :
                 anchor.theme?.toLowerCase().includes("egypt") ? "🏛️🐪" :
                 anchor.theme?.toLowerCase().includes("volcano") ? "🌋🔥" :
                 anchor.theme?.toLowerCase().includes("rainforest") ? "🌴🦜" :
                 anchor.theme?.toLowerCase().includes("sport") ? "⚽🏆" : "📚🌟"}
              </div>
              <p className={`${isK2 ? "text-2xl" : "text-lg"} font-medium text-foreground leading-relaxed`}>{anchor.sentence}</p>
              {tts.isSupported && tts.isSpeaking && (
                <p className={`${isK2 ? "text-lg" : "text-sm"} text-warning font-medium animate-pulse`}>Playing... 🔊</p>
              )}
              {tts.isSupported && (
                <Button variant="outline" onClick={() => tts.speak(anchor.sentence)} disabled={tts.isSpeaking} className={`gap-2 ${isK2 ? "text-lg px-6 py-4 h-auto" : ""}`}>
                  <RefreshCw className={`${isK2 ? "h-5 w-5" : "h-4 w-4"} ${tts.isSpeaking ? "animate-spin" : ""}`} />
                  {isK2 ? (tts.isSpeaking ? "Playing... 🔊" : "Hear it again! 🔁") : (tts.isSpeaking ? "Playing..." : "Replay")}
                </Button>
              )}
            </div>
            <Button variant="hero" className={`w-full ${isK2 ? "text-xl py-8 min-h-[72px]" : ""}`} size="lg" onClick={onStep1Done}>
              {isK2 ? "I heard it! 👂" : "I heard it ✓"} <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </>
        )}

        {/* Step 2: Say It */}
        {step === 2 && (
          <>
            <div className={`bg-muted/50 rounded-lg ${isK2 ? "p-6" : "p-4"} border border-border ${isK2 ? "text-center" : ""}`}>
              <p className={`${isK2 ? "text-2xl" : "text-lg"} text-foreground font-medium leading-relaxed`}>{anchor.sentence}</p>
            </div>

            {/* Word-level TTS chips */}
            <WordTTSChips sentence={anchor.sentence} tts={tts} isK2={isK2} />

            {!part1Submitted ? (
              <>
                <MicrophoneInput speech={speech} answer={part1Answer} setAnswer={setPart1Answer} disabled={part1Submitted} isK2={isK2} nudgeMessage={speakingNudgeMsg} />
                {part1Answer.trim() && (
                  <Button variant="hero" className={`w-full ${isK2 ? "text-xl py-6" : ""}`} size="lg" onClick={handleStep2WithNudge}>
                    {isK2 ? "Done! ✅" : "Submit"}
                  </Button>
                )}
              </>
            ) : (
              <div className="text-center space-y-4 animate-fade-in">
                <p className={`font-bold text-success ${isK2 ? "text-2xl" : "text-lg"}`}>Great job! 🌟</p>
                <p className={`text-muted-foreground ${isK2 ? "text-lg" : "text-sm"}`}>Moving on in a moment...</p>
              </div>
            )}
          </>
        )}

        {/* Step 3: Drag & Drop */}
        {step === 3 && (
          blanks && step3Status === "ready" ? (
            <WordBankFillBlanks
              blankedSentence={blanks.blanked}
              missingWords={blanks.missingWords}
              wordBank={blanks.wordBank}
              isK2={isK2}
              onComplete={onStep3Complete}
              onNext={onNext}
            />
          ) : (
            <div className="rounded-xl border border-border bg-muted/30 p-6 text-center space-y-4">
              <div className={showStep3WaitState ? "animate-soft-pulse" : ""}>
                <p className="text-6xl">🐣</p>
                <p className="text-lg font-medium text-foreground">One moment... 🐣</p>
              </div>
              {step3Status === "failed" ? (
                <Button variant="hero" onClick={onNext}>Skip this one ➡️</Button>
              ) : (
                <p className="text-sm text-muted-foreground">{step3RetryCount > 0 ? "Retrying..." : "Loading..."}</p>
              )}
            </div>
          )
        )}

        {/* Step 4: Memory Match */}
        {step === 4 && (
          <MemoryMatch
            words={memoryPairs.words}
            matches={memoryPairs.matches}
            isK2={isK2}
            onComplete={onStep4Complete}
            onNext={onNext}
          />
        )}

        {/* Step 5: Jumbled Sentence — K-2: tappable chips only, no keyboard */}
        {step === 5 && jumble && (
          <>
            {/* Try again message */}
            {jumbleTryAgainMsg && !jumbleSubmitted && (
              <div className="rounded-xl p-4 bg-warning/10 border border-warning/20 text-center animate-fade-in">
                <p className="text-lg font-medium text-warning">{jumbleTryAgainMsg}</p>
              </div>
            )}

            {/* Word chips — all lowercase, deduplicated */}
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <p className={`${isK2 ? "text-base" : "text-sm"} text-muted-foreground mb-2`}>
                {isK2 ? "Tap the words in the right order! 👆" : "Put these words back in the correct order:"}
              </p>
              <div className={`flex flex-wrap gap-2 mt-2 ${jumbleShake ? "animate-[shake_0.4s_ease-in-out]" : ""}`}>
                {jumble.jumbled.map((word, i) => {
                  const isUsed = isK2 && usedJumbleIndices.has(i);
                  return (
                    <button
                      key={i}
                      onClick={() => !isUsed && !jumbleSubmitted && (isK2 ? handleChipTap(word, i) : undefined)}
                      disabled={isUsed || jumbleSubmitted}
                      className={`px-4 py-2 rounded-full font-medium border-2 transition-all duration-200 select-none
                        ${isK2 ? "text-lg min-h-[48px]" : "text-sm"}
                        ${isUsed ? "bg-muted text-muted-foreground/30 border-muted opacity-40" : "bg-primary/10 text-primary border-primary/20 hover:scale-105 active:scale-95 cursor-pointer"}
                      `}
                    >
                      {word}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* K-2: Building area — tap chips here to remove them */}
            {isK2 ? (
              <div className="bg-muted/30 rounded-xl p-4 border-2 border-dashed border-primary/30 min-h-[64px]">
                <p className="text-xs text-muted-foreground mb-2">
                  Your sentence: {jumbleTappedWords.length > 0 && !jumbleSubmitted && "(tap a word to remove it)"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {jumbleTappedWords.length > 0 ? jumbleTappedWords.map((word, i) => (
                    <button
                      key={i}
                      onClick={() => !jumbleSubmitted && handleBuildChipRemove(i)}
                      disabled={jumbleSubmitted}
                      className="px-3 py-1.5 bg-primary/15 text-primary border border-primary/30 rounded-full text-lg font-medium hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all cursor-pointer active:scale-95"
                    >
                      {word}
                    </button>
                  )) : (
                    <p className="text-muted-foreground/50 text-lg">Tap words above...</p>
                  )}
                </div>
              </div>
            ) : (
              <Input
                value={jumbleAnswer}
                onChange={(e) => setJumbleAnswer(e.target.value)}
                placeholder="Type the sentence in correct order..."
                className="h-12"
                disabled={jumbleSubmitted}
              />
            )}

            {/* K-2 start over button */}
            {isK2 && jumbleTappedWords.length > 0 && !jumbleSubmitted && (
              <Button variant="outline" size="sm" onClick={() => { setJumbleTappedWords([]); setJumbleAnswer(""); setUsedJumbleIndices(new Set()); }}>Start over 🔄</Button>
            )}

            {!jumbleSubmitted ? (
              <Button variant="hero" className={`w-full ${isK2 ? "text-xl py-6" : ""}`} size="lg" onClick={handleJumbleSubmit} disabled={isK2 ? jumbleTappedWords.length !== jumble.jumbled.length : !jumbleAnswer.trim()}>
                {isK2 ? "Check! ✅" : "Check My Sentence"}
              </Button>
            ) : (
              <>
                {jumbleIsCorrect ? (
                  <FeedbackBanner feedback="Nice work! 🧩🌟" positive={true} />
                ) : (
                  <div className="bg-warning/10 rounded-lg p-3 border border-warning/20 space-y-1">
                    <p className="text-lg font-bold text-warning">Good try! Here's the correct sentence:</p>
                    <p className="text-lg font-bold text-warning">{jumble.original}</p>
                  </div>
                )}
                <Button
                  variant="success"
                  className={`w-full rounded-xl shadow-lg ${isK2 ? "text-2xl py-8 min-h-[70px] animate-soft-pulse" : "text-lg py-5 animate-soft-pulse-fast"}`}
                  size="lg"
                  onClick={onNext}
                >
                  {isK2 ? "Keep Going! 🚀" : "Next Step →"}
                </Button>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
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
  onSubmit: (overrideAnswer?: string) => void;
  onSubmitMC: (option: string) => void;
  onNext: () => void;
  isK2?: boolean;
  sentenceFrameTier?: number;
  sounds?: ReturnType<typeof useSounds>;
  anchor?: AnchorSentence | null;
  gradeBand?: GradeBand;
}

function Part2StrategyView({
  activity, index, totalActivities, answer, setAnswer, submitted, feedback, isCorrect,
  speech, tts, onSubmit, onSubmitMC, onNext, isK2, sentenceFrameTier, sounds, anchor, gradeBand,
}: Part2Props) {
  const strategyMeta = STRATEGY_LABELS[activity.strategy] || STRATEGY_LABELS[activity.type] || DEFAULT_STRATEGY_META;
  const StrategyIcon = strategyMeta.icon;
  const isSentenceFramesActivity = activity.strategy === "sentence_frames" || activity.type === "sentence_frames" || activity.type === "sentence_frame";
  const isShareYourThoughts = activity.type === "share_your_thoughts" || activity.strategy === "share_your_thoughts";
  const isK2SF = Boolean(isK2 && isSentenceFramesActivity);
  const inputType = isK2SF ? "k2_word_tiles" : (activity.inputType || "typing");

  // Log activity details for debugging
  console.log(`[Part2] Rendering activity ${index + 1}:`, { type: activity.type, strategy: activity.strategy, inputType: activity.inputType });

  // K-2 Sentence Frame retry logic
  const [sfAttempts, setSfAttempts] = useState(0);
  const [sfWrongMessage, setSfWrongMessage] = useState<string | null>(null);
  const [sfRevealed, setSfRevealed] = useState(false);
  const [sfSelectedWord, setSfSelectedWord] = useState<string | null>(null);

  // Speaking nudge state for recording activities
  const [speakNudgeMsg, setSpeakNudgeMsg] = useState<string | null>(null);
  const [speakAttemptCount, setSpeakAttemptCount] = useState(0);

  // Share Your Thoughts companion reaction state
  const COMPANION_REACTIONS = [
    "That's so interesting! I didn't know that!",
    "Wow, you explained that really well!",
    "I love how you connected that to real life!",
  ];
  const [companionReaction, setCompanionReaction] = useState<string | null>(null);
  const [showNextAfterReaction, setShowNextAfterReaction] = useState(false);

  // Deterministic K-2 sentence frame — replaces Gemini-generated blank/tiles
  const k2SfData = useMemo(() => {
    if (!isK2SF || !anchor) return null;
    const gradeLevel = gradeBand === "K-2" ? "K-1" : "2";
    return generateK2SentenceFrame(anchor, sentenceFrameTier || 1, gradeLevel as "K-1" | "2", index);
  }, [isK2SF, anchor, sentenceFrameTier, gradeBand, index]);

  const k2BlankSentence = useMemo(() => {
    if (!isK2SF) return "";
    // Use deterministic generator output
    if (k2SfData) return k2SfData.blankSentence;
    // Fallback (shouldn't happen)
    return "___";
  }, [isK2SF, k2SfData]);

  // Reset retry state when activity changes — use index as primary trigger
  useEffect(() => {
    setSfAttempts(0);
    setSfWrongMessage(null);
    setSfRevealed(false);
    setSfSelectedWord(null);
    setK2Countdown(null);
    setSpeakNudgeMsg(null);
    setSpeakAttemptCount(0);
    if (countdownRef.current) clearTimeout(countdownRef.current);
  }, [index]);

  // Safety catch: after 2+ attempts, force reveal + Next Activity no matter what
  useEffect(() => {
    if (!isK2SF) return;
    if (shouldForceRevealAfterAttempts(sfAttempts) && !sfRevealed) {
      setSfRevealed(true);
      setSfWrongMessage(null);
      setSfSelectedWord(null);
    }
  }, [isK2SF, sfAttempts, sfRevealed]);


  // Speaking nudge gate for recording activities
  const handlePart2SubmitWithNudge = useCallback(() => {
    const isRecording = inputType === "recording" || inputType === "record_then_type";
    if (isRecording && speech.isSupported && speech.lastDurationSeconds > 0) {
      const minDuration = isK2 ? 2 : 4;
      const keywords = activity.acceptableKeywords || [];
      const transcript = answer.toLowerCase();
      const hasKeyword = keywords.some(kw => transcript.includes(kw.toLowerCase()));
      const hasMinDuration = speech.lastDurationSeconds >= minDuration;

      if (!hasMinDuration && !hasKeyword && speakAttemptCount === 0) {
        setSpeakAttemptCount(1);
        setSpeakNudgeMsg(
          isK2 ? "Try again — say the whole sentence! 🎤" : "Give it another try — say the full sentence! 🎤"
        );
        speech.resetTranscript();
        setAnswer("");
        return;
      }
    }
    setSpeakNudgeMsg(null);
    onSubmit();
  }, [inputType, speech, isK2, activity, answer, speakAttemptCount, onSubmit, setAnswer]);

  const [k2Countdown, setK2Countdown] = useState<number | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isK2 && submitted && isCorrect && k2Countdown === null) {
      setK2Countdown(3);
    }
  }, [isK2, submitted, isCorrect]);

  useEffect(() => {
    if (k2Countdown === null || k2Countdown <= 0) return;
    countdownRef.current = setTimeout(() => {
      setK2Countdown(k2Countdown - 1);
    }, 1000);
    return () => { if (countdownRef.current) clearTimeout(countdownRef.current); };
  }, [k2Countdown]);

  useEffect(() => {
    if (k2Countdown === 0) {
      onNext();
    }
  }, [k2Countdown]);

  const cancelCountdown = () => {
    setK2Countdown(null);
    if (countdownRef.current) clearTimeout(countdownRef.current);
  };

  // Auto-play audio for K-2 listening activities
  useEffect(() => {
    if (isK2 && inputType === "listen_then_type" && activity.audioClip && tts.isSupported && !submitted) {
      const timer = setTimeout(() => tts.speak(activity.audioClip || ""), 400);
      return () => clearTimeout(timer);
    }
  }, [isK2, inputType, activity.audioClip, submitted]);

  return (
    <Card className="card-shadow border-border">
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 mb-1">
          <span className={`${isK2 ? "text-sm" : "text-xs"} font-medium bg-accent/10 px-2 py-0.5 rounded-full flex items-center gap-1 ${strategyMeta.color}`}>
            <StrategyIcon className="h-3 w-3" />
            {strategyMeta.label}
          </span>
          {isK2 && isSentenceFramesActivity && sentenceFrameTier && (
            <span className="text-sm bg-warning/20 text-warning px-2 py-0.5 rounded-full flex items-center gap-0.5">
              {Array.from({ length: 3 }, (_, i) => (
                <Star key={i} className={`h-3.5 w-3.5 ${i < sentenceFrameTier ? "fill-warning text-warning" : "text-warning/30"}`} />
              ))}
            </span>
          )}
          <span className={`${isK2 ? "text-sm" : "text-xs"} text-muted-foreground ml-auto bg-muted px-2 py-0.5 rounded-full`}>
            {index + 1} of {totalActivities}
          </span>
        </div>
        {!isK2 && <p className="text-xs text-muted-foreground mt-1">Targeting: {strategyMeta.targetDomain}</p>}
      </div>

      <CardContent className={`pt-4 space-y-6 ${isK2 ? "text-2xl" : ""}`}>
        {/* Passage — hard-disabled for K-2 sentence frames */}
        {activity.passage && !isK2SF && (
          <div className={`bg-muted/50 rounded-lg ${isK2 ? "p-6" : "p-4"} border border-border`}>
            <p className={`${isK2 ? "text-base" : "text-xs"} text-muted-foreground mb-1`}>📖 Read this:</p>
            <p className={`text-foreground leading-relaxed ${isK2 ? "text-xl" : ""}`}>
              {activity.passage}
            </p>
          </div>
        )}

        {/* Audio clip (for listen_then_type) */}
        {inputType === "listen_then_type" && activity.audioClip && (
          <div className={`bg-warning/5 rounded-lg ${isK2 ? "p-6" : "p-4"} border border-warning/20 text-center space-y-3`}>
            <Headphones className={`${isK2 ? "h-12 w-12" : "h-8 w-8"} text-warning mx-auto`} />
            {isK2 && (activity as any).emojiHint && (
              <div className="text-5xl my-2">{(activity as any).emojiHint}</div>
            )}
            <p className={`text-foreground leading-relaxed ${isK2 ? "text-xl" : ""}`}>{activity.audioClip}</p>
            {tts.isSupported && (
              <Button 
                variant="outline" 
                size={isK2 ? "lg" : "sm"} 
                onClick={() => tts.speak(activity.audioClip || "")}
                className={isK2 ? "text-lg px-6 py-4 h-auto" : ""}
              >
                <Volume2 className={`${isK2 ? "h-5 w-5" : "h-4 w-4"} mr-1`} /> 
                {isK2 ? "Hear it again! 🔁" : "Play Audio"}
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

        {/* Question — K-2 sentence_frames: show sentence with blank + tap instruction */}
        {isK2SF ? (
          <div className="space-y-3">
            <div className="bg-muted/50 rounded-xl p-6 border border-border">
              <p className="text-3xl font-bold text-foreground text-center leading-relaxed">
                {k2BlankSentence}
              </p>
            </div>
            {!submitted && !sfRevealed && (
              <p className="text-lg text-muted-foreground text-center">👆 Tap a word to finish the sentence.</p>
            )}
          </div>
        ) : (
          <h3 className={`${isK2 ? "text-2xl" : "text-lg"} font-medium text-foreground`}>{activity.question}</h3>
        )}

        {/* Sentence frame box removed — sentence is shown inline via WordBankFillBlanks or k2BlankSentence */}

        {/* Sentence starter — hide for K-2 recording */}
        {activity.sentenceStarter && !(isK2 && inputType === "recording") && (
          <div className="bg-accent/5 rounded-lg p-3 border border-accent/20">
            <p className="text-sm text-muted-foreground mb-1">You can start with:</p>
            <p className="text-foreground font-medium italic">{activity.sentenceStarter}</p>
          </div>
        )}

        {/* Word bank / tiles for K-2 Sentence Frames */}
        {isK2SF ? (() => {
          // Use deterministic k2SfData for tiles and correctness checking
          const sfTiles = k2SfData ? k2SfData.tiles : [];
          const sfCorrectWords = k2SfData ? k2SfData.correctWords : [];
          const sfRevealAnswer = k2SfData ? k2SfData.correctWords.join(", ") : (activity.modelAnswer || "");
          const sfForceReveal = shouldForceRevealAfterAttempts(sfAttempts);

          if (submitted && !sfRevealed && !sfForceReveal) return null;
          if (sfRevealed || sfForceReveal) {
            return (
              <div className="space-y-4 animate-fade-in">
                <div className="rounded-xl p-6 bg-warning/15 border-2 border-warning/30 text-center">
                  <p className="text-lg text-muted-foreground mb-1">The answer is:</p>
                  <p className="text-2xl font-bold text-warning">{sfRevealAnswer}</p>
                </div>
                <button
                  type="button"
                  onClick={onNext}
                  className="w-full py-4 text-xl font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all animate-soft-pulse"
                >
                  Next Activity →
                </button>
              </div>
            );
          }
          return (
            <div className="space-y-3">
              {sfWrongMessage && (
                <div className="rounded-xl p-4 bg-warning/10 border border-warning/20 text-center animate-fade-in">
                  <p className="text-lg font-medium text-warning">{sfWrongMessage}</p>
                </div>
              )}
              <div className="bg-muted/50 rounded-lg p-3 border border-border" key={`sf-tiles-${index}`}>
                <div className="flex flex-wrap gap-3 justify-center">
                  {sfTiles.map((word, i) => {
                    const isWrongBounce = sfSelectedWord === word && !!sfWrongMessage;
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={!!sfSelectedWord}
                        onClick={() => {
                          if (sfSelectedWord) return;

                          const tappedWord = typeof word === "string" ? word.trim() : "";
                          setSfSelectedWord(tappedWord || word);

                          const registerWrongAttempt = () => {
                            sounds?.playWrong();
                            const newAttempts = sfAttempts + 1;
                            setSfAttempts(newAttempts);

                            if (shouldForceRevealAfterAttempts(newAttempts)) {
                              setSfRevealed(true);
                              setSfWrongMessage(null);
                              setSfSelectedWord(null);
                              return;
                            }

                            setSfWrongMessage("Try again! 🌟");
                            setTimeout(() => {
                              setSfSelectedWord(null);
                              setSfWrongMessage(null);
                            }, 1200);
                          };

                          // Broken/empty tile safety: count as wrong attempt
                          if (!tappedWord) {
                            registerWrongAttempt();
                            return;
                          }

                          // Check against deterministic correct words
                          const isCorrectTile = sfCorrectWords.includes(normalizeWord(tappedWord));
                          if (isCorrectTile) {
                            // CORRECT — set selected word, reset attempts so feedback renders success state
                            setSfSelectedWord(tappedWord);
                            setSfWrongMessage(null);
                            setSfAttempts(0);
                            setAnswer(tappedWord);
                            setTimeout(() => {
                              onSubmit(tappedWord);
                            }, 400);
                          } else {
                            // WRONG — 0 points
                            registerWrongAttempt();
                          }
                        }}
                        className={`px-5 py-3 text-2xl min-h-[64px] border-2 rounded-full font-medium transition-all ${
                          isWrongBounce
                            ? "bg-destructive/15 text-destructive border-destructive/40 animate-[shake_0.4s_ease-in-out]"
                            : sfSelectedWord === word
                              ? "bg-primary text-primary-foreground border-primary scale-105"
                              : sfSelectedWord
                                ? "bg-muted text-muted-foreground border-muted cursor-not-allowed opacity-60"
                                : "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 hover:scale-105 active:scale-95 cursor-pointer"
                        }`}
                      >
                        {word}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })() : (
          /* Non-K2-SF word bank */
          activity.wordBank && activity.wordBank.length > 0 && !(isK2 && inputType === "recording") && (
            <div className="bg-muted/50 rounded-lg p-3 border border-border">
              <p className="text-sm text-muted-foreground mb-2">📚 Word bank — use these words if you'd like:</p>
              <div className="flex flex-wrap gap-2">
                {activity.wordBank.map((word, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={submitted}
                    className="px-3 py-1 bg-primary/10 text-primary text-sm cursor-default rounded-full font-medium transition-all"
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          )
        )}

        {/* Input area based on inputType — skip entirely for K-2 sentence_frames */}
        {!submitted && !isK2SF && (
          <>
            {(inputType === "multiple_choice" || inputType === "tap") && activity.options ? (
              <div className="grid grid-cols-1 gap-3">
                {activity.options.map((option, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    className={`justify-start text-left h-auto ${isK2 ? "py-5 px-5 text-2xl min-h-[64px]" : "py-3 px-4"} text-foreground hover:bg-primary/10 hover:border-primary/30`}
                    onClick={() => onSubmitMC(option)}
                  >
                    <span className={`font-bold text-primary mr-2 ${isK2 ? "text-xl" : ""}`}>{String.fromCharCode(65 + i)}.</span>
                    {option}
                  </Button>
                ))}
              </div>
            ) : inputType === "recording" ? (
              <MicrophoneInput speech={speech} answer={answer} setAnswer={setAnswer} disabled={submitted} isK2={isK2} nudgeMessage={speakNudgeMsg} />
            ) : inputType === "record_then_type" ? (
              <div className="space-y-4">
                <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer here..." className="min-h-[100px]" disabled={submitted} />
                <MicrophoneInput speech={speech} answer={answer} setAnswer={setAnswer} disabled={submitted} isK2={isK2} nudgeMessage={speakNudgeMsg} />
                <p className="text-xs text-muted-foreground">✍️ Type your answer, then 🎤 record yourself saying it!</p>
              </div>
            ) : inputType === "listen_then_type" ? (
              <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer..." className="h-12" disabled={submitted} />
            ) : (activity.strategy === "quick_writes" || activity.type === "quick_write") ? (
              <div>
                <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Write your answer here..." className="min-h-[120px]" disabled={submitted} />
                <p className="text-xs text-muted-foreground mt-2">⏱️ Most students finish in about 2 minutes! Write at least 2-3 sentences.</p>
              </div>
            ) : (
              <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer..." className="h-12" disabled={submitted} />
            )}

            {inputType !== "multiple_choice" && inputType !== "tap" && (
              <Button variant="hero" className="w-full" size="lg" onClick={() => handlePart2SubmitWithNudge()} disabled={!answer.trim()}>
                Submit Answer
              </Button>
            )}
          </>
        )}

        {/* Feedback */}
        {submitted && isK2 ? (
          <div className="space-y-4">
            {/* Simplified K-2 feedback */}
            <div className={`rounded-xl p-6 text-center ${
              isCorrect ? "bg-success/15 border-2 border-success/30" 
                : sfRevealed ? "bg-warning/15 border-2 border-warning/30"
                : "bg-primary/10 border border-primary/20"
            }`}>
              <p className="text-3xl mb-2">{isCorrect ? "🎉" : sfRevealed ? "✨" : "💪"}</p>
              <p className={`font-bold text-2xl ${isCorrect ? "text-success" : sfRevealed ? "text-warning" : "text-primary"}`}>
                {isCorrect ? "Great job!" : sfRevealed ? "Here's the answer!" : "Good try!"}
              </p>
              {!isCorrect && (
                <p className={`text-lg mt-2 ${sfRevealed ? "font-bold text-warning" : "text-muted-foreground text-sm"}`}>
                  {sfRevealed ? activity.modelAnswer : <>The answer was: <span className="font-medium text-foreground">{activity.modelAnswer}</span></>}
                </p>
              )}
            </div>
            {/* Large K-2 next button with pulse + countdown */}
            <Button
              variant="success"
              className={`w-full rounded-xl shadow-lg ${isK2 ? "text-3xl py-10 min-h-[80px]" : "text-lg py-5"} ${
                isCorrect && k2Countdown !== null ? (isK2 ? "animate-soft-pulse" : "animate-soft-pulse-fast") : ""
              }`}
              onClick={() => {
                cancelCountdown();
                onNext();
              }}
            >
              {k2Countdown !== null && k2Countdown > 0
                ? `Keep Going! 🚀 (${k2Countdown}...)`
                : index < totalActivities - 1 ? "Keep Going! 🚀" : "Almost done! ⭐"
              }
            </Button>
            {k2Countdown !== null && k2Countdown > 0 && (
              <button
                onClick={cancelCountdown}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                Wait, I want to stay ✋
              </button>
            )}
          </div>
        ) : submitted && (
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
              {speedIndex + 1} of {challenge.questions.length}
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

function WaveformBars({ isK2 }: { isK2?: boolean }) {
  const barCount = isK2 ? 5 : 4;
  const barHeight = isK2 ? "h-10" : "h-6";
  const barWidth = isK2 ? "w-2" : "w-1.5";
  return (
    <div className="flex items-center justify-center gap-1">
      {Array.from({ length: barCount }, (_, i) => (
        <div
          key={i}
          className={`${barWidth} ${barHeight} rounded-full bg-destructive animate-waveform-bar`}
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════
// Conclusion Section — between Part 3 and celebration
// ═══════════════════════════════════════════════
function ConclusionView({
  step, answer, setAnswer, submitted, nudgeShown, reaction,
  sessionTopic, anchor, speech, tts, isK2, pts, gamification, sounds,
  onSubmit,
}: {
  step: 1 | 2;
  answer: string;
  setAnswer: (v: string) => void;
  submitted: boolean;
  nudgeShown: boolean;
  reaction: string | null;
  sessionTopic: string;
  anchor: AnchorSentence | null;
  speech: ReturnType<typeof useSpeechRecognition>;
  tts: ReturnType<typeof useTTS>;
  isK2: boolean;
  pts: any;
  gamification: any;
  sounds: any;
  onSubmit: (step: 1 | 2) => void;
}) {
  const powerWords = (anchor?.keyWords || []).slice(0, 3);
  const [speakingWord, setSpeakingWord] = useState<number | null>(null);

  const handleWordTap = (word: string, index: number) => {
    setSpeakingWord(index);
    tts.speak(word);
    setTimeout(() => setSpeakingWord(null), 800);
  };

  const prompt = step === 1
    ? (isK2 ? `Say something about ${sessionTopic}! 🎤` : `Say something interesting about ${sessionTopic}!`)
    : (isK2 ? "Say it again — make it even bigger! 💪" : "Now level it up — add one more detail!");

  const nudgeMsg = nudgeShown
    ? (isK2 ? "Try again — say more! 🎤" : "Give it another try — say more! 🎤")
    : null;

  return (
    <Card className="card-shadow border-border">
      <div className="px-6 pt-6">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">Your Turn ✨</span>
          <span className="text-xs font-medium text-muted-foreground">{step} of 2</span>
        </div>
      </div>
      <CardContent className={`pt-4 space-y-6 ${isK2 ? "text-[22px]" : ""}`}>
        {/* Prompt */}
        <div className={`bg-muted/50 rounded-lg ${isK2 ? "p-6 text-center" : "p-4"} border border-border`}>
          <p className={`${isK2 ? "text-2xl" : "text-lg"} font-medium text-foreground leading-relaxed`}>{prompt}</p>
        </div>

        {/* Power Word chips */}
        <div className="space-y-1">
          <p className={`${isK2 ? "text-base" : "text-xs"} text-muted-foreground font-medium`}>
            {isK2 ? "Try using one of these words! 👆" : "Try using one of these words:"}
          </p>
          <div className="flex flex-wrap gap-2">
            {powerWords.map((word, i) => (
              <button
                key={i}
                onClick={() => handleWordTap(word, i)}
                className={`rounded-full bg-primary/10 text-primary border border-primary/20 font-medium transition-all cursor-pointer hover:bg-primary/20 ${
                  isK2 ? "text-lg min-h-[48px] px-4" : "text-sm px-3 py-1.5"
                } ${speakingWord === i ? "animate-pulse ring-2 ring-primary/40" : ""}`}
              >
                {word}
              </button>
            ))}
          </div>
        </div>

        {/* Companion reaction */}
        {reaction && (
          <div className="flex flex-col items-center gap-2 animate-fade-in">
            <div className="text-6xl animate-bounce">{isK2 ? "🐣" : "🌟"}</div>
            <div className="bg-primary/10 rounded-2xl px-6 py-3 border border-primary/20 max-w-xs">
              <p className={`${isK2 ? "text-xl" : "text-base"} font-bold text-primary text-center`}>{reaction}</p>
            </div>
          </div>
        )}

        {/* Microphone input */}
        {!submitted && !reaction && (
          <>
            <MicrophoneInput speech={speech} answer={answer} setAnswer={setAnswer} disabled={submitted} isK2={isK2} nudgeMessage={nudgeMsg} />
            {answer.trim() && (
              <Button variant="hero" className={`w-full ${isK2 ? "text-xl py-6" : ""}`} size="lg" onClick={() => onSubmit(step)}>
                {isK2 ? "Done! ✅" : "Submit"}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MicrophoneInput({ speech, answer, setAnswer, disabled, isK2, nudgeMessage }: {
  speech: ReturnType<typeof useSpeechRecognition>;
  answer: string;
  setAnswer: (v: string) => void;
  disabled?: boolean;
  isK2?: boolean;
  nudgeMessage?: string | null;
}) {
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTranscriptRef = useRef(answer);
  const [micPermission, setMicPermission] = useState<"prompt" | "granted" | "denied" | "unknown">("unknown");
  const [showCoaching, setShowCoaching] = useState(false);

  // Check mic permission on mount for K-2
  useEffect(() => {
    if (!isK2 || !speech.isSupported) return;
    if (typeof navigator === "undefined" || !navigator.permissions) {
      setMicPermission("unknown");
      return;
    }
    navigator.permissions.query({ name: "microphone" as PermissionName }).then((result) => {
      setMicPermission(result.state as any);
      if (result.state === "prompt") {
        setShowCoaching(true);
      }
      result.onchange = () => {
        setMicPermission(result.state as any);
        if (result.state === "granted") setShowCoaching(false);
      };
    }).catch(() => setMicPermission("unknown"));
  }, [isK2, speech.isSupported]);

  const handleCoachingReady = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicPermission("granted");
      setShowCoaching(false);
    } catch {
      setMicPermission("denied");
      setShowCoaching(false);
    }
  };

  // K-2 auto-stop after 3s of silence
  useEffect(() => {
    if (!isK2 || !speech.isListening) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      return;
    }
    if (answer !== lastTranscriptRef.current) {
      lastTranscriptRef.current = answer;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (speech.isListening) {
          speech.stopListening();
        }
      }, 3000);
    } else if (!silenceTimerRef.current) {
      silenceTimerRef.current = setTimeout(() => {
        if (speech.isListening) {
          speech.stopListening();
        }
      }, 5000);
    }
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [isK2, speech.isListening, answer]);

  // K-2 coaching overlay
  if (isK2 && showCoaching && micPermission === "prompt") {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center gap-6 p-8">
        <span className="text-8xl">🎤</span>
        <h2 className="text-3xl font-bold text-foreground text-center">Time to use your voice!</h2>
        <p className="text-xl text-muted-foreground text-center max-w-sm">
          Wait for your teacher to help you press <span className="font-bold text-foreground">Allow</span> 👆
        </p>
        <button
          onClick={handleCoachingReady}
          className="mt-4 px-10 py-5 text-2xl font-bold rounded-2xl bg-success text-success-foreground shadow-xl hover:scale-105 active:scale-95 transition-transform"
        >
          Ready! 🎤
        </button>
      </div>
    );
  }

  if (isK2) {
    return (
      <div className="flex flex-col items-center gap-4">
        {speech.isSupported ? (
          <>
            {!disabled && !answer && !speech.isListening && (
              <p className="text-2xl font-bold text-foreground text-center">
                Tap 🎤 to talk!
              </p>
            )}
            <button
              onClick={speech.isListening ? speech.stopListening : speech.startListening}
              disabled={disabled}
              className={`w-32 h-32 rounded-full flex items-center justify-center transition-all shadow-xl ${
                disabled ? "bg-muted text-muted-foreground"
                : speech.isListening
                  ? "bg-destructive text-destructive-foreground animate-pulse scale-110"
                  : "bg-success text-success-foreground hover:scale-105 active:scale-95"
              }`}
            >
              {speech.isListening ? <MicOff className="h-14 w-14" /> : <Mic className="h-14 w-14" />}
            </button>
            {speech.isListening && (
              <div className="flex flex-col items-center gap-2">
                <WaveformBars isK2={true} />
                <p className="text-lg text-destructive font-medium">
                  🔴 Listening...
                </p>
              </div>
            )}
            {nudgeMessage && !speech.isListening && (
              <div className="w-full bg-warning/15 border-2 border-warning/30 rounded-xl p-4 text-center animate-fade-in">
                <p className="text-xl font-bold text-warning">{nudgeMessage}</p>
              </div>
            )}
            {answer && !speech.isListening && !nudgeMessage && (
              <div className="w-full bg-muted/50 rounded-lg p-4 border border-border">
                <p className="text-sm text-muted-foreground mb-1">What I heard:</p>
                <p className="text-lg text-foreground font-medium">{answer}</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 text-center">
              <p className="text-lg text-muted-foreground">
                🎤 Can't use the mic. Type below!
              </p>
            </div>
            <Input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type here..."
              className="h-14 text-lg"
              disabled={disabled}
            />
          </>
        )}
      </div>
    );
  }

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
          {speech.isListening && (
            <div className="flex flex-col items-center gap-2">
              <WaveformBars isK2={false} />
              <p className="text-xs text-destructive font-medium">
                🔴 Recording... tap the mic to stop
              </p>
            </div>
          )}
          {nudgeMessage && !speech.isListening && (
            <div className="w-full bg-warning/10 border border-warning/20 rounded-lg p-3 text-center animate-fade-in">
              <p className="text-sm font-medium text-warning">{nudgeMessage}</p>
            </div>
          )}
          {answer && !speech.isListening && !nudgeMessage && (
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
    <div className={`rounded-lg p-4 flex items-start gap-3 animate-slide-up-banner ${
      positive ? "bg-success/10 border border-success/20" : "bg-primary/10 border border-primary/20"
    }`}>
      <CheckCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${positive ? "text-success" : "text-primary"}`} />
      <p className={`font-medium text-sm ${positive ? "text-success" : "text-primary"}`}>{feedback}</p>
    </div>
  );
}

export default StudentSession;
