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

  // Identify words the student missed for review
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

function selectTheme(history: ContentHistory | null): string {
  if (!history || history.themes.length === 0) {
    return THEMES[Math.floor(Math.random() * THEMES.length)];
  }

  // Don't repeat within 4-session window
  const recentThemes = history.themes.slice(0, 4);
  const available = THEMES.filter((t) => !recentThemes.includes(t));

  if (available.length === 0) {
    // All themes used — pick any but vary sub-topic (AI handles this via history context)
    return THEMES[Math.floor(Math.random() * THEMES.length)];
  }

  return available[Math.floor(Math.random() * available.length)];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { grade, contentHistory } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const history = contentHistory as ContentHistory | null;
    const theme = selectTheme(history);
    const historyContext = buildHistoryContext(history);

    const isK2 = grade === "K-2";

    const systemPrompt = isK2
      ? `You are an expert English Language Development specialist creating anchor sentences for K-2 ELL students.

Generate ONE anchor sentence of exactly 1 sentence, maximum 8 words. Use simple subject-verb-object structure.
Use only Tier 1 (common everyday) vocabulary.

Theme for this session: "${theme}"

Create a specific topic within this theme. For example:
- Theme "Nature & animals" → topic "A butterfly in the garden"
- Theme "School & classroom life" → topic "Playing at recess"
${historyContext}
${STRICT_RULES}

RULES:
- Exactly 1 sentence, maximum 8 words
- Simple subject-verb-object structure
- Tier 1 vocabulary only (common everyday words)
- Grade-appropriate for K-2
- Vivid, specific, kid-friendly language

Return ONLY valid JSON (no markdown, no code blocks):
{
  "sentence": "<the 1 sentence anchor, max 8 words>",
  "theme": "${theme}",
  "topic": "<specific topic>",
  "category": "<category>",
  "keyWords": ["<4-6 important words from the sentence>"]
}`
      : `You are an expert English Language Development specialist creating anchor passages for grades 3-5 ELL students, inspired by Literacy Squared / Kathy Escamilla methodology.

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate an anchor passage with theme "${theme}" for grades ${grade}. Make it vivid, educational, and 2-3 sentences long.` },
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
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    let result;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", content);
      result = {
        sentence: "The ancient pyramids of Egypt were built thousands of years ago by skilled workers. They used massive stone blocks that weighed more than an elephant. These incredible structures still stand tall in the desert today.",
        theme,
        topic: "The building of the ancient pyramids",
        category: "Descriptive language models",
        keyWords: ["ancient", "pyramids", "Egypt", "built", "workers", "stone", "blocks", "elephant", "structures", "desert"],
      };
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
