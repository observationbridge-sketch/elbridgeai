import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAnimalLevel } from "./constants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface LeaderboardEntry {
  student_name: string;
  total_points: number;
}

interface LeaderboardProps {
  teacherId: string;
  currentStudentName: string;
  onBack: () => void;
}

export function Leaderboard({ teacherId, currentStudentName, onBack }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  const loadLeaderboard = async () => {
    const { data } = await supabase
      .from("student_points")
      .select("student_name, total_points")
      .eq("teacher_id", teacherId)
      .order("total_points", { ascending: false })
      .limit(10);
    if (data) setEntries(data);
  };

  useEffect(() => {
    loadLeaderboard();

    // Realtime subscription
    const channel = supabase
      .channel("leaderboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "student_points" }, () => {
        loadLeaderboard();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [teacherId]);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-bold text-foreground">🏅 Class Leaderboard</h2>
        </div>

        <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-center">
          <p className="text-sm text-primary font-medium">
            Every point you earn means more English power! Keep going! 💪
          </p>
        </div>

        <div className="space-y-2">
          {entries.map((entry, i) => {
            const level = getAnimalLevel(entry.total_points);
            const isMe = entry.student_name === currentStudentName;
            return (
              <Card
                key={entry.student_name}
                className={`${isMe ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "border-border"}`}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <span className={`text-lg font-bold w-8 text-center ${i < 3 ? "text-warning" : "text-muted-foreground"}`}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </span>
                  <span className="text-2xl">{level.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${isMe ? "text-primary" : "text-foreground"}`}>
                      {entry.student_name} {isMe && "(You)"}
                    </p>
                    <p className="text-xs text-muted-foreground">{level.name}</p>
                  </div>
                  <span className="text-sm font-bold text-foreground">{entry.total_points} pts</span>
                </CardContent>
              </Card>
            );
          })}
          {entries.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No scores yet — be the first!</p>
          )}
        </div>
      </div>
    </div>
  );
}
