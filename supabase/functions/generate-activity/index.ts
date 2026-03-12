import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { domain, grade, activityIndex } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an English Language Development activity generator for grades 3-5 students. 
Generate ONE activity for the "${domain}" domain. 

WIDA Proficiency Levels: Entering, Emerging, Developing, Expanding, Bridging.
Rotate difficulty across activities. Activity index: ${activityIndex}.

Return ONLY valid JSON (no markdown, no code blocks) with this exact structure:
{
  "domain": "${domain}",
  "type": "<one of: multiple_choice, short_answer, speaking_prompt, listening_prompt>",
  "question": "<clear question for grades 3-5>",
  "passage": "<optional reading passage, include for reading domain>",
  "options": ["<4 options for multiple_choice, omit for other types>"],
  "correctAnswer": "<exact correct answer text>",
  "widaLevel": "<one of: Entering, Emerging, Developing, Expanding, Bridging>",
  "audioDescription": "<for listening: describe what the student should listen to, prefixed with 🔊>"
}

Rules:
- For reading: include a short passage and multiple_choice question
- For writing: use short_answer type with a clear writing prompt
- For speaking: use speaking_prompt type, ask student to say something
- For listening: use multiple_choice with audioDescription field
- Content must be age-appropriate for grades 3-5
- Questions should be clear and encouraging
- Vary topics: animals, school, family, nature, community, seasons`;

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
          { role: "user", content: `Generate a ${domain} activity for grades ${grade}. Make it engaging and educational.` },
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
    
    // Parse the JSON response, handling potential markdown wrapping
    let activity;
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      activity = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Invalid AI response format");
    }

    return new Response(JSON.stringify(activity), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-activity error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
