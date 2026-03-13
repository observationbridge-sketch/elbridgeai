import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRICT_RULES = `
ABSOLUTE RULES FOR ALL ACTIVITIES:
- NEVER mention partners, pair work, group work, or classroom peers — this is a solo digital activity
- NEVER say "look at the picture", "look at the image", "look at the photo", or reference any visual not displayed on screen
- NEVER ask a speaking question with one specific correct answer — speaking prompts must be open-ended and accept any reasonable response
- ALWAYS provide all context needed within the activity — never assume outside knowledge
- NEVER use "partner", "class", or "teacher" in student-facing text
- ALWAYS frame activities as solo adventures connected to the session theme
- Before outputting, verify: "Can a student sitting alone on a device complete this with only what is shown on screen?" If not, rewrite.
`;

const DOMAIN_ROTATION_8 = [
  "reading", "listening", "speaking", "writing",
  "reading", "listening", "speaking", "writing",
];

const PROFICIENCY_PROGRESSION_8 = [
  "Entering", "Entering", "Emerging", "Emerging",
  "Developing", "Developing", "Expanding", "Expanding",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { domain, grade, activityIndex, theme: sessionTheme } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const actualDomain = DOMAIN_ROTATION_8[activityIndex] || domain;
    const proficiencyLevel = PROFICIENCY_PROGRESSION_8[activityIndex] || "Developing";
    const theme = sessionTheme || "Nature & animals";

    const systemPrompt = `You are an expert English Language Development activity generator for grades 3-5 ELL students.

Generate ONE activity for the "${actualDomain}" domain at proficiency level "${proficiencyLevel}".
Theme for this question: "${theme}"

${STRICT_RULES}

CRITICAL RULE: Every question MUST be fully self-contained. The student must have ALL information needed to answer within the question itself. Before outputting, verify: "Does this question contain everything the student needs to answer it?"

DOMAIN-SPECIFIC RULES:

READING (type: multiple_choice):
- ALWAYS include a short 3-5 sentence passage in the "passage" field
- The passage must be vivid, kid-friendly, and connected to the theme
- Ask a comprehension question ABOUT that specific passage
- Provide 4 answer options where exactly one is clearly correct based on the passage
- NEVER ask about content not shown in the passage

LISTENING (type: multiple_choice):
- The "audioDescription" field must contain a complete 3-5 sentence mini-story or description that will be read aloud via TTS
- Start audioDescription with "Listen to this story:" followed by the full story
- Then ask a comprehension question about what was just heard
- Provide 4 answer options

SPEAKING (type: speaking_prompt):
- Give the student a clear, vivid scene description or scenario
- Ask an open-ended question where MANY answers are reasonable
- The "correctAnswer" should be a SAMPLE answer, not the only accepted answer
- Include "acceptableKeywords" array with 5-8 key words/phrases that any reasonable answer might contain

WRITING (type: short_answer):
- Give a specific, vivid scenario connected to the theme
- Provide a clear sentence starter the student can use
- Ask for 1-3 sentences depending on proficiency level (1 for Entering, 2-3 for higher)
- The "correctAnswer" should be a SAMPLE answer
- Include "acceptableKeywords" array with 5-8 key words that a reasonable answer might contain

PROFICIENCY LEVEL GUIDELINES:
- Entering (Level 1): Simple vocabulary, short sentences, basic comprehension
- Emerging (Level 2): Simple sentences, familiar topics, some descriptive words
- Developing (Level 3): More complex sentences, content vocabulary, paragraph-level text
- Expanding (Level 4): Grade-level complexity, academic vocabulary, inference questions

Return ONLY valid JSON (no markdown, no code blocks) with this structure:
{
  "domain": "${actualDomain}",
  "type": "<multiple_choice | short_answer | speaking_prompt>",
  "question": "<clear, kid-friendly question>",
  "passage": "<3-5 sentence passage for READING domain, omit for others>",
  "options": ["<4 options for multiple_choice only>"],
  "correctAnswer": "<exact correct answer for MC, sample answer for speaking/writing>",
  "acceptableKeywords": ["<5-8 keywords for flexible grading on speaking/writing>"],
  "widaLevel": "${widaLevel}",
  "theme": "${theme}",
  "audioDescription": "<complete mini-story for LISTENING domain, omit for others>"
}

Use vivid, specific, kid-friendly language connected to the theme "${theme}".`;

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
          { role: "user", content: `Generate a ${actualDomain} activity at proficiency level ${widaLevel} with theme "${theme}" for grades ${grade}. Make it engaging, vivid, and fully self-contained.` },
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

    let activity;
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      activity = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Invalid AI response format");
    }

    activity.domain = actualDomain;
    activity.widaLevel = widaLevel;

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
