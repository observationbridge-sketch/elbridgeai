import { getAnimalLevel, getNextLevel } from "./constants";
import { Progress } from "@/components/ui/progress";

interface AnimalCompanionProps {
  points: number;
  studentName: string;
  compact?: boolean;
}

export function AnimalCompanion({ points, studentName, compact }: AnimalCompanionProps) {
  const level = getAnimalLevel(points);
  const next = getNextLevel(points);
  const progressToNext = next
    ? Math.round(((points - level.min) / (next.min - level.min)) * 100)
    : 100;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-2xl">{level.emoji}</span>
        <div className="text-left">
          <p className="text-xs font-bold text-foreground">{points} pts</p>
          <p className="text-[10px] text-muted-foreground">{level.name}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 text-center space-y-2 card-shadow">
      <span className="text-5xl block">{level.emoji}</span>
      <p className="text-sm font-bold text-foreground">{studentName}</p>
      <p className="text-xs text-muted-foreground">{level.name}</p>
      <p className="text-lg font-bold text-primary">{points} points</p>
      {next && (
        <div className="space-y-1">
          <Progress value={progressToNext} className="h-2" />
          <p className="text-[10px] text-muted-foreground">
            {next.min - points} pts to {next.emoji} {next.name}
          </p>
        </div>
      )}
    </div>
  );
}
