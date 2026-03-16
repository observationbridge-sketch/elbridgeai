/**
 * K-2 Activity Engine Rules — PERMANENT, CANNOT BE OVERRIDDEN BY GEMINI OUTPUT
 *
 * This file contains all validation, tile enforcement, and comparison logic
 * for K-2 activities. Every rule is hardcoded and must never be bypassed.
 */

// ════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════

/** Fallback distractor words — real, common, K-2 appropriate single words */
export const FALLBACK_DISTRACTORS = [
  "jump", "swim", "run", "big", "red", "fast", "soft", "climb",
  "hot", "cold", "tall", "sit", "eat", "play", "fun", "new",
];

/** Required tile count per sentence frame tier */
export const TIER_TILE_COUNTS: Record<number, number> = {
  1: 2, // 1 correct + 1 distractor
  2: 3, // 1 correct + 2 distractors
  3: 4, // 1 correct + 3 distractors
};

/** Max wrong attempts before revealing the answer */
export const MAX_WRONG_ATTEMPTS = 2;

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

/** Extract the first/single word from a potentially multi-word tile */
export function extractSingleWord(text: string): string {
  // Strip A/B/C/D prefixes
  const stripped = text.replace(/^[A-Da-d][\).:\-]\s*/i, "").trim();
  // If multi-word, take just the first word
  const words = stripped.split(/\s+/).filter(Boolean);
  return words[0] || stripped;
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

  // 1. Clean all tiles: extract single words, normalize
  const cleanedTiles = rawTiles
    .map(extractSingleWord)
    .map(normalizeWord)
    .filter(Boolean);

  // 2. Start with the correct answer
  const finalTiles: string[] = [correctNorm];
  const usedWords = new Set<string>([correctNorm]);

  // 3. Add distractors from AI output
  for (const tile of cleanedTiles) {
    if (finalTiles.length >= targetCount) break;
    if (!usedWords.has(tile)) {
      usedWords.add(tile);
      finalTiles.push(tile);
    }
  }

  // 4. Pad with fallback distractors if needed
  for (const fb of FALLBACK_DISTRACTORS) {
    if (finalTiles.length >= targetCount) break;
    const fbNorm = normalizeWord(fb);
    if (!usedWords.has(fbNorm)) {
      usedWords.add(fbNorm);
      finalTiles.push(fbNorm);
    }
  }

  // 5. Ensure minimum 2 tiles (at least 1 distractor)
  if (finalTiles.length < 2) {
    for (const fb of FALLBACK_DISTRACTORS) {
      if (finalTiles.length >= 2) break;
      const fbNorm = normalizeWord(fb);
      if (!usedWords.has(fbNorm)) {
        usedWords.add(fbNorm);
        finalTiles.push(fbNorm);
      }
    }
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

export const K2_BANNED_TOPICS = [
  "volcano", "hurricane", "ecosystem", "photosynthesis", "earthquake",
  "civilization", "democracy", "evolution", "atmosphere", "metamorphosis",
];

export function isK2BannedTopic(topic: string): boolean {
  const lower = topic.toLowerCase();
  return K2_BANNED_TOPICS.some((t) => lower.includes(t));
}
