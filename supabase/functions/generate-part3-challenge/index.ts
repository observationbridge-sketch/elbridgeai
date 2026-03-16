import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRICT_RULES = `
ABSOLUTE RULES FOR ALL ACTIVITIES:
- NEVER mention partners, pair work, group work, or classroom peers — this is a solo digital activity
- NEVER say "look at the picture", "look at the image", "look at the photo", or reference any visual not displayed on screen
- NEVER ask a speaking question with one specific correct answer — speaking prompts must be open-ended
- ALWAYS provide all context needed within the activity — never assume outside knowledge
- NEVER use "partner", "class", or "teacher" in student-facing text
- ALWAYS frame activities as solo adventures connected to the session theme
- Before outputting, verify: "Can a student sitting alone on a device complete this with only what is shown on screen?" If not, rewrite.
`;

type ChallengeType = "story_builder" | "speed_round" | "teach_it_back";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { grade, theme, topic, forceType, contentHistory } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const isK2 = grade === "K-2";
    
    // Use history to avoid repeating challenge types
    let challenges: ChallengeType[] = isK2 ? ["speed_round"] : ["story_builder", "speed_round", "teach_it_back"];
    if (contentHistory?.challengeTypes?.length > 0 && !isK2) {
      const recent = contentHistory.challengeTypes.slice(0, 2);
      const available = challenges.filter((c) => !recent.includes(c));
      if (available.length > 0) challenges = available;
    }
    const challengeType = forceType || challenges[Math.floor(Math.random() * challenges.length)];

    const themeDirective = `CRITICAL: This challenge is part of a session about "${topic}" (theme: "${theme}"). ALL content MUST relate directly to "${topic}" only.`;

    let systemPrompt: string;

    if (challengeType === "story_builder") {
      systemPrompt = `You are an expert ELD activity generator for grades ${grade} ELL students.

${themeDirective}
${STRICT_RULES}

Generate a STORY BUILDER challenge. The student will write a 4-6 sentence mini story connecting 4 vivid scene descriptions.

Create 4 short scene descriptions (1-2 sentences each) that form a logical sequence about "${topic}". Describe vivid scenes in words — do NOT reference any pictures or images.

Return ONLY valid JSON (no markdown):
{
  "challengeType": "story_builder",
  "title": "Story Builder",
  "instruction": "Write a 4-6 sentence mini story connecting all 4 scenes in order!",
  "scenes": [
    "<Scene 1: vivid 1-2 sentence description about ${topic}>",
    "<Scene 2: vivid 1-2 sentence description continuing the story>",
    "<Scene 3: vivid 1-2 sentence description building tension>",
    "<Scene 4: vivid 1-2 sentence description with resolution>"
  ],
  "sentenceStarter": "It all began when...",
  "acceptableKeywords": ["<8-10 keywords related to ${topic} and sequence words>"],
  "sequenceWords": ["first", "then", "next", "finally", "after", "before"],
  "theme": "${theme}",
  "topic": "${topic}"
}`;
    } else if (challengeType === "speed_round") {
      systemPrompt = `You are an expert ELD activity generator for grades ${grade} ELL students.

${themeDirective}
${STRICT_RULES}

Generate a SPEED ROUND challenge with exactly ${isK2 ? "3" : "5"} multiple-choice questions about "${topic}".${isK2 ? "\nK-2 RULES: Each question must have exactly 2 options only. Use simple Tier 1 vocabulary. Short sentences under 10 words." : ""}
- 2 reading comprehension (include a short 2-3 sentence passage each)
- 1 listening comprehension (include an audioDescription field with a 2-3 sentence story)
- 1 speaking prompt (open-ended, multiple reasonable answers — frame as multiple choice for speed)
- 1 writing prompt (include a sentence to complete)

Each question must have exactly 4 options with one clearly correct answer.
Do NOT reference any images, pictures, or visuals.

Return ONLY valid JSON (no markdown):
{
  "challengeType": "speed_round",
  "title": "Speed Round",
  "instruction": "Answer 5 quick questions about ${topic}! How fast can you go?",
  "questions": [
    {
      "domain": "reading",
      "passage": "<2-3 sentence passage about ${topic}>",
      "question": "<comprehension question>",
      "options": ["<option A>", "<option B>", "<option C>", "<option D>"],
      "correctAnswer": "<exact text of correct option>"
    },
    {
      "domain": "reading",
      "passage": "<different 2-3 sentence passage>",
      "question": "<comprehension question>",
      "options": ["<A>", "<B>", "<C>", "<D>"],
      "correctAnswer": "<correct>"
    },
    {
      "domain": "listening",
      "audioDescription": "Listen to this story: <2-3 sentence story about ${topic}>",
      "question": "<comprehension question>",
      "options": ["<A>", "<B>", "<C>", "<D>"],
      "correctAnswer": "<correct>"
    },
    {
      "domain": "speaking",
      "question": "<open-ended speaking prompt about ${topic}>",
      "options": ["<A>", "<B>", "<C>", "<D>"],
      "correctAnswer": "<correct>"
    },
    {
      "domain": "writing",
      "question": "<sentence completion about ${topic}>",
      "options": ["<A>", "<B>", "<C>", "<D>"],
      "correctAnswer": "<correct>"
    }
  ],
  "theme": "${theme}",
  "topic": "${topic}"
}

ALL questions must be specifically about "${topic}".`;
    } else {
      systemPrompt = `You are an expert ELD activity generator for grades ${grade} ELL students.

${themeDirective}
${STRICT_RULES}

Generate a TEACH IT BACK challenge. The student will record themselves explaining "${topic}" in their own words.

Provide helpful vocabulary words they learned during the session and guiding questions. Do NOT reference any images, pictures, or visuals.

Return ONLY valid JSON (no markdown):
{
  "challengeType": "teach_it_back",
  "title": "Teach It Back",
  "instruction": "You just learned about ${topic}. Now teach it to someone else! Record yourself explaining the topic in your own words for at least 30 seconds.",
  "guidingQuestions": [
    "<What is ${topic} about?>",
    "<Why is it important or interesting?>",
    "<What is one cool fact about ${topic}?>"
  ],
  "vocabularyHints": ["<6-8 key vocabulary words from the session about ${topic}>"],
  "acceptableKeywords": ["<8-10 keywords for scoring relevance>"],
  "theme": "${theme}",
  "topic": "${topic}"
}`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a ${challengeType.replace(/_/g, " ")} challenge about "${topic}" for grades ${grade}. Make it fun and engaging!` },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    let challenge;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      challenge = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse:", content);
      throw new Error("Invalid AI response format");
    }

    challenge.challengeType = challengeType;

    return new Response(JSON.stringify(challenge), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-part3-challenge error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
