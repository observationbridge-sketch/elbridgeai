import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Strategy = "sentence_frames" | "sentence_expansion" | "quick_writes";

function selectStrategy(domainScores: Record<string, number> | null): { strategy: Strategy; weakestDomain: string; reason: string } {
  if (!domainScores || Object.keys(domainScores).length === 0) {
    return {
      strategy: "sentence_frames",
      weakestDomain: "none",
      reason: "First session — starting with Sentence Frames to build foundational skills.",
    };
  }

  const domains = ["reading", "listening", "speaking", "writing"];
  let weakest = domains[0];
  let weakestScore = domainScores[domains[0]] ?? 100;

  for (const d of domains) {
    const score = domainScores[d] ?? 100;
    if (score < weakestScore) {
      weakestScore = score;
      weakest = d;
    }
  }

  const allEqual = domains.every((d) => (domainScores[d] ?? 0) === weakestScore);

  if (allEqual) {
    const strategies: Strategy[] = ["sentence_frames", "sentence_expansion", "quick_writes"];
    const idx = Math.floor(Date.now() / 86400000) % 3;
    return {
      strategy: strategies[idx],
      weakestDomain: "balanced",
      reason: "All domains are balanced — rotating strategies for variety.",
    };
  }

  if (weakest === "reading" || weakest === "listening") {
    return {
      strategy: "sentence_frames",
      weakestDomain: weakest,
      reason: `${weakest.charAt(0).toUpperCase() + weakest.slice(1)} was this student's weakest area so today's session focused on Sentence Frames.`,
    };
  }
  if (weakest === "speaking") {
    return {
      strategy: "sentence_expansion",
      weakestDomain: weakest,
      reason: "Speaking was this student's weakest area so today's session focused on Sentence Expansion.",
    };
  }
  return {
    strategy: "quick_writes",
    weakestDomain: weakest,
    reason: "Writing was this student's weakest area so today's session focused on Quick Writes.",
  };
}

function buildPrompt(strategy: Strategy, theme: string, topic: string, questionIndex: number, grade: string): string {
  const themeDirective = `CRITICAL THEME RULE: This activity is part of a session about "${topic}" (theme: "${theme}"). ALL content MUST relate directly to "${topic}" only. Before outputting, verify: "Does this activity relate to ${topic}?" — if not, regenerate.`;

  const difficultyLabels = [
    "Question 1 of 6 (easiest — heavy scaffolding)",
    "Question 2 of 6 (easy — moderate scaffolding)",
    "Question 3 of 6 (medium-easy)",
    "Question 4 of 6 (medium)",
    "Question 5 of 6 (medium-hard — less scaffolding)",
    "Question 6 of 6 (hardest — most open-ended)",
  ];
  const difficultyNote = difficultyLabels[questionIndex] || difficultyLabels[5];

  if (strategy === "sentence_frames") {
    const scaffolding = [
      "ONE blank to fill in. Provide a sentence frame with exactly one blank marked as ___.",
      "ONE blank but requires more thought. The blank should need a phrase, not just one word.",
      "TWO blanks to fill in. Provide a sentence frame with two blanks marked as ___.",
      "TWO blanks requiring longer phrases. More complex frame.",
      "The student writes a FULL sentence inspired by the frame. Show the frame as a model only.",
      "The student writes their OWN complete sentence about the topic with NO frame provided — fully open.",
    ][questionIndex];

    return `You are an expert ELD activity generator for grades ${grade} ELL students.

${themeDirective}

Generate a SENTENCE FRAMES activity about "${topic}".
${difficultyNote}: ${scaffolding}

STRUCTURE:
1. Include a short 3-5 sentence passage (field: "passage") specifically about "${topic}"
2. Present a sentence frame for the student to complete
3. The question should clearly show the frame with blanks marked as ___

Return ONLY valid JSON (no markdown):
{
  "type": "sentence_frame",
  "passage": "<3-5 sentence passage about ${topic}>",
  "question": "<instruction + the sentence frame with ___ blanks>",
  "sentenceFrame": "<just the frame itself>",
  "modelAnswer": "<a fully completed version of the frame>",
  "acceptableKeywords": ["<6-8 words that any reasonable answer might contain>"],
  "difficulty": ${questionIndex + 1},
  "theme": "${theme}"
}

Use vivid, kid-friendly language. ALL content must be about "${topic}".`;
  }

  if (strategy === "sentence_expansion") {
    const expansion = [
      "The student simply REPEATS the base sentence exactly. Keep it short (4-6 words). About " + topic + ".",
      "The student repeats + adds WHERE (location). Provide the expanded version.",
      "The student repeats + adds WHAT it looks like (description). Provide the expanded version.",
      "The student repeats + adds WHEN (time). Provide the expanded version.",
      "The student repeats + adds WHY using BECAUSE. Provide the expanded version.",
      "The student says the FULL expanded sentence with all details combined. Provide the complete version.",
    ][questionIndex];

    return `You are an expert ELD activity generator for grades ${grade} ELL students.

${themeDirective}

Generate a SENTENCE EXPANSION activity about "${topic}".
${difficultyNote}: ${expansion}

The 6 questions build on each other, creating a progressively longer sentence about "${topic}".

Return ONLY valid JSON (no markdown):
{
  "type": "sentence_expansion",
  "baseSentence": "<the sentence the student should say>",
  "question": "<instruction telling the student what to say and what detail to add>",
  "expansionHint": "<what was added, e.g. 'where it happened'>",
  "modelAnswer": "<the full expected sentence>",
  "acceptableKeywords": ["<5-8 key words for flexible scoring>"],
  "difficulty": ${questionIndex + 1},
  "theme": "${theme}"
}

ALL content must be about "${topic}".`;
  }

  // quick_writes
  const scaffold = [
    "Provide BOTH a sentence starter AND a word bank of 5-6 vocabulary words about " + topic + ".",
    "Provide a sentence starter AND a word bank of 4 words.",
    "Provide a sentence starter ONLY (no word bank).",
    "Provide a sentence starter ONLY. More complex prompt.",
    "OPEN prompt — no sentence starter, no word bank. Still specific and vivid about " + topic + ".",
    "OPEN prompt — student writes freely. Most challenging. About " + topic + ".",
  ][questionIndex];

  return `You are an expert ELD activity generator for grades ${grade} ELL students.

${themeDirective}

Generate a QUICK WRITES activity about "${topic}".
${difficultyNote}: ${scaffold}

RULES:
- The prompt must be clear, specific, and vivid — specifically about "${topic}"
- Ask for 2-3 sentences minimum
- Include an encouraging note like "Most students finish in about 2 minutes!"

Return ONLY valid JSON (no markdown):
{
  "type": "quick_write",
  "question": "<the writing prompt about ${topic}>",
  "sentenceStarter": "<sentence starter or null if open prompt>",
  "wordBank": ${questionIndex <= 1 ? '["<4-6 vocabulary words about ' + topic + '>"]' : "null"},
  "modelAnswer": "<a sample 2-3 sentence response>",
  "acceptableKeywords": ["<6-8 words any reasonable answer might contain>"],
  "difficulty": ${questionIndex + 1},
  "theme": "${theme}"
}

ALL content must be about "${topic}".`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { grade, theme, topic, domainScores, questionIndex } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { strategy, weakestDomain, reason } = selectStrategy(domainScores);
    const prompt = buildPrompt(
      strategy,
      theme || "Nature & animals",
      topic || theme || "Nature & animals",
      questionIndex || 0,
      grade || "3-5"
    );

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `Generate activity ${(questionIndex || 0) + 1} of 6 for the ${strategy.replace(/_/g, " ")} strategy about "${topic || theme}". Make it engaging and grade-appropriate.` },
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

    let activity;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      activity = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse:", content);
      throw new Error("Invalid AI response format");
    }

    activity.strategy = strategy;
    activity.weakestDomain = weakestDomain;
    activity.strategyReason = reason;

    return new Response(JSON.stringify(activity), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-part2 error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
