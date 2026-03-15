import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSounds } from "@/hooks/use-sounds";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ALL_THEMES = [
  { label: "Nature & animals", emoji: "🌿", description: "Explore forests, oceans, and wildlife!", color: "from-emerald-400 to-green-500", border: "border-emerald-300", bg: "bg-emerald-50" },
  { label: "Superheroes", emoji: "⚡", description: "Powers, capes, and saving the day!", color: "from-blue-500 to-red-500", border: "border-blue-300", bg: "bg-blue-50" },
  { label: "Fantasy & myths", emoji: "🧙", description: "Dragons, magic, and adventure!", color: "from-purple-400 to-violet-500", border: "border-purple-300", bg: "bg-purple-50" },
  { label: "Sports & games", emoji: "⚽", description: "Goals, teams, and competition!", color: "from-orange-400 to-amber-500", border: "border-orange-300", bg: "bg-orange-50" },
  { label: "Science", emoji: "🔬", description: "Experiments, space, and discovery!", color: "from-cyan-400 to-teal-500", border: "border-cyan-300", bg: "bg-cyan-50" },
  { label: "School & classroom life", emoji: "📚", description: "Friends, learning, and school fun!", color: "from-yellow-400 to-amber-400", border: "border-yellow-300", bg: "bg-yellow-50" },
  { label: "Social studies", emoji: "🗺️", description: "Maps, cultures, and history!", color: "from-rose-400 to-pink-500", border: "border-rose-300", bg: "bg-rose-50" },
  { label: "Character development", emoji: "💖", description: "Feelings, kindness, and growing up!", color: "from-pink-400 to-fuchsia-500", border: "border-pink-300", bg: "bg-pink-50" },
] as const;

const StudentThemePicker = () => {
  const navigate = useNavigate();
  const { sessionId, studentId } = useParams();
  const { playWelcome } = useSounds();
  const welcomePlayedRef = useRef(false);
  const [gradeBand, setGradeBand] = useState<"K-2" | "3-5">("3-5");
  const [themeOptions, setThemeOptions] = useState<string[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [tappedTheme, setTappedTheme] = useState<string | null>(null);

  useEffect(() => {
    if (!welcomePlayedRef.current) {
      welcomePlayedRef.current = true;
      // Small delay so AudioContext can initialize after user interaction
      const t = setTimeout(() => playWelcome(), 300);
      return () => clearTimeout(t);
    }
  }, [playWelcome]);

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
    if (saving) return;
    setSelectedTheme(theme);

    if (gradeBand === "K-2") {
      // Tap animation then go
      setTappedTheme(theme);
      setSaving(true);
      await new Promise(r => setTimeout(r, 500)); // let animation play
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
      <div className="min-h-screen bg-gradient-to-b from-sky-100 via-purple-50 to-pink-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-6xl animate-bounce">🐣</div>
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        </div>
      </div>
    );
  }

  const availableThemes = gradeBand === "K-2"
    ? ALL_THEMES.filter(t => themeOptions.includes(t.label)).slice(0, 3)
    : ALL_THEMES;

  // K-2: Visual-first, reading-not-required
  if (gradeBand === "K-2") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-200 via-yellow-100 to-pink-200 flex flex-col items-center p-4 pt-8 overflow-y-auto">
        {/* Floating decorative emojis */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          {["⭐", "🌈", "✨", "🎈", "💫", "🌟"].map((emoji, i) => (
            <span
              key={i}
              className="absolute text-3xl opacity-30"
              style={{
                left: `${10 + (i * 15) % 80}%`,
                top: `${5 + (i * 18) % 75}%`,
                animation: `float-gentle ${3 + i * 0.5}s ease-in-out infinite alternate`,
                animationDelay: `${i * 0.4}s`,
              }}
            >
              {emoji}
            </span>
          ))}
        </div>

        <div className="relative z-10 w-full max-w-md">
          {/* Greeting */}
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-4xl font-extrabold text-gray-800 mb-2">
              Hi {studentName || "friend"}! 👋
            </h1>
            <p className="text-2xl font-bold text-gray-600">
              Pick what you LOVE! 👇
            </p>
          </div>

          {/* Theme cards — 1-column stack */}
          <div className="flex flex-col gap-5">
            {availableThemes.map((theme, index) => {
              const isTapped = tappedTheme === theme.label;
              return (
                <button
                  key={theme.label}
                  onClick={() => selectTheme(theme.label)}
                  disabled={saving}
                  className={`
                    relative w-full rounded-3xl border-4 shadow-xl
                    transition-all duration-300 overflow-hidden
                    ${theme.border}
                    ${isTapped
                      ? "scale-110 shadow-2xl ring-4 ring-yellow-400 ring-offset-2"
                      : "hover:scale-[1.03] active:scale-95"
                    }
                  `}
                  style={{
                    animation: `k2-card-bounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${index * 0.12}s both`,
                  }}
                >
                  {/* Gradient background */}
                  <div className={`bg-gradient-to-br ${theme.color} p-6 flex flex-col items-center gap-2`}>
                    {/* Big emoji */}
                    <span
                      className={`block transition-transform duration-300 ${isTapped ? "scale-125" : ""}`}
                      style={{ fontSize: "90px", lineHeight: 1 }}
                    >
                      {theme.emoji}
                    </span>
                    {/* Theme name */}
                    <span className="text-2xl font-extrabold text-white drop-shadow-md leading-tight">
                      {theme.label}
                    </span>
                  </div>

                  {/* Tap burst effect */}
                  {isTapped && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      {["🎉", "✨", "⭐", "💥"].map((e, i) => (
                        <span
                          key={i}
                          className="absolute text-4xl"
                          style={{
                            animation: `emoji-burst 0.6s ease-out ${i * 0.08}s forwards`,
                            transform: `rotate(${i * 90}deg)`,
                          }}
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Loading indicator */}
                  {saving && isTapped && (
                    <div className="absolute bottom-3 right-3">
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Inline CSS for K-2 specific animations */}
        <style>{`
          @keyframes k2-card-bounce {
            0% { opacity: 0; transform: scale(0.6) translateY(40px); }
            60% { opacity: 1; transform: scale(1.05) translateY(-5px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes emoji-burst {
            0% { opacity: 1; transform: translate(0, 0) scale(1); }
            100% { opacity: 0; transform: translate(var(--burst-x, 60px), var(--burst-y, -60px)) scale(1.5); }
          }
          @keyframes float-gentle {
            0% { transform: translateY(0px) rotate(0deg); }
            100% { transform: translateY(-15px) rotate(5deg); }
          }
          button:nth-child(1) .absolute span:nth-child(1) { --burst-x: -50px; --burst-y: -50px; }
          button:nth-child(1) .absolute span:nth-child(2) { --burst-x: 50px; --burst-y: -50px; }
          button:nth-child(1) .absolute span:nth-child(3) { --burst-x: -50px; --burst-y: 50px; }
          button:nth-child(1) .absolute span:nth-child(4) { --burst-x: 50px; --burst-y: 50px; }
        `}</style>
      </div>
    );
  }

  // ─── 3-5: Full 2x4 grid with "Let's go!" button (unchanged) ───
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          {studentName ? `Hi ${studentName}!` : "Pick your theme!"}
        </h1>
        <p className="text-muted-foreground mt-1">Choose a theme for today's lesson</p>
      </div>

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
            className="w-full mt-6 h-14 text-lg animate-fade-in"
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
    </div>
  );
};

export default StudentThemePicker;
