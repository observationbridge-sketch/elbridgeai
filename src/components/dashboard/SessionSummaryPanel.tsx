import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, PenTool, Mic, Headphones, Users, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface StudentDomainScores {
  student_name: string;
  reading: number;
  writing: number;
  speaking: number;
  listening: number;
  overall: number;
  proficiencyLevel: number;
  proficiencyLabel: string;
  gradeBand: string;
  completed: boolean;
}

interface SessionSummaryData {
  sessionId: string;
  code: string;
  date: string;
  joined: number;
  completed: number;
  students: StudentDomainScores[];
  classAvg: { reading: number; writing: number; speaking: number; listening: number };
  strongest: string;
  weakest: string;
}

const DOMAIN_ICONS: Record<string, any> = {
  reading: BookOpen,
  writing: PenTool,
  speaking: Mic,
  listening: Headphones,
};

function estimateProficiency(pct: number, gradeBand: string): { level: number; label: string } {
  if (gradeBand === "K-2") {
    if (pct >= 70) return { level: 3, label: "Developing" };
    if (pct >= 40) return { level: 2, label: "Emerging" };
    return { level: 1, label: "Entering" };
  }
  // 3-5
  if (pct >= 90) return { level: 6, label: "Reaching" };
  if (pct >= 75) return { level: 5, label: "Bridging" };
  return { level: 4, label: "Expanding" };
}

interface Props {
  teacherId: string;
}

const SessionSummaryPanel = ({ teacherId }: Props) => {
  const [sessions, setSessions] = useState<SessionSummaryData[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessionSummaries();
  }, [teacherId]);

  const loadSessionSummaries = async () => {
    setLoading(true);
    const { data: sessionRows } = await supabase
      .from("sessions")
      .select("id, code, created_at, status")
      .eq("teacher_id", teacherId)
      .eq("status", "ended")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!sessionRows || sessionRows.length === 0) {
      setLoading(false);
      return;
    }

    const summaries: SessionSummaryData[] = [];

    for (const session of sessionRows) {
      const { data: students } = await supabase
        .from("session_students")
        .select("id, student_name")
        .eq("session_id", session.id);

      if (!students || students.length === 0) continue;

      const { data: responses } = await supabase
        .from("student_responses")
        .select("student_id, domain, is_correct, grade_band")
        .eq("session_id", session.id);

      const studentMap = new Map<string, { name: string; domains: Record<string, { correct: number; total: number }> }>();
      
      for (const s of students) {
        studentMap.set(s.id, {
          name: s.student_name,
          domains: {
            reading: { correct: 0, total: 0 },
            writing: { correct: 0, total: 0 },
            speaking: { correct: 0, total: 0 },
            listening: { correct: 0, total: 0 },
          },
        });
      }

      const completedStudents = new Map<string, string>(); // studentId -> gradeBand

      for (const r of (responses || [])) {
        const student = studentMap.get(r.student_id);
        if (!student) continue;
        completedStudents.set(r.student_id, (r as any).grade_band || "3-5");
        const d = r.domain as string;
        if (student.domains[d]) {
          student.domains[d].total++;
          if (r.is_correct) student.domains[d].correct++;
        }
      }

      const studentScores: StudentDomainScores[] = [];
      const classTotal = { reading: 0, writing: 0, speaking: 0, listening: 0, count: 0 };

      for (const [sid, student] of studentMap) {
        const pct = (d: string) => {
          const data = student.domains[d];
          return data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
        };
        const r = pct("reading"), w = pct("writing"), s = pct("speaking"), l = pct("listening");
        const overall = Math.round((r + w + s + l) / 4);
        const hasData = completedStudents.has(sid);
        const studentGradeBand = completedStudents.get(sid) || "3-5";
        const wida = estimateWida(overall, studentGradeBand);

        studentScores.push({
          student_name: student.name,
          reading: r, writing: w, speaking: s, listening: l,
          overall,
          widaLevel: wida.level,
          widaLabel: wida.label,
          gradeBand: studentGradeBand,
          completed: hasData,
        });

        if (hasData) {
          classTotal.reading += r;
          classTotal.writing += w;
          classTotal.speaking += s;
          classTotal.listening += l;
          classTotal.count++;
        }
      }

      const c = classTotal.count || 1;
      const avg = {
        reading: Math.round(classTotal.reading / c),
        writing: Math.round(classTotal.writing / c),
        speaking: Math.round(classTotal.speaking / c),
        listening: Math.round(classTotal.listening / c),
      };

      const domains = [
        { name: "Reading", val: avg.reading },
        { name: "Writing", val: avg.writing },
        { name: "Speaking", val: avg.speaking },
        { name: "Listening", val: avg.listening },
      ];
      const strongest = domains.reduce((a, b) => (b.val > a.val ? b : a)).name;
      const weakest = domains.reduce((a, b) => (b.val < a.val ? b : a)).name;

      summaries.push({
        sessionId: session.id,
        code: session.code,
        date: new Date(session.created_at).toLocaleDateString(),
        joined: students.length,
        completed: completedStudents.size,
        students: studentScores.sort((a, b) => b.overall - a.overall),
        classAvg: avg,
        strongest,
        weakest,
      });
    }

    setSessions(summaries);
    if (summaries.length > 0) setExpandedId(summaries[0].sessionId);
    setLoading(false);
  };

  if (loading) return null;
  if (sessions.length === 0) return null;

  const visibleSessions = showPast ? sessions : sessions.slice(0, 1);

  return (
    <Card className="card-shadow border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Session Summaries
          </CardTitle>
          {sessions.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => setShowPast(!showPast)}>
              {showPast ? "Show Latest Only" : `View Past Sessions (${sessions.length})`}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {visibleSessions.map((session) => {
          const isExpanded = expandedId === session.sessionId;
          return (
            <div key={session.sessionId} className="border border-border rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
                onClick={() => setExpandedId(isExpanded ? null : session.sessionId)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-primary">{session.code}</span>
                  <span className="text-sm text-muted-foreground">{session.date}</span>
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                    <Users className="h-3 w-3 inline mr-1" />{session.completed}/{session.joined} completed
                  </span>
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-4">
                  {/* Class Averages */}
                  <div className="grid grid-cols-4 gap-2">
                    {(["reading", "writing", "speaking", "listening"] as const).map((d) => {
                      const Icon = DOMAIN_ICONS[d];
                      const val = session.classAvg[d];
                      return (
                        <div key={d} className="bg-muted/50 rounded-lg p-3 text-center">
                          <Icon className="h-4 w-4 mx-auto mb-1 text-primary" />
                          <p className="text-lg font-bold text-foreground">{val}%</p>
                          <p className="text-xs text-muted-foreground capitalize">{d}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Strongest / Weakest */}
                  <div className="flex gap-3">
                    <div className="flex-1 bg-success/10 border border-success/20 rounded-lg p-3">
                      <p className="text-xs text-success font-medium">🌟 Strongest</p>
                      <p className="text-sm font-bold text-foreground">{session.strongest}</p>
                    </div>
                    <div className="flex-1 bg-warning/10 border border-warning/20 rounded-lg p-3">
                      <p className="text-xs text-warning font-medium">⚠️ Needs Support</p>
                      <p className="text-sm font-bold text-foreground">{session.weakest}</p>
                    </div>
                  </div>

                  {/* Student table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Student</th>
                          <th className="text-center py-2 px-1 text-muted-foreground font-medium">📖</th>
                          <th className="text-center py-2 px-1 text-muted-foreground font-medium">✍️</th>
                          <th className="text-center py-2 px-1 text-muted-foreground font-medium">🗣️</th>
                          <th className="text-center py-2 px-1 text-muted-foreground font-medium">🎧</th>
                          <th className="text-center py-2 px-1 text-muted-foreground font-medium">Level</th>
                        </tr>
                      </thead>
                      <tbody>
                        {session.students.map((s) => (
                          <tr key={s.student_name} className="border-b border-border/50">
                            <td className="py-2 px-2 font-medium text-foreground">
                              {s.student_name}
                              {!s.completed && <span className="text-xs text-muted-foreground ml-1">(incomplete)</span>}
                              {s.gradeBand !== "3-5" && (
                                <span className="text-xs bg-accent/10 text-accent ml-1 px-1.5 py-0.5 rounded-full">{s.gradeBand}</span>
                              )}
                            </td>
                            <td className="text-center py-2 px-1">
                              <ScoreCell value={s.reading} />
                            </td>
                            <td className="text-center py-2 px-1">
                              <ScoreCell value={s.writing} />
                            </td>
                            <td className="text-center py-2 px-1">
                              <ScoreCell value={s.speaking} />
                            </td>
                            <td className="text-center py-2 px-1">
                              <ScoreCell value={s.listening} />
                            </td>
                            <td className="text-center py-2 px-1">
                              <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full" title={s.widaLabel}>
                                {s.widaLevel} - {s.widaLabel}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

function ScoreCell({ value }: { value: number }) {
  const color = value >= 70 ? "text-success" : value >= 40 ? "text-warning" : "text-destructive";
  return <span className={`text-sm font-bold ${color}`}>{value}%</span>;
}

export default SessionSummaryPanel;
