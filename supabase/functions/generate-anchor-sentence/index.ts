import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { grade } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const theme = THEMES[Math.floor(Math.random() * THEMES.length)];

    const systemPrompt = `You are an expert English Language Development specialist creating anchor passages for grades 3-5 ELL students, inspired by Literacy Squared / Kathy Escamilla methodology.

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

    // Ensure topic field exists
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
