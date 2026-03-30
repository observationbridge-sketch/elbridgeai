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
    const { domain, grade, activityIndex } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const actualDomain = DOMAIN_ROTATION_8[activityIndex] || domain;
    const proficiencyLevel = PROFICIENCY_PROGRESSION_8[activityIndex] || "Developing";
    const theme = "Nature & animals";

    const isK2 = (grade || "3-5") === "K-2";

    const k2ContentRules = isK2 ? `
K-2 CONTENT RULES (MANDATORY):
- Maximum 8 words per sentence, simple subject-verb-object structure ONLY
- NO subordinate clauses, NO "but", "however", "which", "although", "features"
- Topics must be CONCRETE and VISUAL — things kids can see, touch, or imagine
  - GOOD: "What does Mars look like?" → red, rocky, no water, two moons
  - BAD: "unique surface features of Mars" (too abstract)
- Maximum 3 new vocabulary words per session, single-syllable preferred
- Use only Tier 1 (common everyday) vocabulary
- All answer choices must be 1-3 words or emojis, NEVER full sentences
- LISTENING activities: audio must be 1-2 short sentences max, then ask ONE question with 2-3 emoji/picture answer choices
- SPEAKING activities: ask for maximum 1 sentence, open-ended, involve the student's animal companion
- WRITING activities: provide a sentence starter, ask for 1 sentence only
` : "";

    const systemPrompt = `You are an expert English Language Development activity generator for grades ${isK2 ? "K-2" : "3-5"} ELL students.

Generate ONE activity for the "${actualDomain}" domain at proficiency level "${proficiencyLevel}".
Theme for this question: "${theme}"

${STRICT_RULES}
${k2ContentRules}

CRITICAL RULE: Every question MUST be fully self-contained. The student must have ALL information needed to answer within the question itself. Before outputting, verify: "Does this question contain everything the student needs to answer it?"

DOMAIN-SPECIFIC RULES:

READING (type: multiple_choice):
${isK2 ? `- Include a short 1-2 sentence passage in the "passage" field (max 8 words per sentence)
- The passage must use simple words a kindergartener knows
- Ask ONE comprehension question ABOUT that passage
- Provide 2-3 answer options (short, 1-3 words each)` : `- ALWAYS include a short 3-5 sentence passage in the "passage" field
- The passage must be vivid, kid-friendly, and connected to the theme
- Ask a comprehension question ABOUT that specific passage
- Provide 4 answer options where exactly one is clearly correct based on the passage`}
- NEVER ask about content not shown in the passage

LISTENING (type: multiple_choice):
${isK2 ? `- The "audioDescription" field must contain 1-2 simple sentences (max 8 words each) that will be read aloud
- Do NOT prefix audioDescription with "Listen:" — start directly with the sentence content
- Ask ONE simple question about what was heard
- Provide 2-3 answer options using emojis or very short text (1-2 words)
- Include an "emojiHint" field with 1-2 large emojis representing the story content` : `- The "audioDescription" field must contain a complete 3-5 sentence mini-story or description that will be read aloud via TTS
- Do NOT prefix audioDescription with "Listen:" or "Listen to this story:" — start directly with the story content
- Then ask a comprehension question about what was just heard
- Provide 4 answer options`}

SPEAKING (type: speaking_prompt):
${isK2 ? `- Give a simple, fun scenario the student can imagine
- Ask ONE open-ended question — maximum 1 sentence expected
- Mention the student's animal companion (Baby Chick) in the prompt
- The "correctAnswer" should be a SAMPLE 1-sentence answer` : `- Give the student a clear, vivid scene description or scenario
- Ask an open-ended question where MANY answers are reasonable
- The "correctAnswer" should be a SAMPLE answer, not the only accepted answer`}
- Include "acceptableKeywords" array with ${isK2 ? "3-5" : "5-8"} key words/phrases that any reasonable answer might contain

WRITING (type: short_answer):
${isK2 ? `- Give a simple scenario with a clear sentence starter
- Ask for exactly 1 sentence
- Use only words a 5-7 year old would know` : `- Give a specific, vivid scenario connected to the theme
- Provide a clear sentence starter the student can use
- Ask for 1-3 sentences depending on proficiency level (1 for Entering, 2-3 for higher)`}
- The "correctAnswer" should be a SAMPLE answer
- Include "acceptableKeywords" array with ${isK2 ? "3-5" : "5-8"} key words that a reasonable answer might contain

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
  "passage": "<passage for READING domain, omit for others>",
  "options": ["<${isK2 ? "2-3" : "4"} options for multiple_choice only>"],
  "correctAnswer": "<exact correct answer for MC, sample answer for speaking/writing>",
  "acceptableKeywords": ["<keywords for flexible grading on speaking/writing>"],
  "proficiencyLevel": "${proficiencyLevel}",
  "theme": "${theme}",
  "audioDescription": "<mini-story for LISTENING domain, omit for others>"${isK2 ? `,
  "emojiHint": "<1-2 large emojis for LISTENING domain, omit for others>"` : ""}
}

Use vivid, specific, kid-friendly language connected to the theme "${theme}".`;

    const userMessage = `${systemPrompt}\n\nGenerate a ${actualDomain} activity at proficiency level ${proficiencyLevel} with theme "${theme}" for grades ${grade}. Make it engaging, vivid, and fully self-contained.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("Anthropic API error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content[0].text;

    let activity;
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      activity = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Invalid AI response format");
    }

    activity.domain = actualDomain;
    activity.proficiencyLevel = proficiencyLevel;

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
