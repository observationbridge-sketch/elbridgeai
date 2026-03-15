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
import { POINTS, BADGES } from "@/components/gamification/constants";
import { getAnimalLevel, getNextLevel } from "@/components/gamification/constants";
import { ThemeBackground, ThemePageWrapper, ThemedCard, ThemedCompanionGlow, ConfettiCelebration, MotivationalBanner, getThemeStyles } from "@/components/session/ThemeBackground";
import { WordBankFillBlanks } from "@/components/session/WordBankFillBlanks";
import { MemoryMatch } from "@/components/session/MemoryMatch";

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

const STRATEGY_LABELS: Record<Strategy, { label: string; icon: any; color: string; targetDomain: string }> = {
  sentence_frames: { label: "Sentence Frames", icon: BookOpen, color: "text-primary", targetDomain: "Reading & Listening" },
  sentence_expansion: { label: "Sentence Expansion", icon: Mic, color: "text-success", targetDomain: "Speaking" },
  quick_writes: { label: "Quick Writes", icon: PenTool, color: "text-accent", targetDomain: "Writing" },
};

// Part 1 = 5 steps, Part 2 = 6 activities (4 for K-2), Part 3 = 1 challenge
const TOTAL_STEPS_3_5 = 12; // 5 + 6 + 1
const TOTAL_STEPS_K2 = 10;  // 5 + 4 + 1

type GradeBand = "K-2" | "3-5";

// ─── Content validation ───
function validatePart2Activity(data: any): data is Part2Activity {
  if (!data) return false;
  if (!data.question || typeof data.question !== "string") return false;
  if (!data.modelAnswer || typeof data.modelAnswer !== "string") return false;
  if (!data.strategy || typeof data.strategy !== "string") return false;
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
  if (keywords.length > 0) {
    const matchCount = keywords.filter((kw) => norm.includes(kw.toLowerCase())).length;
    if (matchCount >= Math.max(2, Math.ceil(keywords.length * 0.3))) return true;
  }
  if (norm.split(/\s+/).length >= 3) return true;
  return false;
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
  "Almost there... ⭐",
];

function SessionLoadingScreen({ studentName, theme }: { studentName: string; theme: string }) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % LOADING_PHRASES.length);
    }, 2200);
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

  // Gamification & Sounds
  const gamification = useGamification(studentName, teacherId);
  const sounds = useSounds();
  const [showView, setShowView] = useState<"session" | "badges" | "leaderboard">("session");

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

  // Theme visual state
  const [showConfetti, setShowConfetti] = useState(false);
  const [showMotivational, setShowMotivational] = useState(false);

  // Prefetched activity cache (session-start health check)
  const prefetchedPart2Ref = useRef<Record<number, Part2Activity>>({});
  const prefetchedPart3Ref = useRef<Part3Challenge | null>(null);

  const prefetchSessionContent = useCallback(async (params: {
    grade: GradeBand;
    theme: string;
    topic: string;
    domainScores: Record<string, number> | null;
    history: any;
  }) => {
    const { grade, theme, topic, domainScores, history } = params;
    const total = grade === "K-2" ? 4 : 6;
    prefetchedPart2Ref.current = {};
    prefetchedPart3Ref.current = null;

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
              8000
            );
            if (error) throw error;
            const activity = data as Part2Activity;
            console.log("[HealthCheck][Part2] raw activity", { index, attempt: attempt + 1, activity });
            if (!validatePart2Activity(activity)) {
              console.error("[HealthCheck][Part2] invalid schema", { index, activity });
              throw new Error("Invalid Part2 activity schema");
            }
            return activity;
          } catch (error) {
            console.error(`[HealthCheck][Part2] attempt ${attempt + 1} failed for index ${index}`, error);
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
            },
          }),
          8000
        );
        if (error) throw error;
        console.log("[HealthCheck][Part3] raw challenge", { attempt: attempt + 1, challenge: data });
        if (!validatePart3Challenge(data)) {
          console.error("[HealthCheck][Part3] invalid schema", data);
          throw new Error("Invalid Part3 challenge schema");
        }
        prefetchedPart3Ref.current = data as Part3Challenge;
        break;
      } catch (error) {
        console.error(`[HealthCheck][Part3] attempt ${attempt + 1} failed`, error);
      }
    }

    console.log("[HealthCheck] completed", {
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

      try {
        const { data: studentData } = await supabase
          .from("session_students")
          .select("student_name, session_id, theme")
          .eq("id", studentId)
          .single();

        if (studentData) {
          currentStudentName = studentData.student_name;
          setStudentName(studentData.student_name);
          if ((studentData as any).theme) {
            sessionForcedTheme = (studentData as any).theme;
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
        setSessionTheme(anchorData.theme);
        setSessionTopic(anchorData.topic);
        resolvedTheme = anchorData.theme;
        resolvedTopic = anchorData.topic;
        setTtsPreloaded(true);
      } catch {
        const fallback: AnchorSentence = sessionGradeBand === "K-2"
          ? {
              sentence: "Mars is a red planet in space.",
              theme: sessionForcedTheme || "Space & planets",
              topic: "Mars is a red planet",
              category: "Descriptive language models",
              keyWords: ["Mars", "red", "planet"],
            }
          : {
              sentence: "The ancient pyramids of Egypt were built thousands of years ago by skilled workers. They used massive stone blocks that weighed more than an elephant. These incredible structures still stand tall in the desert today.",
              theme: "Ancient Egypt",
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
          setLoadingMessage("Checking activity content...");
          await prefetchSessionContent({
            grade: sessionGradeBand,
            theme: resolvedTheme,
            topic: resolvedTopic,
            domainScores: computedDomainScores,
            history: fetchedHistory,
          });
        }
      } catch (error) {
        console.error("Session health check failed", error);
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

  // Auto-play TTS for Step 1 (Listen & Look)
  useEffect(() => {
    if (!loading && inPart1 && anchor && tts.isSupported && ttsPreloaded) {
      if (part1Step === 1) {
        const timer = setTimeout(() => tts.speak(anchor.sentence), 300);
        return () => clearTimeout(timer);
      }
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
      if (inPart1) setPart1Answer(speech.transcript);
      else if (inPart2 && part2Activity?.strategy !== "quick_writes") setPart2Answer(speech.transcript);
      else if (inPart3) setPart3Answer(speech.transcript);
    }
  }, [speech.transcript, inPart1, inPart2, inPart3, part2Activity?.strategy]);

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
        grade_band: effectiveGradeBand,
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
      } else if (gradeBand === "K-2" && pct > 85) {
        newBand = "3-5";
        setEffectiveGradeBand("3-5");
        setGradeBandAdjusted(true);
        console.log("Auto-adjusted student to 3-5 band (Part 1 score:", Math.round(pct), "%)");
      }

      setGlobalStep(5);
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
    setPart1Scores((s) => ({ ...s, sayIt: matched, sayItTotal: total }));
    const pct = total > 0 ? matched / total : 0;
    setPart1Feedback("Great job! 🌟");
    setPart1Submitted(true);
    sounds.playCorrect();
    gamification.addPoints(POINTS.STEP2_SAY_IT);
    sounds.playPoints();
    if (!hasSpoken) {
      setHasSpoken(true);
      gamification.awardBadge("first_voice");
    }
    saveResponse("speaking", `Say It: ${anchor.sentence}`, part1Answer, anchor.sentence, pct >= 0.5, "Entering", "part1");
    // Auto-advance after 3 seconds
    setTimeout(() => handlePart1Next(), 3000);
  };

  const handleStep3Complete = (score: { correct: number; total: number }) => {
    setPart1Scores((s) => ({ ...s, dragDrop: score.correct, dragDropTotal: score.total }));
    gamification.addPoints(POINTS.STEP3_DRAG_DROP);
    sounds.playPoints();
    saveResponse("reading", "Drag & Drop fill-in-the-blank", `${score.correct}/${score.total}`, "completed", score.correct === score.total, "Entering", "part1");
  };

  const handleStep4Complete = (score: { correct: number; total: number }) => {
    setPart1Scores((s) => ({ ...s, memoryMatch: score.correct, memoryMatchTotal: score.total }));
    gamification.addPoints(POINTS.STEP4_MEMORY_MATCH);
    sounds.playPoints();
    saveResponse("reading", "Memory Match", `${score.correct}/${score.total}`, "completed", score.correct === score.total, "Entering", "part1");
  };

  const handleStep5Complete = (correct: boolean) => {
    setPart1Scores((s) => ({ ...s, jumbled: correct ? 1 : 0, jumbledTotal: 1 }));
    if (correct) {
      gamification.addPoints(POINTS.STEP5_JUMBLED);
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
    setLoading(true);
    setActivityError(false);
    setLoadingMessage(retryAttempt > 0 ? "Trying again..." : "Getting your next activity ready...");
    setPart2Submitted(false);
    setPart2Feedback(null);
    setPart2Answer("");
    killSpeech();
    tts.stop();

    const cachedActivity = prefetchedPart2Ref.current[index];
    if (cachedActivity && retryAttempt === 0) {
      setPart2Activity(cachedActivity);
      setPart2Strategy(cachedActivity.strategy);
      setPart2StrategyReason(cachedActivity.strategyReason || "Prefetched and validated");
      setActivityRetryCount(0);
      setLoading(false);
      return;
    }

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
      
      // CLIENT-SIDE VALIDATION: Ensure positions 5-6 don't have heavy writing tasks
      if (index >= 4) {
        const activityText = JSON.stringify(activity).toLowerCase();
        const isHeavy = 
          (activityText.includes("4-scene") || activityText.includes("sequential story") || 
           activityText.includes("multi-scene") || activityText.includes("organize sentences") ||
           (activityText.includes("scenes") && activityText.includes("order")));
        const sentenceMatch = (activity.question || "").match(/write\s+(\d+)\s+sentence/i);
        const tooManySentences = sentenceMatch && parseInt(sentenceMatch[1]) >= 3;
        
        if (isHeavy || tooManySentences) {
          console.warn(`Position ${index + 1} had heavy activity — using light fallback`);
          const isK2 = effectiveGradeBand === "K-2";
          if (index === 5) {
            activity = {
              type: "light_fun",
              inputType: isK2 ? "recording" : "typing",
              question: isK2 
                ? `Tell your animal companion: "My favorite thing about ${sessionTopic} is ___!" Say it out loud! 🎤`
                : `🎉 Finish this silly sentence about ${sessionTopic}: "If I could _____, I would _____ because _____!"`,
              modelAnswer: `My favorite thing about ${sessionTopic} is how amazing it is!`,
              acceptableKeywords: [sessionTopic.split(" ")[0]?.toLowerCase() || "fun", "favorite", "because"],
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
              modelAnswer: `True — ${sessionTopic} fits perfectly with ${sessionTheme}!`,
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

    let correct: boolean;
    if (part2Activity.inputType === "multiple_choice") {
      correct = answerText === part2Activity.modelAnswer;
    } else {
      correct = flexibleGrade(answerText, part2Activity.acceptableKeywords || []);
    }
    setPart2IsCorrect(correct);

    // K-2 Sentence Frame tier tracking
    if (effectiveGradeBand === "K-2" && part2Activity.strategy === "sentence_frames") {
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
      gamification.addPoints(POINTS.PART2_ACTIVITY);
      sounds.playPoints();
    }

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
    setLoading(true);
    setActivityError(false);
    setLoadingMessage(retryAttempt > 0 ? "Trying again..." : "Preparing your Language Challenge! 🎉");

    const cachedChallenge = prefetchedPart3Ref.current;
    if (cachedChallenge && retryAttempt === 0) {
      setPart3Challenge(cachedChallenge);
      setActivityRetryCount(0);
      setLoading(false);
      setPart3StartTime(Date.now());
      return;
    }

    try {
      const challengeType = effectiveGradeBand === "K-2" ? "speed_round" : undefined;
      const { data, error } = await fetchWithTimeout(
        supabase.functions.invoke("generate-part3-challenge", {
          body: { grade: effectiveGradeBand, theme: sessionTheme, topic: sessionTopic, forceType: challengeType, contentHistory },
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
      sounds.playCorrect();
      sounds.playPoints();
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2200);
    } else {
      sounds.playWrong();
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

  const finishSession = async () => {
    sounds.playSessionComplete();
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
        vocabulary_results: vocabularyResults,
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
    const animalLevel = getAnimalLevel(gamification.totalPoints);
    const nextLevel = getNextLevel(gamification.totalPoints);
    const totalActivities = 5 + part2Count + 1; // Part1(5) + Part2 + Part3(1)

    if (!showResults) {
      // ─── Phase 1: Full-screen celebration ───
      return (
        <div className="min-h-screen bg-background relative overflow-hidden">
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
                <h1 className="text-4xl font-bold text-foreground mb-2">You did it! 🎉</h1>
                <p className="text-xl text-primary font-semibold">{studentName}</p>
              </div>

              {/* Animal companion — large and pulsing */}
              <div className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
                <div className="text-[100px] leading-none" style={{ animation: "loading-pulse 2s ease-in-out infinite" }}>
                  {animalLevel.emoji}
                </div>
                <p className="text-sm text-muted-foreground mt-2">{animalLevel.name}</p>
              </div>

              {/* Points total */}
              <div className="animate-fade-in" style={{ animationDelay: "0.4s" }}>
                <p className="text-5xl font-bold text-warning" style={{ animation: "loading-pulse 2s ease-in-out infinite" }}>
                  +{gamification.sessionPoints} ⭐
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Total: <span className="font-bold text-foreground">{gamification.totalPoints} points</span>
                </p>
                {nextLevel && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {nextLevel.min - gamification.totalPoints} pts to {nextLevel.emoji} {nextLevel.name}!
                  </p>
                )}
              </div>

              {/* Badges earned this session */}
              {gamification.earnedBadgeIds.length > 0 && (
                <div className="animate-fade-in" style={{ animationDelay: "0.6s" }}>
                  <p className="text-sm font-medium text-foreground mb-2">🎖️ Badges Earned</p>
                  <div className="flex flex-wrap gap-3 justify-center">
                    {gamification.earnedBadgeIds.map((id) => {
                      const badge = BADGES_LOOKUP[id];
                      return badge ? (
                        <div key={id} className="flex flex-col items-center gap-1 bg-card rounded-lg px-3 py-2 border border-border">
                          <span className="text-3xl">{badge.icon}</span>
                          <span className="text-[10px] text-muted-foreground">{badge.name}</span>
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
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6 animate-fade-in">
          <Card className="card-shadow border-border">
            <CardContent className="py-8 space-y-6">
              <div className="text-center">
                <div className="text-6xl mb-3">{animalLevel.emoji}</div>
                <h2 className="text-2xl font-bold text-foreground">
                  Great job today, {studentName}! 🌟
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-warning/10 rounded-xl p-4 text-center border border-warning/20">
                  <p className="text-3xl font-bold text-warning">{gamification.sessionPoints}</p>
                  <p className="text-xs text-muted-foreground mt-1">Points Earned</p>
                </div>
                <div className="bg-primary/10 rounded-xl p-4 text-center border border-primary/20">
                  <p className="text-3xl font-bold text-primary">{totalActivities}</p>
                  <p className="text-xs text-muted-foreground mt-1">Activities Done</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Builder</p>
                  <p className="text-xl font-bold text-primary">✓</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Practice</p>
                  <p className="text-xl font-bold text-accent">{part2Score}/{part2Count}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Challenge</p>
                  <p className="text-xl font-bold text-success">✓</p>
                </div>
              </div>

              {gamification.earnedBadgeIds.length > 0 && (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-2">Badges</p>
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
            <Button variant="hero" onClick={() => navigate("/")} className="w-full text-lg py-6">
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
    <div className={`min-h-screen ${isK2 ? "text-[22px] leading-relaxed" : ""}`}>
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
                    onSubmit={() => submitPart2()}
                    onSubmitMC={(option: string) => submitPart2(option)}
                    onNext={nextPart2}
                    isK2={isK2}
                    sentenceFrameTier={sentenceFrameTier}
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
                ) : part3Submitted && part3Feedback ? (
                  // Auto-trigger finishSession once Part 3 is done
                  <Part3CompletionTrigger finishSession={finishSession} />
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
    const emojiMap: Record<string, string> = { sun:"☀️",moon:"🌙",star:"⭐",tree:"🌳",flower:"🌸",fish:"🐟",bird:"🐦",cat:"🐱",dog:"🐕",lion:"🦁",bear:"🐻",water:"💧",fire:"🔥",ball:"⚽",book:"📖",house:"🏠",mars:"🔴",planet:"🪐",space:"🚀",red:"🔴",butterfly:"🦋",garden:"🌻",kick:"🦶",play:"🎮",run:"🏃" };
    const defaults = ["🌟","🎯","💎","🌈","🔮","🎪"];
    return { words: selected, matches: selected.map((w,i) => emojiMap[w.toLowerCase()] || defaults[i % defaults.length]) };
  }
  return { words: selected, matches: selected.map(w => `means "${w}"`) };
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
  const [jumble, setJumble] = useState<{ original: string; jumbled: string[] } | null>(null);
  const [jumbleAnswer, setJumbleAnswer] = useState("");
  const [jumbleSubmitted, setJumbleSubmitted] = useState(false);
  const [jumbleTappedWords, setJumbleTappedWords] = useState<string[]>([]);

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

  useEffect(() => {
    if (anchor?.sentence) {
      setJumble(jumbleSentence(anchor.sentence));
    }
  }, [anchor]);

  useEffect(() => {
    if (step !== 3) return;
    prepareStep3Content(0);
  }, [step, anchor, prepareStep3Content]);

  const handleChipTap = (word: string) => {
    if (isK2) {
      const newTapped = [...jumbleTappedWords, word];
      setJumbleTappedWords(newTapped);
      setJumbleAnswer(newTapped.join(" "));
    }
  };

  const handleJumbleSubmit = () => {
    if (!jumble) return;
    const { matched, total } = compareWords(jumbleAnswer, jumble.original);
    const pct = total > 0 ? matched / total : 0;
    setJumbleSubmitted(true);
    if (pct >= 0.7) sounds.playCorrect(); else sounds.playWrong();
    onStep5Complete(pct >= 0.7);
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
            {!part1Submitted ? (
              <>
                <MicrophoneInput speech={speech} answer={part1Answer} setAnswer={setPart1Answer} disabled={part1Submitted} isK2={isK2} />
                {part1Answer.trim() && (
                  <Button variant="hero" className={`w-full ${isK2 ? "text-xl py-6" : ""}`} size="lg" onClick={onStep2Submit}>
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

        {/* Step 5: Jumbled Sentence */}
        {step === 5 && jumble && (
          <>
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <p className={`${isK2 ? "text-base" : "text-sm"} text-muted-foreground mb-2`}>
                {isK2 ? "Tap the words in the right order! 👆" : "Put these words back in the correct order:"}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {jumble.jumbled.map((word, i) => {
                  const isUsed = isK2 && jumbleTappedWords.includes(word);
                  return (
                    <button
                      key={i}
                      onClick={() => !isUsed && !jumbleSubmitted && (isK2 ? handleChipTap(word) : undefined)}
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
            <Input
              value={jumbleAnswer}
              onChange={(e) => !isK2 && setJumbleAnswer(e.target.value)}
              placeholder={isK2 ? "Tap words above..." : "Type the sentence in correct order..."}
              className={isK2 ? "h-14 text-lg" : "h-12"}
              disabled={jumbleSubmitted}
              readOnly={isK2}
            />
            {isK2 && jumbleTappedWords.length > 0 && !jumbleSubmitted && (
              <Button variant="outline" size="sm" onClick={() => { setJumbleTappedWords([]); setJumbleAnswer(""); }}>Start over 🔄</Button>
            )}
            {!jumbleSubmitted ? (
              <Button variant="hero" className={`w-full ${isK2 ? "text-xl py-6" : ""}`} size="lg" onClick={handleJumbleSubmit} disabled={!jumbleAnswer.trim()}>
                {isK2 ? "Check! ✅" : "Check My Sentence"}
              </Button>
            ) : (
              <>
                {(() => {
                  const { matched, total } = compareWords(jumbleAnswer, jumble.original);
                  const pct = total > 0 ? matched / total : 0;
                  return (
                    <>
                      <FeedbackBanner feedback={pct >= 0.7 ? "Nice work! 🧩🌟" : "Good try! Here's the correct sentence:"} positive={pct >= 0.7} />
                      <div className="bg-muted/50 rounded-lg p-3 border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Correct sentence:</p>
                        <p className="text-foreground font-medium">{jumble.original}</p>
                      </div>
                    </>
                  );
                })()}
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
  onSubmit: () => void;
  onSubmitMC: (option: string) => void;
  onNext: () => void;
  isK2?: boolean;
  sentenceFrameTier?: number;
}

function Part2StrategyView({
  activity, index, totalActivities, answer, setAnswer, submitted, feedback, isCorrect,
  speech, tts, onSubmit, onSubmitMC, onNext, isK2, sentenceFrameTier,
}: Part2Props) {
  const strategyMeta = STRATEGY_LABELS[activity.strategy];
  const StrategyIcon = strategyMeta.icon;
  const inputType = activity.inputType || "typing";

  // K-2 Sentence Frame retry logic
  const isK2SF = isK2 && activity.strategy === "sentence_frames";
  const [sfAttempts, setSfAttempts] = useState(0);
  const [sfWrongMessage, setSfWrongMessage] = useState<string | null>(null);
  const [sfRevealed, setSfRevealed] = useState(false);
  const [sfSelectedWord, setSfSelectedWord] = useState<string | null>(null);

  // Reset retry state when activity changes
  useEffect(() => {
    setSfAttempts(0);
    setSfWrongMessage(null);
    setSfRevealed(false);
    setSfSelectedWord(null);
  }, [activity.question]);

  // K-2 auto-advance countdown
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
          {isK2 && activity.strategy === "sentence_frames" && sentenceFrameTier && (
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

      <CardContent className={`pt-4 space-y-6 ${isK2 ? "text-[22px]" : ""}`}>
        {/* Passage — hidden entirely for K-2 sentence_frames */}
        {activity.passage && !(isK2 && activity.strategy === "sentence_frames") && (
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
              <p className="text-2xl font-bold text-foreground text-center leading-relaxed">
                {activity.sentenceFrame || activity.question}
              </p>
            </div>
            {!submitted && !sfRevealed && (
              <p className="text-lg text-muted-foreground text-center">👆 Tap a word to finish the sentence.</p>
            )}
          </div>
        ) : (
          <h3 className={`${isK2 ? "text-xl" : "text-lg"} font-medium text-foreground`}>{activity.question}</h3>
        )}

        {/* Sentence frame — hide for K-2 entirely */}
        {activity.sentenceFrame && inputType !== "multiple_choice" && !(isK2 && inputType === "recording") && !isK2 && (
          <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
            <p className="text-sm text-muted-foreground mb-1">Sentence frame:</p>
            <p className="text-foreground font-medium italic">{activity.sentenceFrame}</p>
          </div>
        )}

        {/* Sentence starter — hide for K-2 recording */}
        {activity.sentenceStarter && !(isK2 && inputType === "recording") && (
          <div className="bg-accent/5 rounded-lg p-3 border border-accent/20">
            <p className="text-sm text-muted-foreground mb-1">You can start with:</p>
            <p className="text-foreground font-medium italic">{activity.sentenceStarter}</p>
          </div>
        )}

        {/* Word bank / tiles for K-2 Sentence Frames */}
        {isK2SF ? (() => {
          // Use wordBank if available, otherwise fall back to MC options
          const tiles = (activity.wordBank && activity.wordBank.length > 0)
            ? activity.wordBank
            : (activity.options && activity.options.length > 0)
              ? activity.options
              : [];
          if (tiles.length === 0) return null;
          if (submitted || (sfRevealed && submitted)) return null;
          if (sfRevealed && !submitted) {
            return (
              <div className="space-y-4 animate-fade-in">
                <div className="rounded-xl p-6 bg-warning/15 border-2 border-warning/30 text-center">
                  <p className="text-lg text-muted-foreground mb-1">The answer is:</p>
                  <p className="text-2xl font-bold text-warning">{activity.modelAnswer}</p>
                </div>
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
              <div className="bg-muted/50 rounded-lg p-3 border border-border">
                <div className="flex flex-wrap gap-3 justify-center">
                  {tiles.map((word, i) => {
                    const isSelected = sfSelectedWord === word;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setSfSelectedWord(word);
                          const correctAnswer = activity.modelAnswer.toLowerCase().trim();
                          const isExactCorrect = word.toLowerCase().trim() === correctAnswer;
                          if (isExactCorrect) {
                            setAnswer(word);
                            setSfWrongMessage(null);
                            setTimeout(() => onSubmit(), 400);
                          } else {
                            const newAttempts = sfAttempts + 1;
                            setSfAttempts(newAttempts);
                            if (newAttempts >= 2) {
                              setSfRevealed(true);
                              setSfWrongMessage(null);
                              setAnswer(word);
                              setTimeout(() => onSubmit(), 400);
                            } else {
                              setSfWrongMessage("Try again! 🌟");
                              setTimeout(() => setSfSelectedWord(null), 600);
                            }
                          }
                        }}
                        className={`px-5 py-3 text-lg border-2 rounded-full font-medium cursor-pointer transition-all ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary scale-105"
                            : "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 hover:scale-105 active:scale-95"
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
            {inputType === "multiple_choice" && activity.options ? (
              <div className="grid grid-cols-1 gap-3">
                {activity.options.map((option, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    className={`justify-start text-left h-auto ${isK2 ? "py-5 px-5 text-xl min-h-[64px]" : "py-3 px-4"} text-foreground hover:bg-primary/10 hover:border-primary/30`}
                    onClick={() => onSubmitMC(option)}
                  >
                    <span className={`font-bold text-primary mr-2 ${isK2 ? "text-xl" : ""}`}>{String.fromCharCode(65 + i)}.</span>
                    {option}
                  </Button>
                ))}
              </div>
            ) : inputType === "recording" ? (
              <MicrophoneInput speech={speech} answer={answer} setAnswer={setAnswer} disabled={submitted} isK2={isK2} />
            ) : inputType === "record_then_type" ? (
              <div className="space-y-4">
                <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer here..." className="min-h-[100px]" disabled={submitted} />
                <MicrophoneInput speech={speech} answer={answer} setAnswer={setAnswer} disabled={submitted} isK2={isK2} />
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
        {submitted && isK2 ? (
          <div className="space-y-4">
            {/* Simplified K-2 feedback */}
            <div className={`rounded-xl p-6 text-center ${
              isCorrect ? "bg-success/15 border-2 border-success/30" 
                : sfRevealed ? "bg-warning/15 border-2 border-warning/30"
                : "bg-primary/10 border border-primary/20"
            }`}>
              <p className="text-3xl mb-2">{isCorrect ? "🎉" : sfRevealed ? "✨" : "💪"}</p>
              <p className={`font-bold text-xl ${isCorrect ? "text-success" : sfRevealed ? "text-warning" : "text-primary"}`}>
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
              className={`w-full rounded-xl shadow-lg ${isK2 ? "text-2xl py-8 min-h-[70px]" : "text-lg py-5"} ${
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
function MicrophoneInput({ speech, answer, setAnswer, disabled, isK2 }: {
  speech: ReturnType<typeof useSpeechRecognition>;
  answer: string;
  setAnswer: (v: string) => void;
  disabled?: boolean;
  isK2?: boolean;
}) {
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTranscriptRef = useRef(answer);

  // K-2 auto-stop after 3s of silence
  useEffect(() => {
    if (!isK2 || !speech.isListening) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      return;
    }
    // Reset timer whenever transcript changes
    if (answer !== lastTranscriptRef.current) {
      lastTranscriptRef.current = answer;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (speech.isListening) {
          speech.stopListening();
        }
      }, 3000);
    } else if (!silenceTimerRef.current) {
      // Start initial silence timer when recording starts
      silenceTimerRef.current = setTimeout(() => {
        if (speech.isListening) {
          speech.stopListening();
        }
      }, 5000); // 5s for initial silence (student may need time)
    }
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [isK2, speech.isListening, answer]);

  if (isK2) {
    return (
      <div className="flex flex-col items-center gap-4">
        {speech.isSupported ? (
          <>
            {!disabled && !answer && (
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
              <p className="text-lg text-destructive font-medium animate-pulse">
                🔴 Listening...
              </p>
            )}
            {answer && !speech.isListening && (
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
    <div className={`rounded-lg p-4 flex items-start gap-3 animate-slide-up-banner ${
      positive ? "bg-success/10 border border-success/20" : "bg-primary/10 border border-primary/20"
    }`}>
      <CheckCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${positive ? "text-success" : "text-primary"}`} />
      <p className={`font-medium text-sm ${positive ? "text-success" : "text-primary"}`}>{feedback}</p>
    </div>
  );
}

export default StudentSession;
