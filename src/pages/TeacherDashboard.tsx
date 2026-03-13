import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Copy, LogOut, Users, Play, Square, History, Trophy, Link, Download, Check, QrCode, Send } from "lucide-react";
import EmailSettings from "@/components/dashboard/EmailSettings";
import SessionSummaryPanel from "@/components/dashboard/SessionSummaryPanel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getAnimalLevel } from "@/components/gamification/constants";
import { QRCodeCanvas } from "qrcode.react";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

interface StudentOverview {
  student_name: string;
  total_points: number;
  current_streak: number;
  sessions_completed: number;
}

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [studentCount, setStudentCount] = useState(0);
  const [sessions, setSessions] = useState<any[]>([]);
  const [topStudents, setTopStudents] = useState<StudentOverview[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/teacher/auth");
        return;
      }
      setUser(session.user);
      loadSessions(session.user.id);
      loadTopStudents(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/teacher/auth");
      else setUser(session.user);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadSessions = async (userId: string) => {
    const { data } = await supabase
      .from("sessions")
      .select("*, session_students(count)")
      .eq("teacher_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setSessions(data);

    const active = data?.find((s: any) => s.status === "active");
    if (active) {
      setSessionCode(active.code);
      setSessionActive(true);
      pollStudents(active.id);
    }
  };

  const loadTopStudents = async (userId: string) => {
    const { data } = await supabase
      .from("student_points")
      .select("student_name, total_points, current_streak, sessions_completed")
      .eq("teacher_id", userId)
      .order("total_points", { ascending: false })
      .limit(10);
    if (data) setTopStudents(data);
  };

  const pollStudents = async (sessionId: string) => {
    const { count } = await supabase
      .from("session_students")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId);
    setStudentCount(count || 0);
  };

  const startSession = async () => {
    if (!user) return;
    const code = generateCode();
    const { data, error } = await supabase
      .from("sessions")
      .insert({ teacher_id: user.id, code, status: "active" })
      .select()
      .single();
    if (error) {
      toast.error("Failed to start session");
      return;
    }
    setSessionCode(code);
    setSessionActive(true);
    setStudentCount(0);
    toast.success("Session started!");

    const interval = setInterval(async () => {
      if (data) await pollStudents(data.id);
    }, 5000);
    (window as any).__sessionPoll = interval;
  };

  const endSession = async () => {
    if (!sessionCode) return;
    await supabase
      .from("sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("code", sessionCode)
      .eq("teacher_id", user.id);
    setSessionActive(false);
    setSessionCode(null);
    setStudentCount(0);
    clearInterval((window as any).__sessionPoll);
    toast.success("Session ended");
    if (user) loadSessions(user.id);
  };

  const [linkCopied, setLinkCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const joinUrl = sessionCode ? `https://elbridgeai.lovable.app/join/${sessionCode}` : "";

  const copyCode = () => {
    if (sessionCode) {
      navigator.clipboard.writeText(sessionCode);
      toast.success("Code copied!");
    }
  };

  const copyLink = useCallback(() => {
    if (joinUrl) {
      navigator.clipboard.writeText(joinUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }, [joinUrl]);

  const downloadQR = useCallback(() => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `ELBridgeAI-Join-${sessionCode}.png`;
    a.click();
  }, [sessionCode]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <Brain className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold text-foreground">ElbridgeAI</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.user_metadata?.full_name || user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <h1 className="text-3xl font-bold text-foreground">Teacher Dashboard</h1>

        {/* Session Control */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="card-shadow border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {sessionActive ? <Square className="h-5 w-5 text-destructive" /> : <Play className="h-5 w-5 text-success" />}
                Live Session
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sessionActive && sessionCode ? (
                <>
                  <div className="bg-muted rounded-lg p-6 text-center">
                    <p className="text-sm text-muted-foreground mb-1">Share this code with students</p>
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-5xl font-mono font-bold tracking-[0.2em] text-primary">
                        {sessionCode}
                      </span>
                      <Button variant="ghost" size="icon" onClick={copyCode}>
                        <Copy className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                  {/* Join Link */}
                  <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Link className="h-4 w-4 text-primary" />
                      Student Join Link
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono truncate text-muted-foreground">
                        {joinUrl.replace("https://", "")}
                      </code>
                      <Button variant="outline" size="sm" onClick={copyLink} className="shrink-0">
                        {linkCopied ? <><Check className="h-3 w-3 mr-1" /> Copied!</> : <><Copy className="h-3 w-3 mr-1" /> Copy Link</>}
                      </Button>
                    </div>
                  </div>

                  {/* QR Code */}
                  <div className="bg-card border border-border rounded-lg p-4 flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground self-start">
                      <QrCode className="h-4 w-4 text-primary" />
                      QR Code — Scan to Join
                    </div>
                    <div ref={qrRef} className="bg-white p-4 rounded-xl">
                      <QRCodeCanvas value={joinUrl} size={220} level="H" />
                    </div>
                    <Button variant="outline" size="sm" onClick={downloadQR}>
                      <Download className="h-3 w-3 mr-1" /> Download QR Code
                    </Button>
                  </div>

                  <Button variant="destructive" className="w-full" onClick={endSession}>
                    <Square className="h-4 w-4 mr-2" /> End Session
                  </Button>
                </>
              ) : (
                <Button variant="hero" className="w-full" size="lg" onClick={startSession}>
                  <Play className="h-4 w-4 mr-2" /> Start New Session
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="card-shadow border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-accent" />
                Students Connected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-6">
                <span className="text-6xl font-bold text-accent">{studentCount}</span>
                <p className="text-muted-foreground mt-2">
                  {sessionActive ? "students in session" : "No active session"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Students Leaderboard */}
        {topStudents.length > 0 && (
          <Card className="card-shadow border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-warning" />
                Top Students
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topStudents.map((student, i) => {
                  const level = getAnimalLevel(student.total_points);
                  return (
                    <div key={student.student_name} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      <span className={`text-lg font-bold w-8 text-center ${i < 3 ? "text-warning" : "text-muted-foreground"}`}>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                      </span>
                      <span className="text-2xl">{level.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{student.student_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {level.name} • {student.current_streak} day streak • {student.sessions_completed} sessions
                        </p>
                      </div>
                      <span className="text-sm font-bold text-primary">{student.total_points} pts</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Session Summary Panel */}
        {user && <SessionSummaryPanel teacherId={user.id} />}

        {/* Email Settings */}
        {user && <EmailSettings userId={user.id} />}

        {/* Session History */}
        <Card className="card-shadow border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              Session History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No sessions yet. Start your first session!</p>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => session.status === "ended" && navigate(`/teacher/session/${session.id}`)}
                  >
                    <div>
                      <span className="font-mono text-sm text-primary">{session.code}</span>
                      <span className="text-muted-foreground text-sm ml-3">
                        {new Date(session.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      session.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                    }`}>
                      {session.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default TeacherDashboard;
