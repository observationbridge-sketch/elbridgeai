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
  "Science vocabulary",
  "Social studies",
  "ELA reading skills",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { grade } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const theme = THEMES[Math.floor(Math.random() * THEMES.length)];

    const systemPrompt = `You are an expert English Language Development specialist creating anchor sentences for grades 3-5 ELL students, inspired by Literacy Squared / Kathy Escamilla methodology.

Generate ONE anchor sentence from one of these approved categories:
1. Academic sentence frames connected to science or social studies (e.g. "The water cycle begins when water evaporates from the surface of the ocean.")
2. Compare and contrast structures (e.g. "A reptile is different from a mammal because reptiles are cold-blooded.")
3. Descriptive language models (e.g. "The ancient forest was filled with towering trees, mysterious shadows, and the sound of rushing water.")
4. Content obligatory vocabulary sentences (e.g. "Photosynthesis is the process by which plants use sunlight to make their own food.")
5. Positive character development and motivational statements (e.g. "When I face a challenge, I take a deep breath, try my best, and ask for help when I need it.")

Theme for this session: "${theme}"

RULES:
- The sentence MUST be grade-appropriate for grades ${grade}
- The sentence should be 10-20 words long
- Use vivid, specific, kid-friendly language
- Connect to the theme naturally
- The sentence must be complete and grammatically correct
- It should model good academic English patterns

Return ONLY valid JSON (no markdown, no code blocks):
{
  "sentence": "<the anchor sentence>",
  "theme": "${theme}",
  "category": "<which of the 5 categories above>",
  "keyWords": ["<5-8 important words from the sentence for scoring>"]
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
          { role: "user", content: `Generate an anchor sentence with theme "${theme}" for grades ${grade}. Make it vivid and educational.` },
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
      // Fallback
      result = {
        sentence: "The brave explorer climbed the mountain to discover what was hiding behind the clouds.",
        theme,
        category: "Descriptive language models",
        keyWords: ["brave", "explorer", "climbed", "mountain", "discover", "hiding", "clouds"],
      };
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
