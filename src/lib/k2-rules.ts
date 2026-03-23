/**
 * K-2 Activity Engine Rules — PERMANENT, CANNOT BE OVERRIDDEN BY GEMINI OUTPUT
 *
 * This file contains all validation, tile enforcement, and comparison logic
 * for K-2 activities. Every rule is hardcoded and must never be bypassed.
 */

// ════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════

/** Function words that must NEVER appear as distractors under any circumstances */
const BANNED_DISTRACTOR_WORDS = new Set([
  "a", "an", "the", "is", "are", "and", "on", "at", "in", "with",
  "to", "of", "it", "was", "or", "by", "do", "if", "no", "so",
]);

/**
 * Safe fallback words used ONLY when the anchor sentence is too short
 * to provide enough unique distractors.
 */
/**
 * Semantically related distractor pools organized by category.
 * When the anchor sentence is too short, we pick distractors from the same
 * category as the correct answer so students must actually read to choose.
 */
const SEMANTIC_POOLS: Record<string, string[]> = {
  animals: ["cat", "dog", "bird", "fish", "frog", "bear", "fox", "hen", "bug", "cow", "bat", "pig"],
  nature: ["tree", "leaf", "rock", "pond", "hill", "sun", "rain", "wind", "dirt", "moss", "seed", "bark"],
  body: ["hand", "foot", "arm", "leg", "head", "eye", "ear", "nose", "back", "chin"],
  food: ["egg", "milk", "cake", "rice", "soup", "corn", "pie", "jam", "nut", "plum"],
  places: ["park", "home", "barn", "pond", "hill", "farm", "den", "nest", "cave", "road"],
  objects: ["ball", "box", "cup", "hat", "bag", "bed", "pen", "map", "toy", "book"],
  people: ["mom", "dad", "kid", "pal", "boy", "girl", "man", "nan"],
  actions: ["run", "hop", "sit", "fly", "dig", "swim", "hug", "clap", "wave", "kick"],
  colors: ["red", "blue", "pink", "gold", "gray", "tan"],
  size: ["big", "small", "tall", "long", "wide", "thin", "fat", "old", "new"],
};

/** All semantic words flattened for quick lookup */
const ALL_SEMANTIC_WORDS = Object.values(SEMANTIC_POOLS).flat();

/**
 * Find semantically related distractors for a given correct answer.
 * Picks words from the same category so they're plausible but wrong.
 */
export function getSemanticDistractors(correctWord: string, usedWords: Set<string>, count: number): string[] {
  const norm = normalizeWord(correctWord);
  const distractors: string[] = [];

  // Find which category the correct word belongs to
  let matchedPool: string[] | null = null;
  for (const [, pool] of Object.entries(SEMANTIC_POOLS)) {
    if (pool.includes(norm)) {
      matchedPool = pool;
      break;
    }
  }

  // Pull from matched category first
  if (matchedPool) {
    const candidates = matchedPool.filter(w => w !== norm && !usedWords.has(w));
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    for (const w of shuffled) {
      if (distractors.length >= count) break;
      distractors.push(w);
      usedWords.add(w);
    }
  }

  // If still need more, pick from other categories (still real nouns/verbs)
  if (distractors.length < count) {
    const remaining = ALL_SEMANTIC_WORDS
      .filter(w => w !== norm && !usedWords.has(w))
      .sort(() => Math.random() - 0.5);
    for (const w of remaining) {
      if (distractors.length >= count) break;
      distractors.push(w);
      usedWords.add(w);
    }
  }

  return distractors;
}

/** Backward-compatible alias — now returns semantic words instead of articles */
export const SAFE_FALLBACK_WORDS = ["cat", "sun", "hat"];
export const FALLBACK_DISTRACTORS = SAFE_FALLBACK_WORDS;

/** Required tile count per sentence frame tier */
export const TIER_TILE_COUNTS: Record<number, number> = {
  1: 2, // 1 blank → 1 correct + 1 distractor
  2: 4, // 2 blanks → 2 correct + 2 distractors
  3: 6, // 3 blanks → 3 correct + 3 distractors
};

/** Required blank count per tier */
export const TIER_BLANK_COUNTS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
};

/** Max wrong attempts before revealing the answer */
export const MAX_WRONG_ATTEMPTS = 2;

/** Hard safety catch: after this many attempts, force reveal + Next Activity */
export function shouldForceRevealAfterAttempts(attemptCount: number): boolean {
  return attemptCount >= MAX_WRONG_ATTEMPTS;
}

/** Auto-advance delay (ms) after correct answer */
export const CORRECT_AUTO_ADVANCE_MS = 3000;

// ════════════════════════════════════════════════
// WORD NORMALIZATION
// ════════════════════════════════════════════════

/** Normalize a single word: lowercase, strip punctuation, trim */
export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9']/g, "").trim();
}

/** Split a sentence into normalized word array */
export function sentenceToWords(sentence: string): string[] {
  return sentence
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);
}

/** Check if a string contains multiple words */
export function isMultiWord(text: string): boolean {
  return text.trim().split(/\s+/).length > 1;
}

/** Extract a single word from a potentially multi-word tile.
 *  NEVER concatenates words. If multi-word, picks the first short word.
 *  If single word ≤12 chars, returns it. Otherwise returns a safe fallback. */
export function extractSingleWord(input: string): string {
  const words = input.trim().split(/\s+/);

  // Single word that's short enough — return as-is
  if (words.length === 1 && words[0].length <= 12) {
    return words[0].toLowerCase();
  }

  // Multi-word: pick first short word
  const singleWords = words.filter(w => w.length <= 12);
  if (singleWords.length > 0) {
    return singleWords[0].toLowerCase();
  }

  // All words too long — use a random safe fallback
  return SAFE_FALLBACK_WORDS[Math.floor(Math.random() * SAFE_FALLBACK_WORDS.length)];
}

/** Validate a tile string. Rejects non-space strings longer than 12 chars. */
export function validateTile(tile: string): string | null {
  const trimmed = tile.trim();
  if (!trimmed) return null;
  // If single token (no spaces) but suspiciously long, reject it
  if (!trimmed.includes(" ") && trimmed.length > 12) return null;
  return trimmed;
}

const SHORT_FALLBACKS = ALL_SEMANTIC_WORDS;

/** Get a fallback distractor not already in the used set */
export function getFallbackDistractor(usedWords: Set<string>): string {
  const shuffled = [...SHORT_FALLBACKS].sort(() => Math.random() - 0.5);
  for (const fb of shuffled) {
    if (!usedWords.has(fb)) return fb;
  }
  return "hat";
}

// ════════════════════════════════════════════════
// JUMBLED SENTENCE VALIDATION
// ════════════════════════════════════════════════

/**
 * Compare student's word order against correct word order, position by position.
 * Both arrays must already be normalized (lowercase, trimmed).
 * Returns true ONLY if every word matches at every position.
 */
export function isExactWordOrderMatch(
  studentWords: string[],
  correctWords: string[]
): boolean {
  if (studentWords.length !== correctWords.length) return false;
  for (let i = 0; i < correctWords.length; i++) {
    if (studentWords[i] !== correctWords[i]) return false;
  }
  return true;
}

/**
 * Deduplicate chips that differ only in capitalization.
 * e.g., ["a", "A", "cat"] → ["a", "cat"]
 */
export function deduplicateChips(chips: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const chip of chips) {
    const norm = normalizeWord(chip);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      result.push(norm);
    }
  }
  return result;
}

// ════════════════════════════════════════════════
// SENTENCE FRAME TILE ENFORCEMENT
// ════════════════════════════════════════════════

/**
 * Compare tapped word against correct answer (case-insensitive, trimmed).
 * Returns true ONLY on exact match.
 */
export function isSentenceFrameCorrect(
  tappedWord: string,
  correctAnswer: string
): boolean {
  return normalizeWord(tappedWord) === normalizeWord(correctAnswer);
}

/**
 * Build the final tile list for a K-2 Sentence Frame activity.
 * Enforces:
 *  - Single words only (strips multi-word tiles to first word)
 *  - Correct tile count per tier
 *  - At least 1 distractor always present
 *  - No duplicate tiles
 *  - Normalized to lowercase
 */
export function buildSentenceFrameTiles(
  rawTiles: string[],
  correctAnswer: string,
  tier: number
): string[] {
  const targetCount = TIER_TILE_COUNTS[tier] || TIER_TILE_COUNTS[1];
  const correctNorm = normalizeWord(correctAnswer);

  // 1. Clean all tiles: extract single words, validate, normalize
  const cleanedTiles = rawTiles
    .map((t) => extractSingleWord(t))
    .map((t) => validateTile(t))
    .filter((t): t is string => t !== null)
    .map(normalizeWord)
    .filter(Boolean);

  // 2. Start with the correct answer
  const finalTiles: string[] = [correctNorm];
  const usedWords = new Set<string>([correctNorm]);

  // 3. Add distractors from AI output
  for (const tile of cleanedTiles) {
    if (finalTiles.length >= targetCount) break;
    if (!usedWords.has(tile) && !BANNED_DISTRACTOR_WORDS.has(tile)) {
      usedWords.add(tile);
      finalTiles.push(tile);
    }
  }

  // 4. Pad with semantically related distractors if needed
  if (finalTiles.length < targetCount) {
    const needed = targetCount - finalTiles.length;
    const semanticFills = getSemanticDistractors(correctNorm, usedWords, needed);
    finalTiles.push(...semanticFills);
  }

  // 5. Ensure minimum 2 tiles (at least 1 distractor)
  if (finalTiles.length < 2) {
    const semanticFills = getSemanticDistractors(correctNorm, usedWords, 2 - finalTiles.length);
    finalTiles.push(...semanticFills);
  }

  return finalTiles;
}

/**
 * Deterministic shuffle based on a seed string (question content).
 * Ensures same question always produces same tile order.
 */
export function deterministicShuffle(tiles: string[], seed: string): string[] {
  const hashChar = (s: string) =>
    Array.from(s).reduce((sum, c) => sum + c.charCodeAt(0), 0);

  return [...tiles].sort((a, b) => {
    const ha = hashChar(a + seed);
    const hb = hashChar(b + seed);
    return ha - hb;
  });
}

// ════════════════════════════════════════════════
// CONTENT VALIDATION (for Gemini output)
// ════════════════════════════════════════════════

/** Count syllables in a word (approximate) */
export function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return 0;
  if (clean.length <= 3) return 1;
  const vowelGroups = clean.match(/[aeiouy]+/g);
  let count = vowelGroups ? vowelGroups.length : 1;
  if (clean.endsWith("e")) count -= 1;
  if (clean.endsWith("le") && clean.length > 2) count += 1;
  return Math.max(1, count);
}

/** Validate that no word exceeds 2 syllables (K-2 rule) */
export function hasWordOver2Syllables(sentence: string): boolean {
  const words = sentence.split(/\s+/).map((w) => w.replace(/[^a-zA-Z']/g, "")).filter(Boolean);
  return words.some((w) => countSyllables(w) > 2);
}

/** Validate K-2 anchor sentence constraints */
export function validateK2Anchor(sentence: string): { valid: boolean; reason?: string } {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length > 8) return { valid: false, reason: "Exceeds 8 words" };
  const sentences = sentence.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length > 1) return { valid: false, reason: "Must be exactly 1 sentence" };
  if (hasWordOver2Syllables(sentence)) return { valid: false, reason: "Contains word >2 syllables" };
  return { valid: true };
}

// ════════════════════════════════════════════════
// K-2 BANNED TOPICS
// ════════════════════════════════════════════════

// ════════════════════════════════════════════════
// DETERMINISTIC K-2 SENTENCE FRAME GENERATOR
// ════════════════════════════════════════════════

interface AnchorSentenceInput {
  sentence: string;
  keyWords?: string[];
}

/**
 * Generate a K-2 sentence frame deterministically from the anchor sentence.
 * Eliminates Gemini from K-2 SF generation entirely — no concatenation bugs,
 * no wrong blank counts. Template-based, tier-aware, grade-aware.
 */
export function generateK2SentenceFrame(
  anchor: AnchorSentenceInput,
  tier: number,
  gradeLevel: "K-1" | "2",
  activityIndex: number = 0
): { blankSentence: string; correctWords: string[]; tiles: string[] } {
  // Get content words from anchor — skip stop words
  const STOP_WORDS = new Set(["the", "a", "an", "is", "are", "was", "in", "on", "at", "to", "and", "of", "it"]);
  const words = anchor.sentence.replace(/[.!?]/g, "").split(/\s+/).filter(Boolean);
  const normalizedSentenceWords = words.map(normalizeWord).filter(Boolean);
  const uniqueSentenceWords = Array.from(new Set(normalizedSentenceWords));
  const contentWords = words.filter(w => !STOP_WORDS.has(w.toLowerCase()) && w.length > 2);

  // Force K-1 to always Tier 1 regardless of passed tier
  const effectiveTier = gradeLevel === "K-1" ? 1 : Math.min(tier, 3);
  const blankCount = effectiveTier === 1 ? 1 : effectiveTier === 2 ? 2 : 3;

  // Rotate which content word gets blanked based on activityIndex
  // index 0: last content word, index 1: second-to-last, index 2: first, index 3: last again
  let toBlank: string[];
  if (blankCount === 1 && contentWords.length > 1) {
    const rotationPatterns = [
      contentWords.length - 1,                          // index 0: last
      Math.max(0, contentWords.length - 2),             // index 1: second-to-last
      0,                                                 // index 2: first
      contentWords.length - 1,                          // index 3: last again
    ];
    const pickIdx = rotationPatterns[activityIndex % rotationPatterns.length];
    toBlank = [contentWords[pickIdx]];
  } else {
    // Multi-blank tiers: take from end as before
    toBlank = contentWords.slice(-Math.min(blankCount, contentWords.length));
  }

  // If we couldn't find enough content words, fall back to last words of the sentence
  if (toBlank.length === 0) {
    const lastWord = words[words.length - 1]?.replace(/[.!?]/g, "") || "";
    if (lastWord) toBlank.push(lastWord);
  }

  // Build blanked sentence
  let blankSentence = anchor.sentence.replace(/[.!?]$/, "").trim();
  for (const word of toBlank) {
    blankSentence = blankSentence.replace(new RegExp(`\\b${word}\\b`, "i"), "___");
  }
  blankSentence += ".";

  // Build tiles — correct words + distractors from CURRENT anchor sentence only
  const correctWords = toBlank.map((w) => normalizeWord(w)).filter(Boolean);
  const usedWords = new Set(correctWords);
  const sentenceDistractorPool = uniqueSentenceWords.filter((w) => !usedWords.has(w) && !BANNED_DISTRACTOR_WORDS.has(w) && w.length > 2);

  const distractors: string[] = [];
  for (const sentenceWord of sentenceDistractorPool) {
    if (distractors.length >= blankCount) break;
    distractors.push(sentenceWord);
    usedWords.add(sentenceWord);
  }

  // If the sentence is too short, use semantically related distractors
  if (distractors.length < blankCount) {
    const needed = blankCount - distractors.length;
    const semanticFills = getSemanticDistractors(correctWords[0] || "", usedWords, needed);
    distractors.push(...semanticFills);
  }

  // Shuffle tiles
  const tiles = [...correctWords, ...distractors].sort(() => Math.random() - 0.5);

  return { blankSentence, correctWords, tiles };
}

// ════════════════════════════════════════════════
// K-2 BANNED TOPICS
// ════════════════════════════════════════════════

export const K2_BANNED_TOPICS = [
  "volcano", "hurricane", "ecosystem", "photosynthesis", "earthquake",
  "civilization", "democracy", "evolution", "atmosphere", "metamorphosis",
];

export function isK2BannedTopic(topic: string): boolean {
  const lower = topic.toLowerCase();
  return K2_BANNED_TOPICS.some((t) => lower.includes(t));
}
