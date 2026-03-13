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

  // Check if all scores are equal
  const allEqual = domains.every((d) => (domainScores[d] ?? 0) === weakestScore);

  if (allEqual) {
    // Rotate based on current time to vary strategies
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
  // writing
  return {
    strategy: "quick_writes",
    weakestDomain: weakest,
    reason: "Writing was this student's weakest area so today's session focused on Quick Writes.",
  };
}

function buildPrompt(strategy: Strategy, theme: string, questionIndex: number, grade: string): string {
  const difficultyNotes = [
    "Question 1 (easiest)",
    "Question 2 (medium)",
    "Question 3 (hardest — most open-ended)",
  ][questionIndex];

  if (strategy === "sentence_frames") {
    const scaffolding = [
      "ONE blank to fill in. Provide a sentence frame like 'The character felt ___ because the story said ___.' with exactly one blank.",
      "TWO blanks to fill in. Provide a sentence frame like 'I think ___ because ___.' with exactly two blanks.",
      "The student writes the FULL sentence using the frame as a guide only. Show the frame as a model but ask them to write their own complete sentence.",
    ][questionIndex];

    return `You are an expert ELD activity generator for grades ${grade} ELL students.

Generate a SENTENCE FRAMES activity connected to the theme "${theme}".
${difficultyNotes}: ${scaffolding}

STRUCTURE:
1. Include a short 3-5 sentence passage (field: "passage") connected to the theme
2. Present a sentence frame for the student to complete
3. The question should clearly show the frame with blanks marked as ___

Return ONLY valid JSON (no markdown):
{
  "type": "sentence_frame",
  "passage": "<3-5 sentence passage providing context>",
  "question": "<instruction + the sentence frame with ___ blanks>",
  "sentenceFrame": "<just the frame itself, e.g. 'The character felt ___ because ___.'>",
  "modelAnswer": "<a fully completed version of the frame>",
  "acceptableKeywords": ["<6-8 words that any reasonable answer might contain>"],
  "difficulty": ${questionIndex + 1},
  "theme": "${theme}"
}

Use vivid, kid-friendly language. The passage must give enough context to fill in the blanks.`;
  }

  if (strategy === "sentence_expansion") {
    const expansion = [
      "The student simply REPEATS the base sentence exactly as shown. Keep it short (4-6 words).",
      "The student repeats the sentence AND adds a location or description (WHERE or WHAT it looks like). Provide the expanded version.",
      "The student repeats the expanded sentence AND adds a reason or feeling using BECAUSE, SO, or WHEN. Provide the full expanded version.",
    ][questionIndex];

    return `You are an expert ELD activity generator for grades ${grade} ELL students.

Generate a SENTENCE EXPANSION activity connected to the theme "${theme}".
${difficultyNotes}: ${expansion}

The 3 questions in this strategy build on each other:
- Q1: base sentence (e.g. "The dragon flew.")
- Q2: base + location/description (e.g. "The dragon flew over the mountains.")
- Q3: full expanded (e.g. "The dragon flew over the mountains because he was searching for his family.")

Return ONLY valid JSON (no markdown):
{
  "type": "sentence_expansion",
  "baseSentence": "<the sentence the student should say>",
  "question": "<instruction telling the student what to say and what detail to add>",
  "expansionHint": "<what was added, e.g. 'where it happened' or 'why it happened'>",
  "modelAnswer": "<the full expected sentence>",
  "acceptableKeywords": ["<5-8 key words for flexible scoring>"],
  "difficulty": ${questionIndex + 1},
  "theme": "${theme}"
}

Use vivid, kid-friendly language connected to the theme.`;
  }

  // quick_writes
  const scaffold = [
    "Provide BOTH a sentence starter AND a word bank of 4-6 relevant vocabulary words.",
    "Provide a sentence starter ONLY (no word bank).",
    "OPEN prompt — no sentence starter, no word bank. Student writes freely. Still make the prompt specific and vivid.",
  ][questionIndex];

  return `You are an expert ELD activity generator for grades ${grade} ELL students.

Generate a QUICK WRITES activity connected to the theme "${theme}".
${difficultyNotes}: ${scaffold}

RULES:
- The prompt must be clear, specific, and vivid
- Ask for 2-3 sentences minimum
- Include an encouraging note like "Most students finish in about 2 minutes!"
- The topic should be imaginative and fun for kids

Return ONLY valid JSON (no markdown):
{
  "type": "quick_write",
  "question": "<the writing prompt with clear instructions>",
  "sentenceStarter": "<sentence starter like 'The animal I discovered has...' or null if Q3>",
  "wordBank": ${questionIndex === 0 ? '["<4-6 relevant vocabulary words>"]' : "null"},
  "modelAnswer": "<a sample 2-3 sentence response>",
  "acceptableKeywords": ["<6-8 words any reasonable answer might contain>"],
  "difficulty": ${questionIndex + 1},
  "theme": "${theme}"
}

Use vivid, kid-friendly language.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { grade, theme, domainScores, questionIndex } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { strategy, weakestDomain, reason } = selectStrategy(domainScores);
    const prompt = buildPrompt(strategy, theme || "Nature & animals", questionIndex || 0, grade || "3-5");

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
          { role: "user", content: `Generate activity ${(questionIndex || 0) + 1} of 3 for the ${strategy.replace(/_/g, " ")} strategy with theme "${theme}". Make it engaging and grade-appropriate.` },
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

    // Attach strategy metadata
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
