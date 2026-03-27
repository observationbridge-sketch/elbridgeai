import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ensureTeacherAccount } from "@/lib/teacher-account";
import {
  ArrowRight,
  ArrowDown,
  Clock,
  KeyRound,
  BookOpen,
  BarChart3,
  Play,
  X,
  Check,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Slot counter bar color                                             */
/* ------------------------------------------------------------------ */
const barColor = (remaining: number) => {
  if (remaining <= 5) return "bg-destructive";
  if (remaining <= 10) return "bg-warning";
  return "bg-accent";
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
const Index = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  // Slots
  const [slotsUsed, setSlotsUsed] = useState<number | null>(null);
  const [slotsTotal, setSlotsTotal] = useState(25);
  const slotsRemaining = slotsUsed !== null ? slotsTotal - slotsUsed : null;
  const isBetaFull = slotsUsed !== null && slotsUsed >= slotsTotal;

  // Waitlist modal
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [wlName, setWlName] = useState("");
  const [wlEmail, setWlEmail] = useState("");
  const [wlStatus, setWlStatus] = useState<"idle" | "loading" | "success" | "already">("idle");

  /* ---- auth redirect ---- */
  const redirectAuthenticatedTeacher = useCallback(
    async (user: User) => {
      await ensureTeacherAccount(user);
      navigate("/teacher/dashboard", { replace: true });
    },
    [navigate]
  );

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session?.user) {
        try {
          await redirectAuthenticatedTeacher(session.user);
        } catch {
          navigate("/teacher/auth", { replace: true });
        }
        return;
      }
      setReady(true);
    };
    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || event !== "SIGNED_IN" || !session?.user) return;
      void redirectAuthenticatedTeacher(session.user).catch(() => {
        navigate("/teacher/auth", { replace: true });
      });
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate, redirectAuthenticatedTeacher]);

  /* ---- fetch slots ---- */
  useEffect(() => {
    const fetchSlots = async () => {
      try {
        const { data } = await supabase
          .from("beta_slots")
          .select("slots_total, slots_used")
          .single();
        if (data) {
          setSlotsTotal(data.slots_total);
          setSlotsUsed(data.slots_used);
        }
      } catch {
        /* silent */
      }
    };
    fetchSlots();
  }, []);

  /* ---- waitlist submit ---- */
  const handleWaitlistSubmit = async () => {
    if (!wlEmail.trim()) return;
    setWlStatus("loading");
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/join-waitlist`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: wlEmail.trim(), name: wlName.trim() || null }),
        }
      );
      const json = await res.json();
      setWlStatus(json.status === "already_on_list" ? "already" : "success");
    } catch {
      setWlStatus("idle");
    }
  };

  /* ---- primary CTA handler ---- */
  const handlePrimaryCTA = () => {
    if (isBetaFull) {
      setShowWaitlist(true);
    } else {
      navigate("/teacher/auth");
    }
  };

  if (!ready) return <div className="min-h-screen bg-background" />;

  const pct = slotsUsed !== null ? Math.round((slotsUsed / slotsTotal) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="ElbridgeAI Logo" className="h-10 w-auto" />
            <span className="text-xl font-bold text-foreground">ElbridgeAI</span>
          </div>
          <Button variant="ghost" onClick={() => navigate("/teacher/auth")}>
            Teacher Login
          </Button>
        </div>
      </header>

      {/* ── SECTION 1 — Beta Banner ── */}
      <div className="w-full bg-accent/10 border-b border-accent/20">
        <div className="container mx-auto px-4 py-2.5 text-center">
          <p className="text-sm text-accent font-medium tracking-wide">
            🧪 Public Beta — Free for Teachers Through June 2026
          </p>
        </div>
      </div>

      {/* ── SECTION 2 — Hero ── */}
      <section className="relative">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <h1 className="text-3xl sm:text-4xl md:text-[2.75rem] leading-snug md:leading-tight font-bold text-foreground">
              Students complete a 5–20 minute language session
              <br className="hidden sm:block" />
              <span className="text-muted-foreground">
                {" "}— reading, writing, speaking, and listening —{" "}
              </span>
              <br className="hidden sm:block" />
              without you running it.
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
              AI-powered ELD practice for K–5.
              <br />
              Teachers set it up in 60 seconds. Students do the rest.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
              {!isBetaFull && (
                <Button variant="hero" size="xl" onClick={handlePrimaryCTA}>
                  Get Free Beta Access
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              {isBetaFull && (
                <Button
                  variant="heroOutline"
                  size="xl"
                  onClick={() => setShowWaitlist(true)}
                >
                  Beta is Full — Join the Waitlist
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
              <Button
                variant="heroOutline"
                size="xl"
                onClick={() =>
                  document
                    .getElementById("how-it-works")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                See How It Works
                <ArrowDown className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 3 — Live Slot Counter ── */}
      {slotsUsed !== null && (
        <section className="container mx-auto px-4 pb-16">
          <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
            <p className="text-foreground font-semibold text-base flex items-center gap-2">
              🎯 Beta spots remaining
            </p>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${barColor(slotsRemaining ?? 0)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground text-right">
                <span className="font-semibold text-foreground">{slotsUsed}</span> of{" "}
                {slotsTotal} taken
              </p>
            </div>

            <p className="text-sm text-muted-foreground">
              {isBetaFull ? (
                "All spots are claimed — join the waitlist above."
              ) : (
                <>
                  <span className="font-semibold text-foreground">{slotsRemaining}</span>{" "}
                  spots left for April–June 2026
                </>
              )}
            </p>
          </div>
        </section>
      )}

      {/* ── SECTION 4 — How a Session Works ── */}
      <section id="how-it-works" className="bg-muted/40 border-y border-border">
        <div className="container mx-auto px-4 py-16 md:py-20">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-12">
            How a Session Works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {[
              {
                icon: Clock,
                step: "①",
                title: "Teacher creates a session code",
                sub: "30 seconds",
              },
              {
                icon: KeyRound,
                step: "②",
                title: "Students enter the code",
                sub: "No accounts needed",
              },
              {
                icon: BookOpen,
                step: "③",
                title: "Students complete reading, writing, speaking & listening",
                sub: "5–20 minutes",
              },
              {
                icon: BarChart3,
                step: "④",
                title: "Teacher sees results in the dashboard",
                sub: "Instantly",
              },
            ].map((s) => (
              <div key={s.step} className="text-center space-y-3">
                <div className="mx-auto w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center">
                  <s.icon className="h-6 w-6 text-accent" />
                </div>
                <p className="text-xs font-bold text-accent tracking-widest">{s.step}</p>
                <p className="text-sm font-semibold text-foreground leading-snug">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 5 — Video Embed ── */}
      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="max-w-[720px] mx-auto">
          <div className="relative w-full rounded-2xl border border-border shadow-sm overflow-hidden" style={{ paddingBottom: "56.25%" }}>
            <iframe
              src="https://www.loom.com/embed/9b97a658242d44e5a77e39dd5aeb46c5"
              frameBorder="0"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          </div>
          <p className="text-center text-sm text-muted-foreground mt-4 italic">
            A real session — from teacher setup to student completion.
          </p>
        </div>
      </section>

      {/* ── SECTION 6 — What This Is (and isn't) ── */}
      <section className="bg-muted/40 border-y border-border">
        <div className="container mx-auto px-4 py-16 md:py-20">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-10">
            This is a beta. Here's what that means:
          </h2>

          <div className="max-w-2xl mx-auto">
            <div className="grid grid-cols-2 gap-px bg-border rounded-xl overflow-hidden shadow-sm">
              {/* Header row */}
              <div className="bg-accent/10 px-5 py-3">
                <p className="text-sm font-bold text-accent">What you get</p>
              </div>
              <div className="bg-accent/10 px-5 py-3">
                <p className="text-sm font-bold text-accent">What to expect</p>
              </div>
              {/* Rows */}
              {[
                ["Full access, free through June", "Occasional rough edges"],
                ["K–2 and 3–5 grade bands", "Active bug fixes in progress"],
                ["Up to 30 students per session", "Features still being refined"],
                [
                  "Teacher dashboard with session results",
                  "Your feedback shapes what gets built",
                ],
              ].map(([left, right], i) => (
                <div key={i} className="contents">
                  <div className="bg-card px-5 py-3.5">
                    <p className="text-sm text-foreground">{left}</p>
                  </div>
                  <div className="bg-card px-5 py-3.5">
                    <p className="text-sm text-muted-foreground">{right}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-center text-sm text-muted-foreground mt-8 max-w-lg mx-auto leading-relaxed italic">
              In exchange for free access, I'll check in with you after two weeks —
              one question about whether your students are actually using it.
              That's the whole ask.
            </p>
          </div>
        </div>
      </section>

      {/* ── SECTION 7 — CTA Repeat ── */}
      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
            Ready to try it with your class?
          </h2>
          <p className="text-muted-foreground">
            25 beta spots total. Free through June 2026. No card ever.
          </p>
          {!isBetaFull ? (
            <Button variant="hero" size="xl" onClick={() => navigate("/teacher/auth")}>
              Get Free Beta Access
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              variant="heroOutline"
              size="xl"
              onClick={() => setShowWaitlist(true)}
            >
              Beta is Full — Join the Waitlist
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </section>

      {/* ── SECTION 9 — Footer ── */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            ElbridgeAI · elbridgeai.com · Built for ELD teachers, by a teacher
          </p>
        </div>
      </footer>

      {/* ── SECTION 8 — Waitlist Modal ── */}
      {showWaitlist && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
          <div className="relative bg-card rounded-2xl border border-border shadow-xl w-full max-w-md p-8 space-y-5">
            {/* Close */}
            <button
              onClick={() => {
                setShowWaitlist(false);
                setWlStatus("idle");
              }}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {wlStatus === "success" || wlStatus === "already" ? (
              /* ── Success state ── */
              <div className="text-center space-y-4 py-4">
                <div className="mx-auto w-14 h-14 rounded-full bg-success/10 flex items-center justify-center">
                  <Check className="h-7 w-7 text-success" />
                </div>
                <p className="text-lg font-semibold text-foreground">
                  {wlStatus === "already" ? "You're already on the list." : "You're on the list. ✓"}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  I'll reach out before fall 2026 opens.
                  <br />
                  <span className="italic">— ElbridgeAI</span>
                </p>
              </div>
            ) : (
              /* ── Form state ── */
              <>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-foreground">
                    Beta is full — but you're not too late.
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Add yourself to the waitlist. When we open paid access in fall 2026,
                    waitlist teachers get notified first and receive early access pricing.
                  </p>
                </div>

                <div className="space-y-3">
                  <Input
                    placeholder="Your name"
                    value={wlName}
                    onChange={(e) => setWlName(e.target.value)}
                  />
                  <Input
                    placeholder="Your email"
                    type="email"
                    value={wlEmail}
                    onChange={(e) => setWlEmail(e.target.value)}
                  />
                </div>

                <Button
                  className="w-full"
                  variant="hero"
                  size="lg"
                  disabled={wlStatus === "loading" || !wlEmail.trim()}
                  onClick={handleWaitlistSubmit}
                >
                  {wlStatus === "loading" ? "Adding…" : "Add Me to the Waitlist"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  No spam. One email when fall access opens.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
