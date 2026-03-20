import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, ArrowLeft, BookOpen, PenTool, Mic, Headphones, Users, Target, Zap, Trophy, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type DomainSummary = {
  domain: string;
  total: number;
  correct: number;
  percentage: number;
};

type StrategyInfo = {
  strategy: string;
  count: number;
};


const DOMAIN_META: Record<string, { icon: any; color: string; label: string }> = {
  reading: { icon: BookOpen, color: "text-primary", label: "Reading" },
  writing: { icon: PenTool, color: "text-accent", label: "Writing" },
  speaking: { icon: Mic, color: "text-success", label: "Speaking" },
  listening: { icon: Headphones, color: "text-warning", label: "Listening" },
};

const STRATEGY_LABELS: Record<string, string> = {
  sentence_frames: "Sentence Frames",
  sentence_expansion: "Sentence Expansion",
  quick_writes: "Quick Writes",
};

const CHALLENGE_LABELS: Record<string, string> = {
  story_builder: "Story Builder",
  speed_round: "Speed Round",
  teach_it_back: "Teach It Back",
};

function getProficiencyLevel(pct: number): string {
  if (pct >= 90) return "Bridging";
  if (pct >= 70) return "Expanding";
  if (pct >= 50) return "Developing";
  if (pct >= 30) return "Emerging";
  return "Entering";
}

const SessionSummary = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [domainSummaries, setDomainSummaries] = useState<DomainSummary[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [sessionCode, setSessionCode] = useState("");
  const [part1Stats, setPart1Stats] = useState({ total: 0, correct: 0 });
  const [part2Stats, setPart2Stats] = useState({ total: 0, correct: 0 });
  const [part3Stats, setPart3Stats] = useState({ total: 0, correct: 0 });
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [challenges, setChallenges] = useState<StrategyInfo[]>([]);
  const [weakestDomainNote, setWeakestDomainNote] = useState("");
  

  useEffect(() => {
    if (!sessionId) return;

    const load = async () => {
      const { data: session } = await supabase
        .from("sessions")
        .select("code, teacher_id")
        .eq("id", sessionId)
        .single();
      if (session) {
        setSessionCode(session.code);
      }

      const { data: students } = await supabase
        .from("session_students")
        .select("id, student_name")
        .eq("session_id", sessionId);
      setStudentCount(students?.length || 0);

      const { data: responses } = await supabase
        .from("student_responses")
        .select("domain, is_correct, session_part, strategy")
        .eq("session_id", sessionId);

      if (responses) {
        const domains = ["reading", "writing", "speaking", "listening"];
        const summaries = domains.map((d) => {
          const domainResponses = responses.filter((r) => r.domain === d);
          const correct = domainResponses.filter((r) => r.is_correct).length;
          return {
            domain: d,
            total: domainResponses.length,
            correct,
            percentage: domainResponses.length > 0 ? Math.round((correct / domainResponses.length) * 100) : 0,
          };
        });
        setDomainSummaries(summaries);

        const p1 = responses.filter((r) => r.session_part === "part1");
        const p2 = responses.filter((r) => r.session_part === "part2");
        const p3 = responses.filter((r) => r.session_part === "part3");
        setPart1Stats({ total: p1.length, correct: p1.filter((r) => r.is_correct).length });
        setPart2Stats({ total: p2.length, correct: p2.filter((r) => r.is_correct).length });
        setPart3Stats({ total: p3.length, correct: p3.filter((r) => r.is_correct).length });

        // Part 2 strategies
        const strategyMap = new Map<string, number>();
        for (const r of responses.filter((r) => r.session_part === "part2")) {
          if (r.strategy) strategyMap.set(r.strategy, (strategyMap.get(r.strategy) || 0) + 1);
        }
        setStrategies(Array.from(strategyMap.entries()).map(([strategy, count]) => ({ strategy, count })));

        // Part 3 challenges
        const challengeMap = new Map<string, number>();
        for (const r of responses.filter((r) => r.session_part === "part3")) {
          if (r.strategy) challengeMap.set(r.strategy, (challengeMap.get(r.strategy) || 0) + 1);
        }
        setChallenges(Array.from(challengeMap.entries()).map(([strategy, count]) => ({ strategy, count })));

        if (summaries.some((s) => s.total > 0)) {
          const withData = summaries.filter((s) => s.total > 0);
          const weakest = withData.reduce((min, s) => (s.percentage < min.percentage ? s : min), withData[0]);
          const strategyList = Array.from(strategyMap.entries());
          if (strategyList.length > 0) {
            const strategyName = STRATEGY_LABELS[strategyList[0][0]] || strategyList[0][0];
            setWeakestDomainNote(
              `${weakest.domain.charAt(0).toUpperCase() + weakest.domain.slice(1)} was the weakest area, so Part 2 focused on ${strategyName}.`
            );
          }
        }
      }

      // Load gamification data
      if (session?.teacher_id && students && students.length > 0) {
        const studentNames = students.map((s) => s.student_name);

        const { data: pointsData } = await supabase
          .from("student_points")
          .select("student_name, total_points, current_streak, sessions_completed")
          .eq("teacher_id", session.teacher_id)
          .in("student_name", studentNames);

        const { data: badgesData } = await supabase
          .from("student_badges")
          .select("student_name, badge_icon")
          .eq("teacher_id", session.teacher_id)
          .in("student_name", studentNames);

        const gamData: StudentGamification[] = studentNames.map((name) => {
          const pts = pointsData?.find((p) => p.student_name === name);
          const badges = badgesData?.filter((b) => b.student_name === name).map((b) => b.badge_icon) || [];
          return {
            student_name: name,
            total_points: pts?.total_points || 0,
            current_streak: pts?.current_streak || 0,
            sessions_completed: pts?.sessions_completed || 0,
            badges,
          };
        });
        setStudentGamification(gamData.sort((a, b) => b.total_points - a.total_points));
      }
    };

    load();
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/teacher/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            <span className="font-bold text-foreground">Session Summary</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Session {sessionCode}</h1>
            <p className="text-muted-foreground flex items-center gap-1">
              <Users className="h-4 w-4" /> {studentCount} students participated
            </p>
          </div>
        </div>

        {/* Part 1 / Part 2 / Part 3 Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="card-shadow border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Part 1: Builder
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold text-foreground">
                  {part1Stats.total > 0 ? Math.round((part1Stats.correct / part1Stats.total) * 100) : 0}%
                </span>
                <span className="text-sm text-muted-foreground">
                  {part1Stats.correct}/{part1Stats.total}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="card-shadow border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-accent" />
                Part 2: Practice
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold text-foreground">
                  {part2Stats.total > 0 ? Math.round((part2Stats.correct / part2Stats.total) * 100) : 0}%
                </span>
                <span className="text-sm text-muted-foreground">
                  {part2Stats.correct}/{part2Stats.total}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="card-shadow border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-warning" />
                Part 3: Challenge
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold text-foreground">
                  {part3Stats.total > 0 ? Math.round((part3Stats.correct / part3Stats.total) * 100) : 0}%
                </span>
                <span className="text-sm text-muted-foreground">
                  {part3Stats.correct}/{part3Stats.total}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Strategy & Challenge Info */}
        {(strategies.length > 0 || challenges.length > 0) && (
          <Card className="card-shadow border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-success" />
                Strategies & Challenges
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {strategies.map((s) => (
                  <span key={s.strategy} className="px-3 py-1.5 bg-accent/10 text-accent rounded-full text-sm font-medium">
                    {STRATEGY_LABELS[s.strategy] || s.strategy} ({s.count})
                  </span>
                ))}
                {challenges.map((c) => (
                  <span key={c.strategy} className="px-3 py-1.5 bg-warning/10 text-warning rounded-full text-sm font-medium">
                    🏆 {CHALLENGE_LABELS[c.strategy] || c.strategy} ({c.count})
                  </span>
                ))}
              </div>
              {weakestDomainNote && (
                <p className="text-sm text-muted-foreground italic">{weakestDomainNote}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Domain Scores */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {domainSummaries.map((summary) => {
            const meta = DOMAIN_META[summary.domain];
            const Icon = meta.icon;
            const proficiencyLevel = getProficiencyLevel(summary.percentage);
            return (
              <Card key={summary.domain} className="card-shadow border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Icon className={`h-5 w-5 ${meta.color}`} />
                    {meta.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-bold text-foreground">{summary.percentage}%</span>
                    <span className={`text-sm px-2 py-1 rounded-full bg-muted ${meta.color}`}>
                      {proficiencyLevel}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full gradient-hero transition-all duration-500"
                      style={{ width: `${summary.percentage}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {summary.correct} of {summary.total} correct
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Student Gamification */}
        {studentGamification.length > 0 && (
          <Card className="card-shadow border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-warning" />
                Student Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {studentGamification.map((student) => {
                  const level = getAnimalLevel(student.total_points);
                  return (
                    <div key={student.student_name} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      <span className="text-2xl">{level.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{student.student_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {level.name} • {student.total_points} pts • {student.current_streak} day streak • {student.sessions_completed} sessions
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {student.badges.slice(0, 5).map((icon, i) => (
                          <span key={i} className="text-lg">{icon}</span>
                        ))}
                        {student.badges.length > 5 && (
                          <span className="text-xs text-muted-foreground">+{student.badges.length - 5}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {domainSummaries.every((s) => s.total === 0) && studentGamification.length === 0 && (
          <Card className="card-shadow border-border">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No student responses recorded for this session yet.</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default SessionSummary;
