import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, Download,
  ChevronDown, ChevronUp, Users, BarChart3, Calendar,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ───
interface StudentResponse {
  id: string;
  student_id: string;
  session_id: string;
  domain: string;
  is_correct: boolean;
  grade_band: string;
  created_at: string;
  session_part: string;
}

interface SessionStudent {
  id: string;
  student_name: string;
  session_id: string;
  joined_at: string;
}

interface SessionRecord {
  id: string;
  created_at: string;
  grade_band: string;
}

interface ContentHistory {
  student_name: string;
  theme: string;
  topic: string;
  grade_band: string;
  session_date: string;
  is_baseline: boolean;
}

interface StudentGrowthData {
  name: string;
  gradeBand: string;
  sessions: SessionDomainScores[];
  totalSessions: number;
  thisMonthSessions: number;
  lastActive: string;
  currentLevels: Record<string, ProficiencyLevel>;
  strongest: string;
  weakest: string;
  wasAdjusted: boolean;
}

interface SessionDomainScores {
  date: string;
  reading: number;
  writing: number;
  speaking: number;
  listening: number;
  gradeBand: string;
}

interface ProficiencyLevel {
  level: number;
  label: string;
  pct: number;
}

// ─── Proficiency Helpers ───
const PROFICIENCY_SCALE = [
  { min: 0, max: 20, level: 1, label: "Entering" },
  { min: 21, max: 40, level: 2, label: "Emerging" },
  { min: 41, max: 60, level: 3, label: "Developing" },
  { min: 61, max: 75, level: 4, label: "Expanding" },
  { min: 76, max: 90, level: 5, label: "Bridging" },
  { min: 91, max: 100, level: 6, label: "Reaching" },
];

function pctToProficiency(pct: number, gradeBand: string): ProficiencyLevel {
  const entry = PROFICIENCY_SCALE.find((s) => pct >= s.min && pct <= s.max) || PROFICIENCY_SCALE[0];
  if (gradeBand === "K-2" && entry.level > 3) {
    return { level: 3, label: "Developing", pct };
  }
  return { level: entry.level, label: entry.label, pct };
}

const DOMAIN_COLORS: Record<string, string> = {
  reading: "hsl(210, 80%, 45%)",
  writing: "hsl(170, 55%, 40%)",
  speaking: "hsl(38, 90%, 55%)",
  listening: "hsl(280, 60%, 55%)",
};

const DOMAIN_LABELS = ["reading", "writing", "speaking", "listening"];

function getTrendArrow(sessions: SessionDomainScores[]): "up" | "down" | "stable" {
  if (sessions.length < 2) return "stable";
  const recent = sessions.slice(0, 3);
  const older = sessions.slice(3, 6);
  if (older.length === 0) return "stable";

  const avgRecent = recent.reduce((sum, s) => {
    const avg = (s.reading + s.writing + s.speaking + s.listening) / 4;
    return sum + avg;
  }, 0) / recent.length;

  const avgOlder = older.reduce((sum, s) => {
    const avg = (s.reading + s.writing + s.speaking + s.listening) / 4;
    return sum + avg;
  }, 0) / older.length;

  const diff = avgRecent - avgOlder;
  if (diff > 5) return "up";
  if (diff < -5) return "down";
  return "stable";
}

// ─── CSV Export ───
function exportStudentCSV(student: StudentGrowthData) {
  const headers = ["Date", "Reading %", "Writing %", "Speaking %", "Listening %", "Reading Level", "Writing Level", "Speaking Level", "Listening Level", "Grade Band"];
  const rows = student.sessions.map((s) => {
    const rw = pctToProficiency(s.reading, s.gradeBand);
    const ww = pctToProficiency(s.writing, s.gradeBand);
    const sw = pctToProficiency(s.speaking, s.gradeBand);
    const lw = pctToProficiency(s.listening, s.gradeBand);
    return [s.date, s.reading, s.writing, s.speaking, s.listening, `${rw.level} ${rw.label}`, `${ww.level} ${ww.label}`, `${sw.level} ${sw.label}`, `${lw.level} ${lw.label}`, s.gradeBand].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${student.name}-proficiency-progress.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sparkline Component ───
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 6);
  const points = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * 60;
    const y = 20 - (v / max) * 18;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width="64" height="24" viewBox="0 0 64 24" className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Main Component ───
interface Props {
  teacherId: string;
}

const StudentGrowthDashboard = ({ teacherId }: Props) => {
  const [students, setStudents] = useState<StudentGrowthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<"30" | "90" | "all">("all");

  useEffect(() => {
    loadData();
  }, [teacherId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get all sessions for this teacher
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, created_at, grade_band")
        .eq("teacher_id", teacherId)
        .order("created_at", { ascending: false });

      if (!sessions || sessions.length === 0) {
        setStudents([]);
        setLoading(false);
        return;
      }

      const sessionIds = sessions.map((s) => s.id);
      const sessionMap = new Map<string, SessionRecord>();
      sessions.forEach((s) => sessionMap.set(s.id, s as SessionRecord));

      // Get all students across all sessions
      const { data: allStudents } = await supabase
        .from("session_students")
        .select("id, student_name, session_id, joined_at")
        .in("session_id", sessionIds);

      if (!allStudents || allStudents.length === 0) {
        setStudents([]);
        setLoading(false);
        return;
      }

      // Get all responses
      const { data: responses } = await supabase
        .from("student_responses")
        .select("id, student_id, session_id, domain, is_correct, grade_band, created_at, session_part")
        .in("session_id", sessionIds);

      // Group students by name
      const studentsByName = new Map<string, SessionStudent[]>();
      allStudents.forEach((s) => {
        const list = studentsByName.get(s.student_name) || [];
        list.push(s as SessionStudent);
        studentsByName.set(s.student_name, list);
      });

      // Build growth data per student
      const growthData: StudentGrowthData[] = [];
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      for (const [name, studentRecords] of studentsByName) {
        const studentIds = studentRecords.map((s) => s.id);
        const studentResponses = (responses || []).filter((r) => studentIds.includes(r.student_id));

        if (studentResponses.length === 0) continue;

        // Group responses by session
        const bySession = new Map<string, typeof studentResponses>();
        studentResponses.forEach((r) => {
          const list = bySession.get(r.session_id) || [];
          list.push(r);
          bySession.set(r.session_id, list);
        });

        // Calculate domain scores per session
        const sessionScores: SessionDomainScores[] = [];
        let latestGradeBand = "3-5";
        let wasAdjusted = false;

        // Sort sessions by date
        const sortedSessionIds = [...bySession.keys()].sort((a, b) => {
          const sa = sessionMap.get(a);
          const sb = sessionMap.get(b);
          return new Date(sb?.created_at || 0).getTime() - new Date(sa?.created_at || 0).getTime();
        });

        let prevGradeBand: string | null = null;

        for (const sid of sortedSessionIds) {
          const resps = bySession.get(sid) || [];
          const session = sessionMap.get(sid);
          const date = session ? new Date(session.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Unknown";
          const gb = (resps[0] as any)?.grade_band || session?.grade_band || "3-5";

          if (prevGradeBand && prevGradeBand !== gb) wasAdjusted = true;
          prevGradeBand = gb;

          const domainTotals: Record<string, { correct: number; total: number }> = {};
          for (const r of resps) {
            const d = r.domain.toLowerCase();
            if (!domainTotals[d]) domainTotals[d] = { correct: 0, total: 0 };
            domainTotals[d].total++;
            if (r.is_correct) domainTotals[d].correct++;
          }

          const pct = (d: string) => {
            const t = domainTotals[d];
            return t && t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
          };

          sessionScores.push({
            date,
            reading: pct("reading"),
            writing: pct("writing"),
            speaking: pct("speaking"),
            listening: pct("listening"),
            gradeBand: gb,
          });

          if (sessionScores.length === 1) latestGradeBand = gb;
        }

        // Current levels from most recent session
        const latest = sessionScores[0] || { reading: 0, writing: 0, speaking: 0, listening: 0 };
        const currentLevels: Record<string, ProficiencyLevel> = {
          reading: pctToProficiency(latest.reading, latestGradeBand),
          writing: pctToProficiency(latest.writing, latestGradeBand),
          speaking: pctToProficiency(latest.speaking, latestGradeBand),
          listening: pctToProficiency(latest.listening, latestGradeBand),
        };

        // Strongest & weakest
        const domainPcts = DOMAIN_LABELS.map((d) => ({ domain: d, pct: latest[d as keyof typeof latest] as number }));
        domainPcts.sort((a, b) => b.pct - a.pct);
        const strongest = domainPcts[0]?.domain || "reading";
        const weakest = domainPcts[domainPcts.length - 1]?.domain || "writing";

        // Session counts
        const totalSessions = sortedSessionIds.length;
        const thisMonthSessions = sortedSessionIds.filter((sid) => {
          const s = sessionMap.get(sid);
          return s && new Date(s.created_at) >= thisMonthStart;
        }).length;

        // Last active
        const lastSession = sessionMap.get(sortedSessionIds[0]);
        const lastActive = lastSession ? new Date(lastSession.created_at).toLocaleDateString() : "N/A";

        growthData.push({
          name,
          gradeBand: latestGradeBand,
          sessions: sessionScores.reverse(), // chronological order for charts
          totalSessions,
          thisMonthSessions,
          lastActive,
          currentLevels,
          strongest,
          weakest,
          wasAdjusted,
        });
      }

      growthData.sort((a, b) => a.name.localeCompare(b.name));
      setStudents(growthData);
    } catch (err) {
      console.error("Failed to load growth data:", err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Class Overview Calculations ───
  const classOverview = useMemo(() => {
    if (students.length === 0) return null;

    const domainAvgs: Record<string, { sum: number; count: number }> = {};
    DOMAIN_LABELS.forEach((d) => { domainAvgs[d] = { sum: 0, count: 0 }; });

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
    let thisWeekSessions = 0;
    let lastWeekSessions = 0;
    const inactiveStudents: string[] = [];

    students.forEach((s) => {
      DOMAIN_LABELS.forEach((d) => {
        if (s.currentLevels[d]) {
          domainAvgs[d].sum += s.currentLevels[d].level;
          domainAvgs[d].count++;
        }
      });

      s.sessions.forEach((sess) => {
        // Rough date parsing from formatted string
        const parsed = new Date(sess.date + ", " + now.getFullYear());
        if (!isNaN(parsed.getTime())) {
          if (parsed >= sevenDaysAgo) thisWeekSessions++;
          else if (parsed >= fourteenDaysAgo) lastWeekSessions++;
        }
      });

      const lastDate = new Date(s.lastActive);
      if (!isNaN(lastDate.getTime()) && lastDate < sevenDaysAgo) {
        inactiveStudents.push(s.name);
      }
    });

    const avgLevels: Record<string, number> = {};
    DOMAIN_LABELS.forEach((d) => {
      avgLevels[d] = domainAvgs[d].count > 0 ? Math.round((domainAvgs[d].sum / domainAvgs[d].count) * 10) / 10 : 0;
    });

    const allTrends = students.map((s) => getTrendArrow(s.sessions));
    const upCount = allTrends.filter((t) => t === "up").length;
    const downCount = allTrends.filter((t) => t === "down").length;
    const classTrend: "up" | "down" | "stable" = upCount > downCount ? "up" : downCount > upCount ? "down" : "stable";

    return { avgLevels, classTrend, thisWeekSessions, lastWeekSessions, inactiveStudents };
  }, [students]);

  // ─── Filter sessions by date range ───
  const getFilteredSessions = (sessions: SessionDomainScores[]) => {
    if (dateFilter === "all") return sessions;
    const now = new Date();
    const days = dateFilter === "30" ? 30 : 90;
    const cutoff = new Date(now.getTime() - days * 86400000);
    return sessions.filter((s) => {
      const parsed = new Date(s.date + ", " + now.getFullYear());
      return !isNaN(parsed.getTime()) ? parsed >= cutoff : true;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p>No student data yet. Complete some sessions to see growth trends.</p>
      </div>
    );
  }

  const barChartData = classOverview
    ? DOMAIN_LABELS.map((d) => ({
        domain: d.charAt(0).toUpperCase() + d.slice(1),
        level: classOverview.avgLevels[d],
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Class Overview */}
      {classOverview && (
        <Card className="card-shadow border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Class Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Bar Chart */}
              <div className="md:col-span-2">
                <p className="text-sm font-medium text-foreground mb-2">Average Proficiency Level by Domain</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={barChartData} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="domain" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis domain={[0, 6]} ticks={[1, 2, 3, 4, 5, 6]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                      formatter={(value: number) => {
                        const entry = PROFICIENCY_SCALE.find((s) => Math.round(value) === s.level);
                        return [`Level ${value} ${entry?.label || ""}`, "Avg Level"];
                      }}
                    />
                    <Bar dataKey="level" fill="hsl(210, 80%, 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Stats */}
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Class Trend</p>
                  <div className="flex items-center gap-2 mt-1">
                    {classOverview.classTrend === "up" && <TrendingUp className="h-5 w-5 text-success" />}
                    {classOverview.classTrend === "down" && <TrendingDown className="h-5 w-5 text-destructive" />}
                    {classOverview.classTrend === "stable" && <Minus className="h-5 w-5 text-muted-foreground" />}
                    <span className="text-sm font-medium text-foreground capitalize">{classOverview.classTrend === "up" ? "Improving" : classOverview.classTrend === "down" ? "Needs Attention" : "Stable"}</span>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Sessions This Week</p>
                  <p className="text-2xl font-bold text-foreground">{classOverview.thisWeekSessions}</p>
                  <p className="text-xs text-muted-foreground">vs. {classOverview.lastWeekSessions} last week</p>
                </div>

                {classOverview.inactiveStudents.length > 0 && (
                  <div className="bg-warning/10 border border-warning/20 rounded-lg p-3">
                    <p className="text-xs font-medium text-warning flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Inactive 7+ days
                    </p>
                    <p className="text-xs text-foreground mt-1">
                      {classOverview.inactiveStudents.join(", ")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Student Cards */}
      <div className="grid grid-cols-1 gap-4">
        {students.map((student) => {
          const isExpanded = expandedStudent === student.name;
          const trend = getTrendArrow(student.sessions);
          const filteredSessions = getFilteredSessions(student.sessions);

          // Sparkline data: WIDA levels for last 8 sessions
          const sparkData = student.sessions.slice(-8);

          return (
            <Card key={student.name} className="card-shadow border-border overflow-hidden">
              {/* Summary Row */}
              <div
                className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedStudent(isExpanded ? null : student.name)}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Name & Grade */}
                  <div className="flex items-center gap-2 sm:w-40 shrink-0">
                    <div>
                      <p className="font-bold text-foreground">{student.name}</p>
                      <div className="flex items-center gap-1">
                        <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">{student.gradeBand}</span>
                        {student.wasAdjusted && (
                          <span className="text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded-full">adjusted</span>
                        )}
                        {trend === "up" && <TrendingUp className="h-3 w-3 text-success" />}
                        {trend === "down" && <TrendingDown className="h-3 w-3 text-destructive" />}
                      </div>
                    </div>
                  </div>

                  {/* Domain Levels */}
                  <div className="grid grid-cols-4 gap-2 flex-1">
                    {DOMAIN_LABELS.map((d) => {
                      const wida = student.currentLevels[d];
                      const isStrongest = d === student.strongest;
                      const isWeakest = d === student.weakest;
                      return (
                        <div
                          key={d}
                          className={`text-center p-2 rounded-lg ${
                            isStrongest ? "bg-success/10 border border-success/30" :
                            isWeakest ? "bg-warning/10 border border-warning/30" :
                            "bg-muted/50"
                          }`}
                        >
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{d.slice(0, 4)}</p>
                          <p className="text-lg font-bold text-foreground">{wida?.level || 0}</p>
                          <p className="text-[10px] text-muted-foreground">{wida?.label || "N/A"}</p>
                          <Sparkline
                            data={sparkData.map((s) => pctToProficiency(s[d as keyof SessionDomainScores] as number, s.gradeBand).level)}
                            color={DOMAIN_COLORS[d]}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-3 sm:w-36 shrink-0 text-xs text-muted-foreground">
                    <div>
                      <p><span className="font-medium text-foreground">{student.totalSessions}</span> sessions</p>
                      <p>{student.thisMonthSessions} this month</p>
                      <p className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {student.lastActive}
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
                  </div>
                </div>
              </div>

              {/* Expanded View */}
              {isExpanded && (
                <div className="border-t border-border p-4 space-y-4 bg-muted/10">
                  {/* Date filter */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex gap-1">
                      {(["30", "90", "all"] as const).map((f) => (
                        <Button
                          key={f}
                          variant={dateFilter === f ? "default" : "outline"}
                          size="sm"
                          onClick={() => setDateFilter(f)}
                          className="text-xs h-7"
                        >
                          {f === "all" ? "All Time" : `Last ${f} Days`}
                        </Button>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => exportStudentCSV(student)} className="text-xs h-7">
                      <Download className="h-3 w-3 mr-1" /> Export CSV
                    </Button>
                  </div>

                  {/* Line Chart */}
                  <div className="bg-card rounded-lg border border-border p-3">
                    <p className="text-sm font-medium text-foreground mb-2">Proficiency Level Over Time</p>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={filteredSessions.map((s) => ({
                        date: s.date,
                        Reading: pctToProficiency(s.reading, s.gradeBand).level,
                        Writing: pctToProficiency(s.writing, s.gradeBand).level,
                        Speaking: pctToProficiency(s.speaking, s.gradeBand).level,
                        Listening: pctToProficiency(s.listening, s.gradeBand).level,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                          angle={-30}
                          textAnchor="end"
                          height={50}
                        />
                        <YAxis
                          domain={[0, 6]}
                          ticks={[1, 2, 3, 4, 5, 6]}
                          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                          tickFormatter={(v) => {
                            const wida = WIDA_SCALE.find((s) => s.level === v);
                            return wida ? `${v} ${wida.label.slice(0, 3)}` : `${v}`;
                          }}
                          width={65}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: 12,
                          }}
                          formatter={(value: number, name: string) => {
                            const wida = WIDA_SCALE.find((s) => s.level === value);
                            return [`Level ${value} (${wida?.label || ""})`, name];
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="Reading" stroke={DOMAIN_COLORS.reading} strokeWidth={2} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="Writing" stroke={DOMAIN_COLORS.writing} strokeWidth={2} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="Speaking" stroke={DOMAIN_COLORS.speaking} strokeWidth={2} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="Listening" stroke={DOMAIN_COLORS.listening} strokeWidth={2} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Grade band adjustment indicator */}
                  {student.wasAdjusted && (
                    <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 text-xs text-muted-foreground">
                      📊 This student's grade band was auto-adjusted during one or more sessions based on their performance.
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default StudentGrowthDashboard;
