import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface EvolutionCelebrationProps {
  show: boolean;
  animalEmoji: string;
  animalName: string;
  onClose: () => void;
}

export function EvolutionCelebration({ show, animalEmoji, animalName, onClose }: EvolutionCelebrationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) setVisible(true);
  }, [show]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl p-8 text-center max-w-sm w-full card-shadow animate-scale-in space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-7xl animate-bounce">{animalEmoji}</div>
        <h2 className="text-2xl font-bold text-foreground">You evolved! 🎉</h2>
        <p className="text-lg text-muted-foreground">
          You are now a <span className="font-bold text-primary">{animalName}</span>!
        </p>
        <div className="flex justify-center gap-1 text-2xl">
          {"✨🌟⭐🌟✨".split("").map((e, i) => (
            <span key={i} className="animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>{e}</span>
          ))}
        </div>
        <Button variant="hero" onClick={onClose} className="w-full">
          Awesome! Let's keep going!
        </Button>
      </div>
    </div>
  );
}
