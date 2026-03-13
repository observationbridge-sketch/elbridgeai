import { BADGES, type BadgeDef } from "./constants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface BadgeCollectionProps {
  earnedBadgeIds: string[];
  onBack: () => void;
}

export function BadgeCollection({ earnedBadgeIds, onBack }: BadgeCollectionProps) {
  const categories = [
    { key: "first_steps", label: "🌱 First Steps" },
    { key: "consistency", label: "🔥 Consistency" },
    { key: "skill", label: "🎯 Skill" },
    { key: "champion", label: "🏆 Champion" },
  ] as const;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-bold text-foreground">My Badges</h2>
          <span className="text-sm text-muted-foreground ml-auto">
            {earnedBadgeIds.length}/{BADGES.length}
          </span>
        </div>

        {categories.map(({ key, label }) => {
          const badges = BADGES.filter((b) => b.category === key);
          return (
            <div key={key}>
              <h3 className="text-sm font-bold text-foreground mb-2">{label}</h3>
              <div className="grid grid-cols-3 gap-3">
                {badges.map((badge) => {
                  const earned = earnedBadgeIds.includes(badge.id);
                  return (
                    <Card
                      key={badge.id}
                      className={`text-center p-3 ${earned ? "card-shadow border-primary/30" : "opacity-40 grayscale"}`}
                    >
                      <CardContent className="p-0 space-y-1">
                        <span className="text-3xl block">{badge.icon}</span>
                        <p className="text-[10px] font-bold text-foreground leading-tight">{badge.name}</p>
                        {earned && (
                          <p className="text-[9px] text-muted-foreground">✅ Earned</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
