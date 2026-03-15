import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useSounds } from "@/hooks/use-sounds";

interface MemoryCard {
  id: number;
  content: string;
  type: "word" | "match";
  pairId: number;
}

interface MemoryMatchProps {
  /** Vocabulary words from the anchor sentence */
  words: string[];
  /** For K-2: image emojis matching words. For 3-5: short definitions */
  matches: string[];
  isK2?: boolean;
  onComplete: (score: { correct: number; total: number }) => void;
  onNext: () => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function MemoryMatch({ words, matches, isK2, onComplete, onNext }: MemoryMatchProps) {
  const sounds = useSounds();
  const pairCount = words.length;

  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number[]>([]);
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const matchCountRef = useRef(0);

  // Initialize cards
  useEffect(() => {
    const wordCards: MemoryCard[] = words.map((w, i) => ({
      id: i * 2,
      content: w,
      type: "word",
      pairId: i,
    }));
    const matchCards: MemoryCard[] = matches.map((m, i) => ({
      id: i * 2 + 1,
      content: m,
      type: "match",
      pairId: i,
    }));
    setCards(shuffle([...wordCards, ...matchCards]));
  }, [words, matches]);

  const handleTap = useCallback((cardId: number) => {
    if (checking || done) return;
    if (flipped.has(cardId) || matched.has(cardId)) return;
    if (selected.length >= 2) return;

    const newFlipped = new Set(flipped);
    newFlipped.add(cardId);
    setFlipped(newFlipped);

    const newSelected = [...selected, cardId];
    setSelected(newSelected);

    if (newSelected.length === 2) {
      setChecking(true);
      const card1 = cards.find(c => c.id === newSelected[0])!;
      const card2 = cards.find(c => c.id === newSelected[1])!;

      if (card1.pairId === card2.pairId && card1.type !== card2.type) {
        // Match!
        setTimeout(() => {
          const newMatched = new Set(matched);
          newMatched.add(card1.id);
          newMatched.add(card2.id);
          setMatched(newMatched);
          setSelected([]);
          setChecking(false);
          sounds.playCorrect();
          matchCountRef.current += 1;

          if (matchCountRef.current === pairCount) {
            // All matched!
            setDone(true);
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 3000);
            onComplete({ correct: pairCount, total: pairCount });
          }
        }, 400);
      } else {
        // No match — flip back after 1s
        sounds.playWrong();
        setTimeout(() => {
          const resetFlipped = new Set(flipped);
          // Only remove the two selected, keep matched ones
          resetFlipped.delete(newSelected[0]);
          resetFlipped.delete(newSelected[1]);
          // Re-add all matched cards
          matched.forEach(id => resetFlipped.add(id));
          setFlipped(resetFlipped);
          setSelected([]);
          setChecking(false);
        }, 1000);
      }
    }
  }, [checking, done, flipped, matched, selected, cards, pairCount, sounds, onComplete]);

  // Auto-advance after 3 seconds when done
  useEffect(() => {
    if (done) {
      const timer = setTimeout(onNext, 3000);
      return () => clearTimeout(timer);
    }
  }, [done, onNext]);

  const cols = isK2 ? 3 : 4;
  const celebrationEmojis = ["🌟", "⭐", "✨", "🎉", "💫", "🏆", "🎊", "💪"];

  return (
    <div className="space-y-5">
      {/* Confetti */}
      {showConfetti && (
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

      <p className={`text-center ${isK2 ? "text-lg" : "text-sm"} text-muted-foreground`}>
        {isK2 ? "Tap two cards to find a match! 🃏" : "Flip cards to find matching pairs:"}
      </p>

      <div
        className="grid gap-3 mx-auto"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          maxWidth: isK2 ? "360px" : "420px",
        }}
      >
        {cards.map((card) => {
          const isFlipped = flipped.has(card.id) || matched.has(card.id);
          const isMatched = matched.has(card.id);

          return (
            <button
              key={card.id}
              onClick={() => handleTap(card.id)}
              disabled={isFlipped || checking || done}
              className={`
                relative aspect-square rounded-xl border-2 font-bold
                transition-all duration-300 transform-gpu
                ${isK2 ? "text-lg min-h-[80px]" : "text-sm min-h-[70px]"}
                ${isMatched
                  ? "border-success bg-success/15 text-success scale-[0.97]"
                  : isFlipped
                    ? "border-primary bg-primary/10 text-foreground rotate-0"
                    : "border-muted-foreground/30 bg-muted/50 text-transparent hover:border-primary/50 hover:bg-muted cursor-pointer hover:scale-105 active:scale-95"
                }
              `}
              style={{
                perspective: "600px",
              }}
            >
              {isFlipped || isMatched ? (
                <span className="flex items-center justify-center h-full px-1 text-center leading-tight animate-scale-in">
                  {card.content}
                </span>
              ) : (
                <span className={`flex items-center justify-center h-full ${isK2 ? "text-3xl" : "text-2xl"}`}>
                  🃏
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Match progress */}
      <div className="flex justify-center gap-2">
        {Array.from({ length: pairCount }, (_, i) => (
          <span
            key={i}
            className={`text-xl transition-all duration-300 ${
              matchCountRef.current > i ? "scale-110" : "opacity-30 scale-90"
            }`}
          >
            {matchCountRef.current > i ? "✅" : "⬜"}
          </span>
        ))}
      </div>

      {/* Done state */}
      {done && (
        <div className="space-y-3 animate-fade-in">
          <div className="rounded-xl p-4 bg-success/10 border border-success/20 text-center">
            <p className={`font-bold text-success ${isK2 ? "text-xl" : "text-lg"}`}>
              All pairs matched! 🎉🌟
            </p>
          </div>
          <Button
            variant={isK2 ? "success" : "hero"}
            className={`w-full ${isK2 ? "text-2xl py-8 min-h-[70px] rounded-xl shadow-lg animate-soft-pulse" : "animate-soft-pulse-fast"}`}
            size="lg"
            onClick={onNext}
          >
            {isK2 ? "Keep Going! 🚀" : "Next Step"} {!isK2 && <ArrowRight className="h-4 w-4 ml-2" />}
          </Button>
        </div>
      )}
    </div>
  );
}
