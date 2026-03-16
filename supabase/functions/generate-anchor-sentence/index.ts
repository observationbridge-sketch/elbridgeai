import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRICT_RULES = `
ABSOLUTE RULES:
- NEVER mention partners, pair work, group work, or classroom peers — this is a solo digital activity
- NEVER say "look at the picture", "look at the image", or reference any visual not displayed on screen
- NEVER use "partner", "class", or "teacher" in student-facing text
- ALWAYS frame content as a solo learning adventure
- Before outputting, verify: "Can a student sitting alone on a device use this with only what is shown on screen?"
`;

const THEMES = [
  "Nature & animals",
  "School & classroom life",
  "Sports & games",
  "Superheroes",
  "Fantasy & myths",
  "Ancient Egypt",
  "Ocean exploration",
  "Space & planets",
  "Rainforest adventures",
  "Volcanoes & earthquakes",
];

const K2_SAFE_THEMES = [
  "Nature & animals",
  "School & classroom life",
  "Sports & games",
  "Superheroes",
  "Fantasy & myths",
  "Character development",
];

const K2_BANNED_WORDS = new Set([
  "agility", "focus", "required", "defenders", "weaving", "balance", "features",
  "unique", "surface", "legendary", "behavior", "appearance",
  "volcano", "hurricane", "ecosystem", "rainforest", "ancient", "pyramid",
  "planet", "earthquake", "explore", "discover", "migrate", "creature", "structure",
]);

const K2_FORBIDDEN_CONNECTORS = new Set(["while", "both", "must", "however", "which"]);

const FALLBACK_35 = [
  {
    sentence: "The ancient pyramids of Egypt were built thousands of years ago by skilled workers. They used massive stone blocks that weighed more than an elephant. These incredible structures still stand tall in the desert today.",
    topic: "The building of the ancient pyramids",
    category: "Descriptive language models",
    keyWords: ["ancient", "pyramids", "Egypt", "built", "workers", "stone", "blocks", "elephant", "structures", "desert"],
  },
  {
    sentence: "Deep in the Amazon rainforest, thousands of animals make their homes in the trees. Scientists are still discovering new species every year.",
    topic: "Animals of the Amazon rainforest",
    category: "Descriptive language models",
    keyWords: ["Amazon", "rainforest", "animals", "homes", "trees", "scientists", "discovering", "species"],
  },
  {
    sentence: "The ocean covers more than half of our planet and is home to millions of living things. Much of the deep ocean remains unexplored and mysterious.",
    topic: "Exploring the deep ocean",
    category: "Descriptive language models",
    keyWords: ["ocean", "planet", "home", "millions", "living", "deep", "unexplored", "mysterious"],
  },
];

function extractJsonFromAiResponse(rawContent: string): any {
  const cleaned = rawContent
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const arrayStart = cleaned.indexOf("[");
  const objectStart = cleaned.indexOf("{");
  const startCandidates = [arrayStart, objectStart].filter((v) => v >= 0);
  const jsonStart = startCandidates.length > 0 ? Math.min(...startCandidates) : -1;

  if (jsonStart === -1) {
    throw new Error("No JSON payload found in AI response");
  }

  const startsWithArray = cleaned[jsonStart] === "[";
  const jsonEnd = startsWithArray ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
  if (jsonEnd === -1 || jsonEnd < jsonStart) {
    throw new Error("JSON payload appears truncated");
  }

  const candidate = cleaned.slice(jsonStart, jsonEnd + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    const repaired = candidate
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[\x00-\x1F\x7F]/g, "");
    return JSON.parse(repaired);
  }
}

function countSentences(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z']/g, ""))
    .filter(Boolean).length;
}

function countSyllables(rawWord: string): number {
  const word = rawWord.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return 0;
  if (word.length <= 3) return 1;

  const vowelGroups = word.match(/[aeiouy]+/g);
  let syllables = vowelGroups ? vowelGroups.length : 1;

  if (word.endsWith("e")) syllables -= 1;
  if (word.endsWith("le") && word.length > 2) syllables += 1;

  return Math.max(1, syllables);
}

function validateK2Sentence(sentence: string): { valid: boolean; reason?: string } {
  if (countSentences(sentence) !== 1) return { valid: false, reason: "Must be exactly one sentence" };
  if (countWords(sentence) > 8) return { valid: false, reason: "Sentence exceeds 8 words" };

  const words = sentence
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z']/g, ""))
    .filter(Boolean);

  if (words.some((w) => K2_BANNED_WORDS.has(w))) return { valid: false, reason: "Contains banned vocabulary" };
  if (words.some((w) => K2_FORBIDDEN_CONNECTORS.has(w))) return { valid: false, reason: "Contains forbidden connector" };
  if (words.some((w) => countSyllables(w) > 2)) return { valid: false, reason: "Contains word longer than 2 syllables" };

  return { valid: true };
}

function validateK2Topic(topic: string): { valid: boolean; reason?: string } {
  if (!topic?.trim()) return { valid: false, reason: "Missing topic" };
  if (countSentences(topic) > 1) return { valid: false, reason: "Topic must be one sentence/phrase" };
  if (countWords(topic) > 8) return { valid: false, reason: "Topic is too long" };

  const words = topic
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z']/g, ""))
    .filter(Boolean);

  if (words.some((w) => K2_BANNED_WORDS.has(w))) return { valid: false, reason: "Topic contains banned vocabulary" };
  if (words.some((w) => countSyllables(w) > 2)) return { valid: false, reason: "Topic has complex words" };

  return { valid: true };
}

function validateK2Result(result: any): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];

  const sentenceCheck = validateK2Sentence(result?.sentence || "");
  if (!sentenceCheck.valid && sentenceCheck.reason) reasons.push(sentenceCheck.reason);

  const topicCheck = validateK2Topic(result?.topic || "");
  if (!topicCheck.valid && topicCheck.reason) reasons.push(topicCheck.reason);

  const keyWords = Array.isArray(result?.keyWords) ? result.keyWords : [];
  if (keyWords.length > 3) reasons.push("K-2 keyWords must be 3 or fewer");

  return { valid: reasons.length === 0, reasons };
}

interface ContentHistory {
  themes: string[];
  topics: string[];
  vocabulary: string[];
  activityFormats: string[];
  challengeTypes: string[];
  vocabularyResults: Array<{ word: string; correct: boolean }>;
}

function buildHistoryContext(history: ContentHistory | null): string {
  if (!history) return "";

  const parts: string[] = [];
  parts.push("\n--- STUDENT HISTORY (avoid repeating) ---");

  if (history.themes.length > 0) {
    parts.push(`- Themes used recently: [${history.themes.join(", ")}]`);
    parts.push(`- CRITICAL: Do NOT pick any of these themes: ${history.themes.slice(0, 4).join(", ")}`);
  }
  if (history.topics.length > 0) {
    parts.push(`- Topics covered: [${history.topics.join(", ")}]`);
  }
  if (history.vocabulary.length > 0) {
    parts.push(`- Vocabulary words used recently: [${history.vocabulary.slice(0, 30).join(", ")}]`);
    parts.push(`- Use FRESH vocabulary. New words must outnumber review words 3:1.`);
  }

  const missedWords = history.vocabularyResults
    ?.filter((v) => !v.correct)
    .map((v) => v.word)
    .slice(0, 10);
  if (missedWords && missedWords.length > 0) {
    parts.push(`- Words the student struggled with (good for review): [${missedWords.join(", ")}]`);
  }

  parts.push("Please select a different theme, fresh vocabulary, and a new topic.\n---");
  return parts.join("\n");
}

function selectTheme(history: ContentHistory | null, isK2: boolean): string {
  const themePool = isK2 ? K2_SAFE_THEMES : THEMES;

  if (!history || history.themes.length === 0) {
    return themePool[Math.floor(Math.random() * themePool.length)];
  }

  const recentThemes = history.themes.slice(0, 4);
  const available = themePool.filter((t) => !recentThemes.includes(t));

  if (available.length === 0) {
    return themePool[Math.floor(Math.random() * themePool.length)];
  }

  return available[Math.floor(Math.random() * available.length)];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { grade, contentHistory, forcedTheme } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const history = contentHistory as ContentHistory | null;
    const isK2 = grade === "K-2";
    const theme = forcedTheme || selectTheme(history, isK2);
    const historyContext = buildHistoryContext(history);

    const systemPrompt = isK2
      ? `STRICT K-2 LANGUAGE RULES — YOU MUST FOLLOW THESE EXACTLY:

Maximum 1 sentence for the anchor/listening sentence. Never 2 or 3 sentences.
Maximum 8 words per sentence.
Only use words a 5-7 year old native English speaker would know.
NEVER use: agility, focus, required, defenders, weaving, balance, features, unique, surface, legendary, behavior, appearance, volcano, hurricane, ecosystem, rainforest, ancient, pyramid, planet, earthquake, explore, discover, migrate, creature, structure, or any word longer than 2 syllables.
Sentence structure: simple subject + verb + object only. No subordinate clauses, no 'while', no 'both...and', no 'must'.
Good K-2 example: "Soccer players kick the ball into the net."
Good K-2 example: "A lion lives in the hot, sunny grass."
Bad K-2 example: ANYTHING resembling advanced 4th-5th grade text.
The topic must also be simplified:
- Bad K-2 topic: "The skills needed to play soccer"
- Good K-2 topic: "Playing soccer is fun!"
- Bad K-2 topic: "The unique surface features of Mars"
- Good K-2 topic: "A dog runs in the park"
Every single piece of content generated for K-2 must pass this test: Could a 6-year-old who is still learning English understand this? If not, rewrite it.

You are an expert English Language Development specialist creating anchor sentences for K-2 ELL students.

Generate ONE anchor sentence of exactly 1 sentence, maximum 8 words. Use simple subject-verb-object structure.
Use only Tier 1 (common everyday) vocabulary.
Use maximum 3 key vocabulary words.

Theme for this session: "${theme}"

Create a specific topic within this theme using concrete, visual ideas only.
Examples:
- Theme "Nature & animals" → topic "A butterfly in a flower garden"
- Theme "School & classroom life" → topic "Kids play on the school swing"
- Theme "Sports & games" → topic "A dog runs in the park"
${historyContext}
${STRICT_RULES}

RULES:
- Exactly 1 sentence, maximum 8 words
- Simple subject-verb-object structure only
- Tier 1 vocabulary only, max 2 syllables per word
- Concrete and visual topic only
- Maximum 3 keyWords
- Grade-appropriate for K-2

Return ONLY valid JSON (no markdown, no code blocks):
{
  "sentence": "<the 1 sentence anchor, max 8 words>",
  "theme": "${theme}",
  "topic": "<simple concrete topic>",
  "category": "<category>",
  "keyWords": ["<up to 3 important words from the sentence>"]
}`
      : `You are an expert English Language Development specialist creating anchor passages for grades 3-5 ELL students.

Generate ONE anchor passage of exactly 2-3 sentences from one of these approved categories:
1. Academic sentence frames connected to science or social studies
2. Compare and contrast structures
3. Descriptive language models
4. Content obligatory vocabulary sentences
5. Positive character development and motivational statements

Theme for this session: "${theme}"

You must also create a specific topic within this theme. For example:
- Theme "Nature & animals" → topic "How butterflies migrate south in autumn"
- Theme "Ancient Egypt" → topic "The building of the Great Pyramid"
- Theme "Ocean exploration" → topic "Deep sea creatures that glow in the dark"
${historyContext}
${STRICT_RULES}

RULES:
- The passage MUST be exactly 2-3 complete sentences
- Total length should be 20-40 words
- Grade-appropriate for grades ${grade}
- Use vivid, specific, kid-friendly language
- Connect directly and specifically to the theme and topic
- Model good academic English patterns
- The passage should tell a mini-story or describe something specific

Return ONLY valid JSON (no markdown, no code blocks):
{
  "sentence": "<the 2-3 sentence anchor passage>",
  "theme": "${theme}",
  "topic": "<specific topic within the theme, e.g. 'How butterflies migrate south'>",
  "category": "<which of the 5 categories above>",
  "keyWords": ["<8-12 important words from the passage for scoring>"]
}`;

    const maxAttempts = isK2 ? 4 : 2;
    let result: any = null;
    let lastK2FailureReasons: string[] = [];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const retryInstruction = isK2 && attempt > 0
        ? `Previous output failed K-2 checks: ${lastK2FailureReasons.join("; ")}. Regenerate with simpler vocabulary, exactly one short sentence, and a concrete topic.`
        : "";

      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-pro",
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: `${isK2 ? "Generate one simple K-2 anchor sentence" : "Generate an anchor passage"} with theme "${theme}" for grades ${grade}. ${retryInstruction}`,
              },
            ],
          }),
        });

        if (!response.ok) {
          const t = await response.text();
          console.error("AI gateway error:", response.status, t);
          if (response.status === 429) {
            return new Response(JSON.stringify({ error: "Rate limited" }), {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (response.status === 402) {
            return new Response(JSON.stringify({ error: "Payment required" }), {
              status: 402,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          throw new Error("AI gateway error");
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content || typeof content !== "string") {
          throw new Error("Empty AI response");
        }

        const parsed = extractJsonFromAiResponse(content);

        if (!parsed.topic) parsed.topic = parsed.theme;

        if (!isK2) {
          result = parsed;
          break;
        }

        const validation = validateK2Result(parsed);
        if (validation.valid) {
          result = parsed;
          break;
        }

        lastK2FailureReasons = validation.reasons;
        console.warn(`K-2 validation failed (attempt ${attempt + 1}/${maxAttempts}):`, validation.reasons);
      } catch (parseErr) {
        console.error(`Attempt ${attempt + 1} failed:`, parseErr);
        lastK2FailureReasons = [(parseErr as Error).message || "Parse error"];
      }
    }

    if (!result) {
      if (isK2) {
        result = {
          sentence: "The dog runs fast in the park.",
          theme,
          topic: "A dog runs in the park",
          category: "Descriptive language models",
          keyWords: ["dog", "runs", "park"],
        };
      } else {
        const fb = FALLBACK_35[Math.floor(Math.random() * FALLBACK_35.length)];
        result = { ...fb, theme };
      }
    }

    if (!result.topic) {
      result.topic = result.theme;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-anchor-sentence error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
