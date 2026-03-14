import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Brain, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ALL_THEMES = [
  { label: "Nature & animals", emoji: "🌿", description: "Explore forests, oceans, and wildlife!" },
  { label: "Superheroes", emoji: "⚡", description: "Powers, capes, and saving the day!" },
  { label: "Fantasy & myths", emoji: "🧙", description: "Dragons, magic, and adventure!" },
  { label: "Sports & games", emoji: "⚽", description: "Goals, teams, and competition!" },
  { label: "Science", emoji: "🔬", description: "Experiments, space, and discovery!" },
  { label: "School & classroom life", emoji: "📚", description: "Friends, learning, and school fun!" },
  { label: "Social studies", emoji: "🗺️", description: "Maps, cultures, and history!" },
  { label: "Character development", emoji: "💖", description: "Feelings, kindness, and growing up!" },
] as const;

const StudentThemePicker = () => {
  const navigate = useNavigate();
  const { sessionId, studentId } = useParams();
  const [gradeBand, setGradeBand] = useState<"K-2" | "3-5">("3-5");
  const [themeOptions, setThemeOptions] = useState<string[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studentName, setStudentName] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!sessionId || !studentId) return;

      const { data: studentData } = await supabase
        .from("session_students")
        .select("student_name")
        .eq("id", studentId)
        .single();
      if (studentData) setStudentName(studentData.student_name);

      const { data: session } = await supabase
        .from("sessions")
        .select("grade_band, theme_options")
        .eq("id", sessionId)
        .single();

      if (session) {
        const gb = (session as any).grade_band || "3-5";
        setGradeBand(gb);
        const opts = (session as any).theme_options as string[] | null;
        setThemeOptions(opts && opts.length > 0 ? opts : ALL_THEMES.map(t => t.label));
      }
      setLoading(false);
    };
    load();
  }, [sessionId, studentId]);

  const selectTheme = async (theme: string) => {
    setSelectedTheme(theme);

    if (gradeBand === "K-2") {
      // K-2: tap = go immediately
      setSaving(true);
      await supabase
        .from("session_students")
        .update({ theme } as any)
        .eq("id", studentId);
      navigate(`/student/session/${sessionId}/${studentId}`);
    }
  };

  const handleGo = async () => {
    if (!selectedTheme) return;
    setSaving(true);
    await supabase
      .from("session_students")
      .update({ theme: selectedTheme } as any)
      .eq("id", studentId);
    navigate(`/student/session/${sessionId}/${studentId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const availableThemes = gradeBand === "K-2"
    ? ALL_THEMES.filter(t => themeOptions.includes(t.label)).slice(0, 3)
    : ALL_THEMES;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="text-center mb-6">
        <Brain className="h-10 w-10 text-primary mx-auto mb-2" />
        <h1 className="text-2xl font-bold text-foreground">
          {studentName ? `Hi ${studentName}!` : "Pick your theme!"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {gradeBand === "K-2" ? "Tap your favorite!" : "Choose a theme for today's lesson"}
        </p>
      </div>

      {gradeBand === "K-2" ? (
        /* ─── K-2: 3 large buttons, tap = go ─── */
        <div className="flex flex-col gap-4 w-full max-w-sm">
          {availableThemes.map((theme) => (
            <button
              key={theme.label}
              onClick={() => selectTheme(theme.label)}
              disabled={saving}
              className={`
                relative flex items-center gap-4 p-6 rounded-2xl border-2 transition-all duration-200
                ${saving && selectedTheme === theme.label
                  ? "border-primary bg-primary/10 scale-95"
                  : "border-border bg-card hover:border-primary hover:shadow-lg hover:scale-[1.02] active:scale-95"
                }
              `}
            >
              <span className="text-5xl">{theme.emoji}</span>
              <span className="text-xl font-bold text-foreground">{theme.label}</span>
              {saving && selectedTheme === theme.label && (
                <Loader2 className="h-5 w-5 animate-spin text-primary ml-auto" />
              )}
            </button>
          ))}
        </div>
      ) : (
        /* ─── 3-5: Full 2x4 grid with "Let's go!" button ─── */
        <div className="w-full max-w-lg">
          <div className="grid grid-cols-2 gap-3">
            {availableThemes.map((theme) => (
              <button
                key={theme.label}
                onClick={() => selectTheme(theme.label)}
                className={`
                  flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 text-center
                  ${selectedTheme === theme.label
                    ? "border-primary bg-primary/10 ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg"
                    : "border-border bg-card hover:border-primary/50 hover:shadow-md"
                  }
                `}
              >
                <span className="text-4xl">{theme.emoji}</span>
                <span className="text-sm font-bold text-foreground leading-tight">{theme.label}</span>
                <span className="text-xs text-muted-foreground leading-tight">{theme.description}</span>
              </button>
            ))}
          </div>

          {selectedTheme && (
            <Button
              variant="hero"
              size="lg"
              className="w-full mt-6 h-14 text-lg animate-in fade-in slide-in-from-bottom-2"
              onClick={handleGo}
              disabled={saving}
            >
              {saving ? (
                <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading…</>
              ) : (
                <>Let's go! <ArrowRight className="h-5 w-5 ml-2" /></>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default StudentThemePicker;
