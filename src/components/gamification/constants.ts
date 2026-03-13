// Animal evolution levels
export const ANIMAL_LEVELS = [
  { min: 0, max: 50, emoji: "🐣", name: "Baby Chick", description: "Just hatched, starting the journey" },
  { min: 51, max: 150, emoji: "🐢", name: "Little Turtle", description: "Steady and growing" },
  { min: 151, max: 300, emoji: "🦊", name: "Clever Fox", description: "Curious and quick" },
  { min: 301, max: 500, emoji: "🦅", name: "Soaring Eagle", description: "Confident and rising" },
  { min: 501, max: 800, emoji: "🐬", name: "Ocean Dolphin", description: "Playful and fluent" },
  { min: 801, max: Infinity, emoji: "🦋", name: "Language Butterfly", description: "Fully transformed" },
];

export function getAnimalLevel(points: number) {
  return ANIMAL_LEVELS.find((l) => points >= l.min && points <= l.max) || ANIMAL_LEVELS[0];
}

export function getNextLevel(points: number) {
  const current = getAnimalLevel(points);
  const idx = ANIMAL_LEVELS.indexOf(current);
  return idx < ANIMAL_LEVELS.length - 1 ? ANIMAL_LEVELS[idx + 1] : null;
}

// Points values
export const POINTS = {
  STEP1_LISTEN: 2,
  STEP2_REPEAT: 5,
  STEP3_WRITE: 5,
  STEP4_RECORD: 5,
  PART1_COMPLETE: 10,
  PART2_ACTIVITY: 5,
  SESSION_COMPLETE: 15,
  DOMAIN_80_BONUS: 5,
  // Part 3 challenge points
  CHALLENGE_STORY_COMPLETE: 20,
  CHALLENGE_STORY_SEQUENCE_BONUS: 10,
  CHALLENGE_SPEED_CORRECT: 5,
  CHALLENGE_TEACH_COMPLETE: 25,
};

// Badge definitions
export interface BadgeDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: "first_steps" | "consistency" | "skill" | "champion";
}

export const BADGES: BadgeDef[] = [
  // First Steps
  { id: "first_word", name: "First Word", icon: "🌱", description: "Complete your first session", category: "first_steps" },
  { id: "first_voice", name: "First Voice", icon: "🎤", description: "Record speaking for the first time", category: "first_steps" },
  { id: "first_writer", name: "First Writer", icon: "✏️", description: "Complete your first writing activity", category: "first_steps" },
  // Consistency
  { id: "streak_3", name: "3-Day Streak", icon: "🔥", description: "Complete sessions 3 days in a row", category: "consistency" },
  { id: "streak_7", name: "7-Day Streak", icon: "⚡", description: "Complete sessions 7 days in a row", category: "consistency" },
  { id: "sessions_10", name: "10 Sessions", icon: "🌟", description: "Complete 10 total sessions", category: "consistency" },
  // Skill
  { id: "sentence_master", name: "Sentence Master", icon: "🦜", description: "Score 80%+ on Speaking 5 times", category: "skill" },
  { id: "story_reader", name: "Story Reader", icon: "📖", description: "Score 80%+ on Reading 5 times", category: "skill" },
  { id: "word_weaver", name: "Word Weaver", icon: "🖊️", description: "Score 80%+ on Writing 5 times", category: "skill" },
  { id: "super_listener", name: "Super Listener", icon: "👂", description: "Score 80%+ on Listening 5 times", category: "skill" },
  // Champion
  { id: "language_champion", name: "Language Champion", icon: "🏆", description: "Earn all 4 skill badges", category: "champion" },
  { id: "full_evolution", name: "Full Evolution", icon: "🦋", description: "Reach Language Butterfly level", category: "champion" },
  { id: "perfect_session", name: "Perfect Session", icon: "⭐", description: "Score 90%+ across all domains in one session", category: "champion" },
];

export function getBadgeDef(id: string): BadgeDef | undefined {
  return BADGES.find((b) => b.id === id);
}
