import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Brain, Copy, LogOut, Users, Play, Square, History, Trophy, Link, Download, Check, QrCode, BarChart3,
  GraduationCap, Loader2, AlertTriangle,
} from "lucide-react";
import EmailSettings from "@/components/dashboard/EmailSettings";
import SessionSummaryPanel from "@/components/dashboard/SessionSummaryPanel";
import ContentHistoryPanel from "@/components/dashboard/ContentHistoryPanel";
import StudentGrowthDashboard from "@/components/dashboard/StudentGrowthDashboard";
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

const ALL_THEMES = [
  { label: "Nature & animals", emoji: "🌿" },
  { label: "Superheroes", emoji: "⚡" },
  { label: "Fantasy & myths", emoji: "🧙" },
  { label: "Sports & games", emoji: "⚽" },
  { label: "Science", emoji: "🔬" },
  { label: "School & classroom life", emoji: "📚" },
  { label: "Social studies", emoji: "🗺️" },
  { label: "Character development", emoji: "💖" },
] as const;

interface StudentOverview {
  student_name: string;
  total_points: number;
  current_streak: number;
  sessions_completed: number;
}

interface ConnectedStudent {
  id: string;
  student_name: string;
  joined_at: string;
}

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false); // "live" vs "waiting"
  const [studentCount, setStudentCount] = useState(0);
  const [connectedStudents, setConnectedStudents] = useState<ConnectedStudent[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [topStudents, setTopStudents] = useState<StudentOverview[]>([]);
  const [gradeBand, setGradeBand] = useState<"K-2" | "3-5">("3-5");
  const [themeOptions, setThemeOptions] = useState<string[]>(["Nature & animals", "Superheroes", "Fantasy & myths"]);
  const [activeGradeBand, setActiveGradeBand] = useState<string | null>(null);
  const [dashboardTab, setDashboardTab] = useState<"sessions" | "growth">("sessions");
  const [generating, setGenerating] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [gradeBandChangeOpen, setGradeBandChangeOpen] = useState(false);
  const [pendingGradeBand, setPendingGradeBand] = useState<"K-2" | "3-5" | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate("/teacher/auth"); return; }
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
      setSessionId(active.id);
      setSessionActive(true);
      setActiveGradeBand(active.grade_band || "3-5");
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

  const pollStudents = async (sid: string) => {
    const { data, count } = await supabase
      .from("session_students")
      .select("id, student_name, joined_at", { count: "exact" })
      .eq("session_id", sid)
      .order("joined_at", { ascending: true });
    setStudentCount(count || 0);
    if (data) setConnectedStudents(data);
  };

  // Polling interval for active session
  useEffect(() => {
    if (!sessionActive || !sessionId) return;
    const interval = setInterval(() => pollStudents(sessionId), 4000);
    return () => clearInterval(interval);
  }, [sessionActive, sessionId]);

  const createSession = async () => {
    if (!user) return;
    if (gradeBand === "K-2" && themeOptions.length < 1) {
      toast.error("Select at least 1 theme option for K-2 students");
      return;
    }
    setGenerating(true);
    const code = generateCode();
    const { data, error } = await supabase
      .from("sessions")
      .insert({ teacher_id: user.id, code, status: "active", grade_band: gradeBand, theme_options: themeOptions } as any)
      .select()
      .single();
    if (error) {
      toast.error("Failed to create session");
      setGenerating(false);
      return;
    }
    setSessionCode(code);
    setSessionId(data.id);
    setSessionActive(true);
    setSessionStarted(false);
    setActiveGradeBand(gradeBand);
    setStudentCount(0);
    setConnectedStudents([]);
    setGenerating(false);
    toast.success(`Session created! Share the code with students.`);
  };

  const handleStartLive = () => {
    setSessionStarted(true);
    toast.success("Session is now live! Students can begin activities.");
  };

  const endSession = async () => {
    if (!sessionCode) return;
    await supabase
      .from("sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("code", sessionCode)
      .eq("teacher_id", user.id);
    setSessionActive(false);
    setSessionStarted(false);
    setSessionCode(null);
    setSessionId(null);
    setStudentCount(0);
    setConnectedStudents([]);
    setActiveGradeBand(null);
    setEndConfirmOpen(false);
    toast.success("Session ended");
    if (user) loadSessions(user.id);
    if (user) loadSessions(user.id);
  };

  const handleGradeBandChange = (newBand: "K-2" | "3-5") => {
    if (sessionActive && studentCount > 0) {
      setPendingGradeBand(newBand);
      setGradeBandChangeOpen(true);
    } else {
      setGradeBand(newBand);
    }
  };

  const confirmGradeBandChange = async () => {
    if (!pendingGradeBand) return;
    setGradeBand(pendingGradeBand);
    setActiveGradeBand(pendingGradeBand);
    if (sessionCode && user) {
      await supabase.from("sessions").update({ grade_band: pendingGradeBand } as any).eq("code", sessionCode).eq("teacher_id", user.id);
    }
    setPendingGradeBand(null);
    setGradeBandChangeOpen(false);
    toast.success(`Grade band changed to ${pendingGradeBand}`);
  };

  const [linkCopied, setLinkCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const joinUrl = sessionCode ? `https://elbridgeai.lovable.app/join/${sessionCode}` : "";

  const copyCode = () => {
    if (sessionCode) { navigator.clipboard.writeText(sessionCode); toast.success("Code copied!"); }
  };
  const copyLink = useCallback(() => {
    if (joinUrl) { navigator.clipboard.writeText(joinUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }
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

  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/"); };

  const sessionStatus = !sessionActive
    ? "No active session"
    : !sessionStarted
    ? "Waiting for students…"
    : "Session Live 🟢";

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
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-3xl font-bold text-foreground">Teacher Dashboard</h1>
          <div className="flex bg-muted rounded-lg p-1 gap-1">
            <Button variant={dashboardTab === "sessions" ? "default" : "ghost"} size="sm" onClick={() => setDashboardTab("sessions")} className="gap-1.5">
              <Play className="h-4 w-4" /> Sessions
            </Button>
            <Button variant={dashboardTab === "growth" ? "default" : "ghost"} size="sm" onClick={() => setDashboardTab("growth")} className="gap-1.5">
              <BarChart3 className="h-4 w-4" /> Student Growth
            </Button>
          </div>
        </div>

        {dashboardTab === "growth" ? (
          user && <StudentGrowthDashboard teacherId={user.id} />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ─── Left Panel: Session Setup / Active Session ─── */}
              <Card className="card-shadow border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {sessionActive ? <Square className="h-5 w-5 text-destructive" /> : <Play className="h-5 w-5 text-success" />}
                    {sessionActive ? "Live Session" : "New Session Setup"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sessionActive && sessionCode ? (
                    <>
                      {/* Session info bar */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-3 py-1 rounded-full font-medium ${sessionStarted ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                          {sessionStatus}
                        </span>
                        {activeGradeBand && (
                          <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">
                            {activeGradeBand}
                          </span>
                        )}
                        {activeTheme && (
                          <span className="text-xs bg-accent/10 text-accent px-3 py-1 rounded-full font-medium">
                            {ALL_THEMES.find(t => t.label === activeTheme)?.emoji} {activeTheme}
                          </span>
                        )}
                      </div>

                      {/* Code display */}
                      <div className="bg-muted rounded-lg p-6 text-center">
                        <p className="text-sm text-muted-foreground mb-1">Share this code with students</p>
                        <div className="flex items-center justify-center gap-3">
                          <span className="text-5xl font-mono font-bold tracking-[0.2em] text-primary">{sessionCode}</span>
                          <Button variant="ghost" size="icon" onClick={copyCode}><Copy className="h-5 w-5" /></Button>
                        </div>
                      </div>

                      {/* Join Link */}
                      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Link className="h-4 w-4 text-primary" /> Student Join Link
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
                          <QrCode className="h-4 w-4 text-primary" /> QR Code — Scan to Join
                        </div>
                        <div ref={qrRef} className="bg-white p-4 rounded-xl">
                          <QRCodeCanvas value={joinUrl} size={180} level="H" />
                        </div>
                        <Button variant="outline" size="sm" onClick={downloadQR}>
                          <Download className="h-3 w-3 mr-1" /> Download QR Code
                        </Button>
                      </div>

                      <Button variant="destructive" className="w-full" onClick={() => setEndConfirmOpen(true)}>
                        <Square className="h-4 w-4 mr-2" /> End Session Early
                      </Button>
                    </>
                  ) : (
                    /* ─── Session Setup Form ─── */
                    <div className="space-y-5">
                      {/* Grade Band Selector */}
                      <div>
                        <label className="text-sm font-medium text-foreground flex items-center gap-1.5 mb-2">
                          <GraduationCap className="h-4 w-4 text-primary" /> Grade Band <span className="text-destructive">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {(["K-2", "3-5"] as const).map((band) => (
                            <Button
                              key={band}
                              variant={gradeBand === band ? "default" : "outline"}
                              className={`text-base py-3 ${gradeBand === band ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                              onClick={() => setGradeBand(band)}
                            >
                              {band}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Theme Selector */}
                      <div>
                        <label className="text-sm font-medium text-foreground flex items-center gap-1.5 mb-2">
                          <Palette className="h-4 w-4 text-accent" /> Session Theme <span className="text-destructive">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {ALL_THEMES.map((theme) => (
                            <Button
                              key={theme.label}
                              variant={selectedTheme === theme.label ? "default" : "outline"}
                              size="sm"
                              className={`justify-start gap-2 text-left h-auto py-2.5 px-3 ${selectedTheme === theme.label ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                              onClick={() => setSelectedTheme(theme.label)}
                            >
                              <span className="text-lg">{theme.emoji}</span>
                              <span className="text-xs leading-tight">{theme.label}</span>
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Generate button */}
                      <Button
                        variant="hero"
                        className="w-full"
                        size="lg"
                        onClick={createSession}
                        disabled={!selectedTheme || generating}
                      >
                        {generating ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating Session…</>
                        ) : (
                          <><Play className="h-4 w-4 mr-2" /> Generate Session Code</>
                        )}
                      </Button>
                      {!selectedTheme && (
                        <p className="text-xs text-muted-foreground text-center">Select a grade band and theme to continue</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ─── Right Panel: Students Connected ─── */}
              <Card className="card-shadow border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-accent" />
                    Students Connected
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Large count */}
                  <div className="text-center">
                    <span className="text-6xl font-bold text-accent">{studentCount}</span>
                    <p className="text-sm text-muted-foreground mt-1">{sessionStatus}</p>
                  </div>

                  {/* Student list */}
                  {sessionActive && (
                    <>
                      <ScrollArea className="h-48 border border-border rounded-lg">
                        <div className="p-3 space-y-1.5">
                          {connectedStudents.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">Waiting for students to join…</p>
                          ) : (
                            connectedStudents.map((s) => (
                              <div key={s.id} className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md">
                                <span className="h-2 w-2 rounded-full bg-success shrink-0" />
                                <span className="text-sm font-medium text-foreground truncate">{s.student_name}</span>
                                <span className="text-xs text-muted-foreground ml-auto">
                                  {new Date(s.joined_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>

                      {/* Start Session button */}
                      {!sessionStarted && (
                        <Button
                          variant="hero"
                          className="w-full"
                          size="lg"
                          disabled={studentCount === 0}
                          onClick={handleStartLive}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Start Session {studentCount > 0 && `(${studentCount} student${studentCount > 1 ? "s" : ""})`}
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top Students Leaderboard */}
            {topStudents.length > 0 && (
              <Card className="card-shadow border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-warning" /> Top Students
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

            {user && <SessionSummaryPanel teacherId={user.id} />}
            {user && <ContentHistoryPanel teacherId={user.id} />}
            {user && <EmailSettings userId={user.id} />}

            {/* Session History */}
            <Card className="card-shadow border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-muted-foreground" /> Session History
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm text-primary">{session.code}</span>
                          <span className="text-muted-foreground text-sm">
                            {new Date(session.created_at).toLocaleDateString()}
                          </span>
                          {(session as any).grade_band && (
                            <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">{(session as any).grade_band}</span>
                          )}
                          {(session as any).theme && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              {ALL_THEMES.find(t => t.label === (session as any).theme)?.emoji} {(session as any).theme}
                            </span>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${session.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                          {session.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>

      {/* End Session Confirmation Dialog */}
      <Dialog open={endConfirmOpen} onOpenChange={setEndConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> End Session Early?
            </DialogTitle>
            <DialogDescription>
              This will end the session for all {studentCount} connected student{studentCount !== 1 ? "s" : ""}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={endSession}>End Session</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grade Band Change Confirmation Dialog */}
      <Dialog open={gradeBandChangeOpen} onOpenChange={setGradeBandChangeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" /> Change Grade Band?
            </DialogTitle>
            <DialogDescription>
              Changing grade band will affect all {studentCount} current student{studentCount !== 1 ? "s" : ""}. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={confirmGradeBandChange}>Change to {pendingGradeBand}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeacherDashboard;
