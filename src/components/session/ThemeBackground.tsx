import { ReactNode, useMemo, useEffect } from "react";

// ─── Theme visual config ───
interface ThemeVisual {
  gradient: string;         // full-page background gradient
  cardBg: string;           // card glass background
  cardBorder: string;       // card glow border (box-shadow)
  cardBorderColor: string;  // border-color for subtle edge
  pattern: string;          // SVG pattern as data URI
  particleType: "stars" | "leaves" | "halftone" | "lines" | "circuits" | "doodles" | "grid" | "sparkles" | null;
  textClass: string;        // text color for content on dark bg
  topicBannerBg: string;    // topic banner bg
  topicBannerText: string;  // topic banner text color
  glowColor: string;        // animal companion glow ring
  emojis: string[];
  phrases: string[];
}

const THEME_VISUALS: Record<string, ThemeVisual> = {
  "nature": {
    gradient: "linear-gradient(135deg, #0d3b1e, #0a4a3a)",
    cardBg: "rgba(255,255,255,0.07)",
    cardBorder: "0 0 24px rgba(34,197,94,0.25)",
    cardBorderColor: "rgba(34,197,94,0.2)",
    pattern: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 10 Q35 5 40 10 Q45 20 30 30 Q15 20 20 10 Q25 5 30 10Z' fill='%2322c55e' fill-opacity='0.08'/%3E%3Ccircle cx='50' cy='50' r='4' fill='%2322c55e' fill-opacity='0.05'/%3E%3C/svg%3E")`,
    particleType: "leaves",
    textClass: "text-white",
    topicBannerBg: "rgba(34,197,94,0.15)",
    topicBannerText: "#86efac",
    glowColor: "rgba(34,197,94,0.4)",
    emojis: ["🦁", "🌿", "🐾", "🌻", "🦋"],
    phrases: ["Nature explorer! 🌿", "Wild and wonderful! 🦁", "Growing strong! 🌱"],
  },
  "superheroes": {
    gradient: "linear-gradient(135deg, #0a0a2e, #2a0a0a)",
    cardBg: "rgba(255,255,255,0.07)",
    cardBorder: "0 0 24px rgba(99,102,241,0.25), 0 0 48px rgba(239,68,68,0.15)",
    cardBorderColor: "rgba(99,102,241,0.25)",
    pattern: `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='20' cy='20' r='3' fill='%236366f1' fill-opacity='0.06'/%3E%3Ccircle cx='0' cy='0' r='3' fill='%23ef4444' fill-opacity='0.04'/%3E%3Ccircle cx='40' cy='40' r='3' fill='%236366f1' fill-opacity='0.04'/%3E%3Ccircle cx='0' cy='40' r='2' fill='%23ef4444' fill-opacity='0.03'/%3E%3Ccircle cx='40' cy='0' r='2' fill='%236366f1' fill-opacity='0.03'/%3E%3C/svg%3E")`,
    particleType: "halftone",
    textClass: "text-white",
    topicBannerBg: "rgba(99,102,241,0.15)",
    topicBannerText: "#a5b4fc",
    glowColor: "rgba(99,102,241,0.4)",
    emojis: ["⚡", "💥", "🦸", "✨", "🛡️"],
    phrases: ["Superhero power! ⚡", "You're unstoppable! 💥", "Hero mode activated! 🦸"],
  },
  "fantasy": {
    gradient: "linear-gradient(135deg, #1a0533, #0d1b4b)",
    cardBg: "rgba(255,255,255,0.07)",
    cardBorder: "0 0 24px rgba(180,100,255,0.3)",
    cardBorderColor: "rgba(180,100,255,0.2)",
    pattern: `url("data:image/svg+xml,%3Csvg width='50' height='50' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolygon points='25,5 27,18 40,18 30,26 33,40 25,31 17,40 20,26 10,18 23,18' fill='%238b5cf6' fill-opacity='0.06'/%3E%3C/svg%3E")`,
    particleType: "stars",
    textClass: "text-white",
    topicBannerBg: "rgba(139,92,246,0.15)",
    topicBannerText: "#c4b5fd",
    glowColor: "rgba(180,100,255,0.4)",
    emojis: ["🧙", "✨", "🐉", "🏰", "⭐"],
    phrases: ["Magical progress! 🧙", "Spellbinding work! ✨", "Legendary effort! 🐉"],
  },
  "sports": {
    gradient: "linear-gradient(135deg, #3d1c00, #4a3000)",
    cardBg: "rgba(255,255,255,0.07)",
    cardBorder: "0 0 24px rgba(249,115,22,0.3)",
    cardBorderColor: "rgba(249,115,22,0.2)",
    pattern: `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cline x1='0' y1='0' x2='40' y2='40' stroke='%23f97316' stroke-width='1' stroke-opacity='0.08'/%3E%3Cline x1='40' y1='0' x2='0' y2='40' stroke='%23eab308' stroke-width='1' stroke-opacity='0.06'/%3E%3C/svg%3E")`,
    particleType: "lines",
    textClass: "text-white",
    topicBannerBg: "rgba(249,115,22,0.15)",
    topicBannerText: "#fdba74",
    glowColor: "rgba(249,115,22,0.4)",
    emojis: ["⚽", "🏆", "🎯", "💪", "🏅"],
    phrases: ["MVP move! 🏆", "Score! Keep going! ⚽", "Champion effort! 💪"],
  },
  "science": {
    gradient: "linear-gradient(135deg, #042f2e, #0c1a3d)",
    cardBg: "rgba(255,255,255,0.07)",
    cardBorder: "0 0 24px rgba(6,182,212,0.3)",
    cardBorderColor: "rgba(6,182,212,0.2)",
    pattern: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='30' cy='30' r='12' fill='none' stroke='%2306b6d4' stroke-width='0.8' stroke-opacity='0.08'/%3E%3Ccircle cx='30' cy='30' r='3' fill='%2306b6d4' fill-opacity='0.06'/%3E%3Cline x1='10' y1='10' x2='20' y2='10' stroke='%2306b6d4' stroke-opacity='0.05' stroke-width='0.5'/%3E%3Cline x1='10' y1='10' x2='10' y2='20' stroke='%2306b6d4' stroke-opacity='0.05' stroke-width='0.5'/%3E%3Cline x1='40' y1='50' x2='50' y2='50' stroke='%2306b6d4' stroke-opacity='0.04' stroke-width='0.5'/%3E%3C/svg%3E")`,
    particleType: "circuits",
    textClass: "text-white",
    topicBannerBg: "rgba(6,182,212,0.15)",
    topicBannerText: "#67e8f9",
    glowColor: "rgba(6,182,212,0.4)",
    emojis: ["🔬", "🧪", "⚡", "🌟", "🧬"],
    phrases: ["Scientific genius! 🔬", "Experiment success! 🧪", "Discovery made! 🌟"],
  },
  "school": {
    gradient: "linear-gradient(135deg, #1a1a3e, #2d1b69)",
    cardBg: "rgba(255,255,255,0.07)",
    cardBorder: "0 0 24px rgba(253,224,71,0.2)",
    cardBorderColor: "rgba(253,224,71,0.15)",
    pattern: `url("data:image/svg+xml,%3Csvg width='50' height='50' xmlns='http://www.w3.org/2000/svg'%3E%3Cline x1='0' y1='12' x2='50' y2='12' stroke='%23fde047' stroke-width='0.3' stroke-opacity='0.08'/%3E%3Cline x1='0' y1='24' x2='50' y2='24' stroke='%23fde047' stroke-width='0.3' stroke-opacity='0.06'/%3E%3Cline x1='0' y1='36' x2='50' y2='36' stroke='%23fde047' stroke-width='0.3' stroke-opacity='0.05'/%3E%3Cpolygon points='40,3 41,6 44,6 42,8 43,11 40,9 37,11 38,8 36,6 39,6' fill='%23fde047' fill-opacity='0.06'/%3E%3C/svg%3E")`,
    particleType: "doodles",
    textClass: "text-white",
    topicBannerBg: "rgba(253,224,71,0.15)",
    topicBannerText: "#fde047",
    glowColor: "rgba(253,224,71,0.35)",
    emojis: ["📚", "✏️", "⭐", "🎒", "📝"],
    phrases: ["A+ student! ⭐", "Learning star! 📚", "Top of the class! ✏️"],
  },
  "social": {
    gradient: "linear-gradient(135deg, #1c1917, #172554)",
    cardBg: "rgba(255,255,255,0.07)",
    cardBorder: "0 0 24px rgba(147,130,115,0.2)",
    cardBorderColor: "rgba(147,130,115,0.15)",
    pattern: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cline x1='0' y1='30' x2='60' y2='30' stroke='%2378716c' stroke-width='0.5' stroke-opacity='0.08'/%3E%3Cline x1='30' y1='0' x2='30' y2='60' stroke='%2378716c' stroke-width='0.5' stroke-opacity='0.08'/%3E%3Cline x1='0' y1='0' x2='60' y2='0' stroke='%2378716c' stroke-width='0.3' stroke-opacity='0.05'/%3E%3Cline x1='0' y1='60' x2='60' y2='60' stroke='%2378716c' stroke-width='0.3' stroke-opacity='0.05'/%3E%3C/svg%3E")`,
    particleType: "grid",
    textClass: "text-white",
    topicBannerBg: "rgba(147,130,115,0.15)",
    topicBannerText: "#d6d3d1",
    glowColor: "rgba(147,130,115,0.35)",
    emojis: ["🌍", "🗺️", "🏛️", "⭐", "🌟"],
    phrases: ["World explorer! 🌍", "History maker! 🏛️", "Global thinker! 🗺️"],
  },
  "character": {
    gradient: "linear-gradient(135deg, #3b0a2a, #2a1a00)",
    cardBg: "rgba(255,255,255,0.07)",
    cardBorder: "0 0 24px rgba(236,72,153,0.25)",
    cardBorderColor: "rgba(236,72,153,0.2)",
    pattern: `url("data:image/svg+xml,%3Csvg width='50' height='50' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M25 15 Q25 10 20 15 Q15 20 25 28 Q35 20 30 15 Q25 10 25 15Z' fill='%23ec4899' fill-opacity='0.06'/%3E%3Cpolygon points='10,40 12,36 14,40 12,38' fill='%23eab308' fill-opacity='0.05'/%3E%3C/svg%3E")`,
    particleType: "sparkles",
    textClass: "text-white",
    topicBannerBg: "rgba(236,72,153,0.15)",
    topicBannerText: "#f9a8d4",
    glowColor: "rgba(236,72,153,0.4)",
    emojis: ["💖", "✨", "🌟", "💪", "😊"],
    phrases: ["Heart of gold! 💖", "Shining bright! ✨", "Inner strength! 💪"],
  },
};

// Match sessionTheme to the closest theme key
function matchTheme(sessionTheme: string): ThemeVisual {
  const lower = sessionTheme.toLowerCase();
  if (lower.includes("nature") || lower.includes("animal")) return THEME_VISUALS["nature"];
  if (lower.includes("superhero") || lower.includes("hero")) return THEME_VISUALS["superheroes"];
  if (lower.includes("fantasy") || lower.includes("myth") || lower.includes("magic") || lower.includes("dragon")) return THEME_VISUALS["fantasy"];
  if (lower.includes("sport") || lower.includes("game")) return THEME_VISUALS["sports"];
  if (lower.includes("science") || lower.includes("stem")) return THEME_VISUALS["science"];
  if (lower.includes("school") || lower.includes("classroom")) return THEME_VISUALS["school"];
  if (lower.includes("social") || lower.includes("studies") || lower.includes("history") || lower.includes("geography")) return THEME_VISUALS["social"];
  if (lower.includes("character") || lower.includes("develop") || lower.includes("kindness") || lower.includes("emotion")) return THEME_VISUALS["character"];
  return THEME_VISUALS["school"];
}

// ─── Floating Particles ───
function FloatingParticles({ type }: { type: ThemeVisual["particleType"] }) {
  if (!type) return null;

  // Stars for fantasy
  if (type === "stars") {
    const stars = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 1 + Math.random() * 2.5,
      delay: Math.random() * 6,
      duration: 3 + Math.random() * 4,
    }));
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {stars.map((s) => (
          <div
            key={s.id}
            className="absolute rounded-full bg-white animate-theme-twinkle"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
            }}
          />
        ))}
      </div>
    );
  }

  // Leaves for nature
  if (type === "leaves") {
    const leaves = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      emoji: ["🍃", "🌿", "🍂"][i % 3],
      left: 5 + Math.random() * 90,
      delay: Math.random() * 8,
      duration: 10 + Math.random() * 8,
      size: 12 + Math.random() * 8,
    }));
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {leaves.map((l) => (
          <span
            key={l.id}
            className="absolute animate-theme-leaf-fall opacity-30"
            style={{
              left: `${l.left}%`,
              top: "-30px",
              fontSize: `${l.size}px`,
              animationDelay: `${l.delay}s`,
              animationDuration: `${l.duration}s`,
            }}
          >
            {l.emoji}
          </span>
        ))}
      </div>
    );
  }

  // Other particle types just use the SVG pattern overlay, no extra elements needed
  return null;
}

// ─── Full Page Theme Wrapper ───
export function ThemePageWrapper({ theme, children }: { theme: string; children: ReactNode }) {
  const visual = useMemo(() => matchTheme(theme), [theme]);

  // Apply theme to body background
  useEffect(() => {
    if (theme) {
      document.body.style.background = visual.gradient;
      document.body.style.transition = "background 0.6s ease";
    }
    return () => {
      document.body.style.background = "";
    };
  }, [theme, visual.gradient]);

  return (
    <div className="relative min-h-screen transition-all duration-[600ms]">
      {/* Pattern overlay on full page */}
      <div
        className="fixed inset-0 pointer-events-none transition-opacity duration-[600ms]"
        style={{
          backgroundImage: visual.pattern,
          backgroundRepeat: "repeat",
          opacity: 1,
          zIndex: 0,
        }}
      />
      {/* Floating particles */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <FloatingParticles type={visual.particleType} />
      </div>
      {/* Content */}
      <div className="relative" style={{ zIndex: 1 }}>{children}</div>
    </div>
  );
}

// ─── Glass Card Wrapper ───
export function ThemedCard({ theme, children, className = "" }: { theme: string; children: ReactNode; className?: string }) {
  const visual = useMemo(() => matchTheme(theme), [theme]);
  return (
    <div
      className={`rounded-xl backdrop-blur-md transition-all duration-[600ms] ${className}`}
      style={{
        background: visual.cardBg,
        boxShadow: visual.cardBorder,
        border: `1px solid ${visual.cardBorderColor}`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Themed Animal Companion Glow ───
export function ThemedCompanionGlow({ theme, children }: { theme: string; children: ReactNode }) {
  const visual = useMemo(() => matchTheme(theme), [theme]);
  return (
    <div
      className="rounded-full p-0.5 transition-all duration-[600ms]"
      style={{
        boxShadow: `0 0 12px ${visual.glowColor}, 0 0 24px ${visual.glowColor}`,
        border: `2px solid ${visual.glowColor}`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Legacy ThemeBackground (still used by celebration etc) ───
export function ThemeBackground({ theme, children }: { theme: string; children: ReactNode }) {
  return <>{children}</>;
}

// ─── Confetti Celebration ───
export function ConfettiCelebration({ show, theme }: { show: boolean; theme: string }) {
  const visual = useMemo(() => matchTheme(theme), [theme]);
  const emojis = visual.emojis;

  if (!show) return null;

  const particles = Array.from({ length: 12 }, (_, i) => ({
    emoji: emojis[i % emojis.length],
    id: i,
    left: 5 + Math.random() * 90,
    delay: Math.random() * 0.4,
    size: 16 + Math.random() * 12,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-[100]">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute animate-confetti-fall"
          style={{
            left: `${p.left}%`,
            top: "-30px",
            fontSize: `${p.size}px`,
            animationDelay: `${p.delay}s`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}

// ─── Motivational Banner ───
export function MotivationalBanner({
  show,
  theme,
  onDone,
}: {
  show: boolean;
  theme: string;
  onDone: () => void;
}) {
  const visual = useMemo(() => matchTheme(theme), [theme]);
  const phrase = useMemo(
    () => visual.phrases[Math.floor(Math.random() * visual.phrases.length)],
    [show, theme]
  );

  if (!show) return null;

  setTimeout(onDone, 1500);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[90] pointer-events-none">
      <div className="animate-motivational-bounce bg-card/95 backdrop-blur-sm border border-border rounded-2xl px-8 py-5 shadow-xl text-center max-w-sm">
        <p className="text-2xl font-bold text-foreground">{phrase}</p>
      </div>
    </div>
  );
}

// Helper to get theme-aware styles for inline use
export function getThemeStyles(theme: string) {
  return matchTheme(theme);
}

export { matchTheme, THEME_VISUALS };
export type { ThemeVisual };
