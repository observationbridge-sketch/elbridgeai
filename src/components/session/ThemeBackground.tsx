import { ReactNode, useMemo } from "react";

// ─── Theme visual config ───
interface ThemeVisual {
  gradient: string;
  pattern: string; // SVG pattern as data URI
  emojis: string[];
  phrases: string[];
}

const THEME_VISUALS: Record<string, ThemeVisual> = {
  "nature": {
    gradient: "linear-gradient(135deg, hsl(145 40% 92%), hsl(120 30% 88%))",
    pattern: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 10 Q35 5 40 10 Q45 20 30 30 Q15 20 20 10 Q25 5 30 10Z' fill='%2322c55e' fill-opacity='0.06'/%3E%3Ccircle cx='50' cy='50' r='4' fill='%2322c55e' fill-opacity='0.04'/%3E%3C/svg%3E")`,
    emojis: ["🦁", "🌿", "🐾", "🌻", "🦋"],
    phrases: ["Nature explorer! 🌿", "Wild and wonderful! 🦁", "Growing strong! 🌱"],
  },
  "superheroes": {
    gradient: "linear-gradient(135deg, hsl(220 60% 92%), hsl(0 50% 92%))",
    pattern: `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='20' cy='20' r='3' fill='%233b82f6' fill-opacity='0.07'/%3E%3Ccircle cx='0' cy='0' r='3' fill='%23ef4444' fill-opacity='0.05'/%3E%3Ccircle cx='40' cy='40' r='3' fill='%233b82f6' fill-opacity='0.05'/%3E%3C/svg%3E")`,
    emojis: ["⚡", "💥", "🦸", "✨", "🛡️"],
    phrases: ["Superhero power! ⚡", "You're unstoppable! 💥", "Hero mode activated! 🦸"],
  },
  "fantasy": {
    gradient: "linear-gradient(135deg, hsl(270 40% 92%), hsl(240 30% 90%))",
    pattern: `url("data:image/svg+xml,%3Csvg width='50' height='50' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolygon points='25,5 27,18 40,18 30,26 33,40 25,31 17,40 20,26 10,18 23,18' fill='%238b5cf6' fill-opacity='0.06'/%3E%3C/svg%3E")`,
    emojis: ["🧙", "✨", "🐉", "🏰", "⭐"],
    phrases: ["Magical progress! 🧙", "Spellbinding work! ✨", "Legendary effort! 🐉"],
  },
  "sports": {
    gradient: "linear-gradient(135deg, hsl(30 70% 92%), hsl(45 80% 90%))",
    pattern: `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cline x1='0' y1='0' x2='40' y2='40' stroke='%23f97316' stroke-width='1' stroke-opacity='0.08'/%3E%3Cline x1='40' y1='0' x2='0' y2='40' stroke='%23eab308' stroke-width='1' stroke-opacity='0.06'/%3E%3C/svg%3E")`,
    emojis: ["⚽", "🏆", "🎯", "💪", "🏅"],
    phrases: ["MVP move! 🏆", "Score! Keep going! ⚽", "Champion effort! 💪"],
  },
  "science": {
    gradient: "linear-gradient(135deg, hsl(180 40% 92%), hsl(210 50% 90%))",
    pattern: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='30' cy='30' r='12' fill='none' stroke='%230d9488' stroke-width='0.8' stroke-opacity='0.08'/%3E%3Ccircle cx='30' cy='30' r='3' fill='%230d9488' fill-opacity='0.06'/%3E%3Ccircle cx='30' cy='18' r='2' fill='%230d9488' fill-opacity='0.06'/%3E%3C/svg%3E")`,
    emojis: ["🔬", "🧪", "⚡", "🌟", "🧬"],
    phrases: ["Scientific genius! 🔬", "Experiment success! 🧪", "Discovery made! 🌟"],
  },
  "school": {
    gradient: "linear-gradient(135deg, hsl(45 60% 93%), hsl(40 50% 90%))",
    pattern: `url("data:image/svg+xml,%3Csvg width='50' height='50' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolygon points='25,8 27,18 37,18 29,23 32,33 25,27 18,33 21,23 13,18 23,18' fill='%23eab308' fill-opacity='0.08'/%3E%3Cline x1='5' y1='45' x2='15' y2='35' stroke='%23a16207' stroke-width='1.5' stroke-opacity='0.06'/%3E%3C/svg%3E")`,
    emojis: ["📚", "✏️", "⭐", "🎒", "📝"],
    phrases: ["A+ student! ⭐", "Learning star! 📚", "Top of the class! ✏️"],
  },
  "social": {
    gradient: "linear-gradient(135deg, hsl(30 30% 92%), hsl(210 30% 90%))",
    pattern: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cline x1='0' y1='30' x2='60' y2='30' stroke='%2378716c' stroke-width='0.5' stroke-opacity='0.08'/%3E%3Cline x1='30' y1='0' x2='30' y2='60' stroke='%2378716c' stroke-width='0.5' stroke-opacity='0.08'/%3E%3C/svg%3E")`,
    emojis: ["🌍", "🗺️", "🏛️", "⭐", "🌟"],
    phrases: ["World explorer! 🌍", "History maker! 🏛️", "Global thinker! 🗺️"],
  },
  "character": {
    gradient: "linear-gradient(135deg, hsl(330 40% 93%), hsl(40 50% 92%))",
    pattern: `url("data:image/svg+xml,%3Csvg width='50' height='50' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M25 15 L28 22 L25 20 L22 22Z' fill='%23ec4899' fill-opacity='0.07'/%3E%3Cpolygon points='10,40 12,36 14,40 12,38' fill='%23eab308' fill-opacity='0.06'/%3E%3C/svg%3E")`,
    emojis: ["💖", "✨", "🌟", "💪", "😊"],
    phrases: ["Heart of gold! 💖", "Shining bright! ✨", "Inner strength! 💪"],
  },
};

// Match sessionTheme to the closest theme key
function matchTheme(sessionTheme: string): ThemeVisual {
  const lower = sessionTheme.toLowerCase();
  if (lower.includes("nature") || lower.includes("animal")) return THEME_VISUALS["nature"];
  if (lower.includes("superhero") || lower.includes("hero")) return THEME_VISUALS["superheroes"];
  if (lower.includes("fantasy") || lower.includes("myth") || lower.includes("magic")) return THEME_VISUALS["fantasy"];
  if (lower.includes("sport") || lower.includes("game")) return THEME_VISUALS["sports"];
  if (lower.includes("science") || lower.includes("stem")) return THEME_VISUALS["science"];
  if (lower.includes("school") || lower.includes("classroom")) return THEME_VISUALS["school"];
  if (lower.includes("social") || lower.includes("studies") || lower.includes("history") || lower.includes("geography")) return THEME_VISUALS["social"];
  if (lower.includes("character") || lower.includes("develop") || lower.includes("kindness") || lower.includes("emotion")) return THEME_VISUALS["character"];
  // Default
  return THEME_VISUALS["school"];
}

// ─── Theme Background Wrapper ───
export function ThemeBackground({ theme, children }: { theme: string; children: ReactNode }) {
  const visual = useMemo(() => matchTheme(theme), [theme]);

  return (
    <div
      className="relative rounded-xl overflow-hidden transition-all duration-[600ms]"
      style={{ background: visual.gradient }}
    >
      {/* Pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-[600ms]"
        style={{
          backgroundImage: visual.pattern,
          backgroundRepeat: "repeat",
          opacity: 1,
        }}
      />
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// ─── Confetti Celebration ───
export function ConfettiCelebration({ show, theme }: { show: boolean; theme: string }) {
  const visual = useMemo(() => matchTheme(theme), [theme]);
  const emojis = visual.emojis;

  if (!show) return null;

  // Generate 12 particles
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

  // Auto-dismiss after 1.5s
  setTimeout(onDone, 1500);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[90] pointer-events-none">
      <div className="animate-motivational-bounce bg-card/95 backdrop-blur-sm border border-border rounded-2xl px-8 py-5 shadow-xl text-center max-w-sm">
        <p className="text-2xl font-bold text-foreground">{phrase}</p>
      </div>
    </div>
  );
}

export { matchTheme, THEME_VISUALS };
export type { ThemeVisual };
