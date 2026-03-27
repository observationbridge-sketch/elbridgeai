import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ensureTeacherAccount } from "@/lib/teacher-account";
import { ArrowRight, ArrowDown } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [slotsRemaining, setSlotsRemaining] = useState<number | null>(null);
  const [slotsTotal, setSlotsTotal] = useState<number>(25);
  const [isBetaFull, setIsBetaFull] = useState(false);

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

  // Fetch beta slot availability
  useEffect(() => {
    const fetchSlots = async () => {
      try {
        const { data } = await supabase.from("beta_slots").select("slots_total, slots_used").single();
        if (data) {
          setSlotsTotal(data.slots_total);
          setSlotsRemaining(data.slots_total - data.slots_used);
          setIsBetaFull(data.slots_used >= data.slots_total);
        }
      } catch {
        // Silently fail — counter just won't show
      }
    };
    fetchSlots();
  }, []);

  if (!ready) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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

      {/* SECTION 1 — Beta Banner */}
      <div className="w-full bg-accent/10 border-b border-accent/20">
        <div className="container mx-auto px-4 py-2.5 text-center">
          <p className="text-sm text-accent font-medium tracking-wide">
            🧪 Public Beta — Free for Teachers Through June 2026
          </p>
        </div>
      </div>

      {/* SECTION 2 — Hero */}
      <section className="relative">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            {/* Headline */}
            <h1 className="text-3xl sm:text-4xl md:text-[2.75rem] leading-snug md:leading-tight font-bold text-foreground">
              Students complete a 5-minute language session
              <br className="hidden sm:block" />
              <span className="text-muted-foreground"> — reading, writing, speaking, and listening — </span>
              <br className="hidden sm:block" />
              without you running it.
            </h1>

            {/* Subheadline */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
              AI-powered ELD practice for K–5.
              <br />
              Teachers set it up in 60 seconds. Students do the rest.
            </p>

            {/* Slot Counter */}
            {slotsRemaining !== null && !isBetaFull && (
              <div className="flex items-center justify-center gap-2">
                <div className="flex items-center gap-2 bg-accent/5 border border-accent/20 rounded-full px-5 py-2">
                  <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  <span className="text-sm text-foreground font-medium">
                    {slotsRemaining} of {slotsTotal} beta spots remaining
                  </span>
                </div>
              </div>
            )}

            {isBetaFull && (
              <div className="flex items-center justify-center">
                <div className="bg-warning/10 border border-warning/30 rounded-full px-5 py-2">
                  <span className="text-sm text-warning font-medium">
                    Beta is full — join the waitlist below
                  </span>
                </div>
              </div>
            )}

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
              <Button
                variant="hero"
                size="xl"
                onClick={() => navigate("/teacher/auth")}
              >
                {isBetaFull ? "Join the Waitlist" : "Get Free Beta Access"}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <Button
                variant="heroOutline"
                size="xl"
                onClick={() => {
                  document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                See How It Works
                <ArrowDown className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Anchor for "See How It Works" scroll */}
      <div id="how-it-works" />

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm space-y-2">
          <p>© {new Date().getFullYear()} ElbridgeAI. Aligned to Academic Can-Do Benchmarks for Grades K–5.</p>
          <p className="text-xs">ELBridgeAI is an independent tool designed to support language acquisition.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
