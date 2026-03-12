import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, ArrowLeft, BookOpen, PenTool, Mic, Headphones, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type DomainSummary = {
  domain: string;
  total: number;
  correct: number;
  percentage: number;
};

const DOMAIN_META: Record<string, { icon: any; color: string; label: string }> = {
  reading: { icon: BookOpen, color: "text-primary", label: "Reading" },
  writing: { icon: PenTool, color: "text-accent", label: "Writing" },
  speaking: { icon: Mic, color: "text-success", label: "Speaking" },
  listening: { icon: Headphones, color: "text-warning", label: "Listening" },
};

function getWidaLevel(pct: number): string {
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

  useEffect(() => {
    if (!sessionId) return;

    const load = async () => {
      // Get session info
      const { data: session } = await supabase
        .from("sessions")
        .select("code")
        .eq("id", sessionId)
        .single();
      if (session) setSessionCode(session.code);

      // Get student count
      const { count } = await supabase
        .from("session_students")
        .select("*", { count: "exact", head: true })
        .eq("session_id", sessionId);
      setStudentCount(count || 0);

      // Get responses
      const { data: responses } = await supabase
        .from("student_responses")
        .select("domain, is_correct")
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {domainSummaries.map((summary) => {
            const meta = DOMAIN_META[summary.domain];
            const Icon = meta.icon;
            const widaLevel = getWidaLevel(summary.percentage);
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
                      {widaLevel}
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

        {domainSummaries.every((s) => s.total === 0) && (
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
