import { useState, useRef, useCallback, useEffect } from "react";
import { CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSounds } from "@/hooks/use-sounds";

// Tile colors for visual distinction
const TILE_COLORS = [
  "bg-primary/15 text-primary border-primary/30",
  "bg-accent/15 text-accent border-accent/30",
  "bg-warning/15 text-warning border-warning/30",
  "bg-success/15 text-success border-success/30",
  "bg-[hsl(280,60%,50%)]/15 text-[hsl(280,60%,50%)] border-[hsl(280,60%,50%)]/30",
  "bg-[hsl(340,70%,50%)]/15 text-[hsl(340,70%,50%)] border-[hsl(340,70%,50%)]/30",
];

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

function isAnswerCorrect(student: string, correct: string, isK2?: boolean): boolean {
  const s = student.toLowerCase().trim();
  const c = correct.toLowerCase().trim();
  if (s.length <= 1) return false;
  // K-2: exact match only per k2-rules.md
  if (isK2) return s === c;
  // 3-5: fuzzy matching allowed
  return s === c || levenshtein(s, c) <= 2;
}

interface WordBankFillBlanksProps {
  blankedSentence: string; // e.g. "The ___ sits on a ___ leaf."
  missingWords: string[];
  wordBank: string[];
  isK2?: boolean;
  onComplete: (score: { correct: number; total: number }) => void;
  onNext: () => void;
}

type BlankState = "empty" | "filled" | "correct" | "wrong" | "revealed";

export function WordBankFillBlanks({
  blankedSentence,
  missingWords,
  wordBank,
  isK2,
  onComplete,
  onNext,
}: WordBankFillBlanksProps) {
  const sounds = useSounds();
  const blankCount = missingWords.length;
  const [answers, setAnswers] = useState<string[]>(new Array(blankCount).fill(""));
  const [blankStates, setBlankStates] = useState<BlankState[]>(new Array(blankCount).fill("empty"));
  const [selectedTile, setSelectedTile] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [phase, setPhase] = useState<"filling" | "feedback" | "done">("filling");
  const [dragTile, setDragTile] = useState<string | null>(null);
  const [hoveredBlank, setHoveredBlank] = useState<number | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [score, setScore] = useState<{ correct: number; total: number }>({ correct: 0, total: blankCount });
  const [lockedBlanks, setLockedBlanks] = useState<Set<number>>(new Set());
  const blankRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // ─── Empty state protection: if no blanks found, show fallback and auto-advance ───
  const hasBlanks = blankedSentence.includes("___") && missingWords.length > 0;

  useEffect(() => {
    if (!hasBlanks) {
      const timer = setTimeout(() => onNext(), 2000);
      return () => clearTimeout(timer);
    }
  }, [hasBlanks, onNext]);

  if (!hasBlanks) {
    return (
      <div className="flex items-center justify-center min-h-[200px] rounded-xl bg-muted/50 border border-border">
        <p className="text-2xl text-muted-foreground animate-pulse">One moment... 🐣</p>
      </div>
    );
  }

  // Determine which blanks still need answers
  const activeBlanks = new Set(
    Array.from({ length: blankCount }, (_, i) => i).filter(i => !lockedBlanks.has(i))
  );

  // Words currently placed in blanks
  const usedWords = new Set(answers.filter(a => a));

  // Sentence parts split by ___
  const sentenceParts = blankedSentence.split("___");

  // ─── Tap-to-place logic ───
  const handleBlankTap = (blankIndex: number) => {
    if (phase !== "filling" || lockedBlanks.has(blankIndex)) return;

    if (selectedTile) {
      // Place selected tile in this blank
      const newAnswers = [...answers];
      // If blank already has a word, free it
      newAnswers[blankIndex] = selectedTile;
      setAnswers(newAnswers);
      setBlankStates(prev => {
        const n = [...prev];
        n[blankIndex] = "filled";
        return n;
      });
      setSelectedTile(null);
    } else if (answers[blankIndex]) {
      // Tap on filled blank → clear it (send word back to bank)
      const newAnswers = [...answers];
      newAnswers[blankIndex] = "";
      setAnswers(newAnswers);
      setBlankStates(prev => {
        const n = [...prev];
        n[blankIndex] = "empty";
        return n;
      });
    }
  };

  const handleTileTap = (word: string) => {
    if (phase !== "filling") return;
    // Only block tap if word is in a LOCKED blank
    const placedIndex = answers.indexOf(word);
    if (placedIndex !== -1 && lockedBlanks.has(placedIndex)) return;
    setSelectedTile(prev => prev === word ? null : word);
  };

  // ─── Drag and drop ───
  const handleDragStart = (e: React.DragEvent, word: string) => {
    if (phase !== "filling") return;
    const placedIndex = answers.indexOf(word);
    if (placedIndex !== -1 && lockedBlanks.has(placedIndex)) return;
    setDragTile(word);
    e.dataTransfer.setData("text/plain", word);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, blankIndex: number) => {
    if (phase !== "filling" || lockedBlanks.has(blankIndex)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHoveredBlank(blankIndex);
  };

  const handleDragLeave = () => {
    setHoveredBlank(null);
  };

  const handleDrop = (e: React.DragEvent, blankIndex: number) => {
    e.preventDefault();
    setHoveredBlank(null);
    if (phase !== "filling" || lockedBlanks.has(blankIndex)) return;
    const word = e.dataTransfer.getData("text/plain");
    if (!word) return;

    const newAnswers = [...answers];
    newAnswers[blankIndex] = word;
    setAnswers(newAnswers);
    setBlankStates(prev => {
      const n = [...prev];
      n[blankIndex] = "filled";
      return n;
    });
    setDragTile(null);
    setSelectedTile(null);
  };

  const handleDragEnd = () => {
    setDragTile(null);
    setHoveredBlank(null);
  };

  // ─── Check answers ───
  const allFilled = activeBlanks.size > 0
    ? [...activeBlanks].every(i => answers[i].trim() !== "")
    : answers.every(a => a.trim() !== "");

  const handleCheck = () => {
    const newStates = [...blankStates];
    const newLocked = new Set(lockedBlanks);
    let correctCount = 0;

    for (const i of activeBlanks) {
      if (isAnswerCorrect(answers[i], missingWords[i], isK2)) {
        newStates[i] = "correct";
        newLocked.add(i);
      } else {
        newStates[i] = "wrong";
      }
    }

    correctCount = newLocked.size;

    setBlankStates(newStates);
    setLockedBlanks(newLocked);
    const currentAttempt = attempts + 1;
    setAttempts(currentAttempt);

    const allCorrect = newLocked.size === blankCount;
    const wrongBlanks = [...activeBlanks].filter(i => !isAnswerCorrect(answers[i], missingWords[i], isK2));

    if (allCorrect) {
      // Full success
      setScore({ correct: blankCount, total: blankCount });
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 2500);
      setPhase("done");
      sounds.playCorrect();
      onComplete({ correct: blankCount, total: blankCount });
    } else if (currentAttempt >= 2) {
      // 2 attempts exhausted → reveal remaining
      const finalStates = [...newStates];
      for (const i of wrongBlanks) {
        finalStates[i] = "revealed";
      }
      setBlankStates(finalStates);
      setScore({ correct: correctCount, total: blankCount });
      setPhase("done");
      if (correctCount > 0) sounds.playWrong(); else sounds.playWrong();
      onComplete({ correct: correctCount, total: blankCount });
    } else {
      // Bounce wrong answers back to bank
      sounds.playWrong();
      setPhase("feedback");
      setTimeout(() => {
        const resetAnswers = [...answers];
        const resetStates = [...newStates];
        for (const i of wrongBlanks) {
          resetAnswers[i] = "";
          resetStates[i] = "empty";
        }
        setAnswers(resetAnswers);
        setBlankStates(resetStates);
        setPhase("filling");
        setScore({ correct: correctCount, total: blankCount });
      }, 1500);
    }
  };

  // Celebration emojis
  const celebrationEmojis = ["🌟", "⭐", "✨", "🎉", "💫", "🏆", "🎊", "💪"];

  return (
    <div className="space-y-5">
      {/* Celebration rain */}
      {showCelebration && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {celebrationEmojis.concat(celebrationEmojis).map((emoji, i) => (
            <span
              key={i}
              className="absolute text-3xl animate-celebration-fall"
              style={{
                left: `${5 + (i * 13) % 90}%`,
                animationDelay: `${i * 0.12}s`,
                animationDuration: `${1.5 + Math.random()}s`,
              }}
            >
              {emoji}
            </span>
          ))}
        </div>
      )}

      {/* Sentence with inline blanks */}
      <div className={`bg-muted/50 rounded-xl ${isK2 ? "p-6" : "p-5"} border border-border`}>
        <p className={`${isK2 ? "text-base" : "text-sm"} text-muted-foreground mb-3`}>
          {isK2 ? "Tap a word, then tap the blank! 👆" : "Drag or tap words into the blanks:"}
        </p>
        <p className={`text-foreground font-medium leading-loose ${isK2 ? "text-2xl" : "text-lg"}`}>
          {sentenceParts.map((part, i) => (
            <span key={i}>
              {part}
              {i < sentenceParts.length - 1 && (
                <button
                  ref={el => { blankRefs.current[i] = el; }}
                  onClick={() => handleBlankTap(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, i)}
                  disabled={lockedBlanks.has(i) || phase === "feedback"}
                  className={`
                    inline-flex items-center justify-center mx-1 px-3 py-1.5 rounded-lg
                    border-2 transition-all duration-300 align-middle
                    ${isK2
                      ? "min-h-[48px] text-xl min-w-[80px] max-w-[140px]"
                      : "min-h-[40px] text-base min-w-[60px] max-w-[120px]"
                    }
                    ${blankStates[i] === "correct"
                      ? "border-success bg-success/15 text-success font-bold scale-105"
                      : blankStates[i] === "wrong"
                        ? "border-destructive bg-destructive/10 text-destructive font-bold animate-[shake_0.4s_ease-in-out]"
                        : blankStates[i] === "revealed"
                          ? "border-warning bg-warning/10 text-warning font-bold"
                          : answers[i]
                            ? "border-primary bg-primary/10 text-primary font-bold cursor-pointer hover:bg-primary/20"
                            : hoveredBlank === i
                              ? "border-primary bg-primary/10 border-dashed scale-105 shadow-md"
                              : selectedTile
                                ? "border-primary/50 bg-primary/5 border-dashed animate-pulse cursor-pointer"
                                : "border-muted-foreground/30 border-dashed text-muted-foreground"
                    }
                  `}
                >
                  {blankStates[i] === "revealed"
                    ? missingWords[i]
                    : answers[i] || (isK2 ? "?" : "___")
                  }
                  {blankStates[i] === "correct" && (
                    <CheckCircle className="inline h-4 w-4 ml-1.5 animate-scale-in" />
                  )}
                </button>
              )}
            </span>
          ))}
        </p>
      </div>

      {/* Word Bank */}
      {phase !== "done" && (
        <div className="bg-muted/30 rounded-xl p-4 border border-border">
          <p className={`${isK2 ? "text-base" : "text-xs"} text-muted-foreground mb-3 text-center`}>
            {isK2 ? "📚 Pick a word:" : "📚 Word bank — drag or tap a word into a blank:"}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {wordBank.map((word, i) => {
              // Only grey out if placed in a LOCKED correct blank
              const placedIndex = answers.indexOf(word);
              const isLockedPlaced = placedIndex !== -1 && lockedBlanks.has(placedIndex);
              const isSelected = selectedTile === word;
              const isDragging = dragTile === word;
              const colorClass = TILE_COLORS[i % TILE_COLORS.length];

              return (
                <button
                  key={`${word}-${i}`}
                  draggable={!isLockedPlaced && phase === "filling"}
                  onDragStart={(e) => handleDragStart(e, word)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleTileTap(word)}
                  disabled={isLockedPlaced || phase === "feedback"}
                  className={`
                    px-5 py-2.5 rounded-xl font-bold border-2 transition-all duration-200 select-none
                    ${isK2 ? "text-lg min-h-[52px] min-w-[80px]" : "text-sm min-h-[44px] min-w-[64px]"}
                    ${isLockedPlaced
                      ? "bg-muted text-muted-foreground/30 border-muted cursor-not-allowed opacity-40"
                      : isDragging
                        ? "opacity-50 scale-95 " + colorClass
                        : isSelected
                          ? "ring-4 ring-primary/40 shadow-lg scale-110 bg-primary text-primary-foreground border-primary"
                          : `${colorClass} hover:scale-105 active:scale-95 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md`
                    }
                  `}
                >
                  {word}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Feedback area */}
      {phase === "feedback" && (
        <div className="rounded-xl p-4 bg-warning/10 border border-warning/20 text-center animate-fade-in">
          <p className="text-lg font-medium text-warning">
            {score.correct > 0
              ? `Good try! You got ${score.correct} out of ${score.total}! Try the rest! 💪`
              : "Not quite — give it another try! 🤗"
            }
          </p>
        </div>
      )}

      {/* Answers summary when done */}
      {phase === "done" && (
        <div className="space-y-3 animate-fade-in">
          <div className="space-y-2">
            {missingWords.map((word, i) => (
              <div key={i} className="flex items-center gap-2 text-sm flex-wrap">
                <span className="text-muted-foreground">Blank {i + 1}:</span>
                {blankStates[i] === "correct" ? (
                  <>
                    <span className="font-bold text-success">{answers[i]}</span>
                    <CheckCircle className="h-4 w-4 text-success" />
                  </>
                ) : (
                  <>
                    {answers[i] && (
                      <span className="font-bold text-destructive line-through">{answers[i]}</span>
                    )}
                    <span className="text-muted-foreground">→</span>
                    <span className="font-bold text-warning">{word}</span>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Result banner */}
          {score.correct === score.total ? (
            <div className="rounded-xl p-4 bg-success/10 border border-success/20 text-center">
              <p className="text-xl font-bold text-success">Amazing! You got them all! 🌟</p>
            </div>
          ) : score.correct > 0 ? (
            <div className="rounded-xl p-4 bg-warning/10 border border-warning/20 text-center">
              <p className="text-lg font-medium text-warning">
                Good try! You got {score.correct} out of {score.total}! Keep going! 💪
              </p>
            </div>
          ) : (
            <div className="rounded-xl p-4 bg-muted border border-border text-center">
              <p className="text-lg font-medium text-muted-foreground">
                Not quite — here are the answers! Let's keep going! 🤗
              </p>
            </div>
          )}

          {/* Next button */}
          <Button
            variant={isK2 ? "success" : "hero"}
            className={`w-full ${isK2 ? "text-2xl py-8 min-h-[70px] rounded-xl shadow-lg animate-pulse" : ""}`}
            size="lg"
            onClick={onNext}
          >
            {isK2 ? "Keep Going! 🚀" : "Next Step"} {!isK2 && <ArrowRight className="h-4 w-4 ml-2" />}
          </Button>
        </div>
      )}

      {/* Check button */}
      {phase === "filling" && allFilled && (
        <Button
          variant="hero"
          className={`w-full animate-fade-in ${isK2 ? "text-xl py-6" : ""}`}
          size="lg"
          onClick={handleCheck}
        >
          {isK2 ? "Check! ✅" : "Check My Answers"}
        </Button>
      )}
    </div>
  );
}
