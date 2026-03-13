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
- No two consecutive activities should use the exact same input format.
`;

type Strategy = "sentence_frames" | "sentence_expansion" | "quick_writes";

const INPUT_TYPES: Record<Strategy, string[]> = {
  sentence_frames: ["typing", "listen_then_type", "typing", "multiple_choice", "record_then_type", "typing"],
  sentence_expansion: ["recording", "typing", "recording", "multiple_choice", "typing", "typing"],
  quick_writes: ["typing", "listen_then_type", "typing", "typing", "record_then_type", "typing"],
};

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

function getInputTypeFields(inputType: string, topic: string): string {
  let extra = "";
  if (inputType === "listen_then_type") {
    extra = `\n  "audioClip": "<2-3 complete sentences about ${topic} to be read aloud via text-to-speech. Must be self-contained and give all context needed.>",`;
  }
  if (inputType === "multiple_choice") {
    extra = `\n  "options": ["<option A>", "<option B>", "<option C>", "<option D>"],`;
  }
  return extra;
}

function buildHistoryContext(contentHistory: any): string {
  if (!contentHistory) return "";
  const parts: string[] = [];
  parts.push("\n--- STUDENT HISTORY (avoid repeating) ---");
  if (contentHistory.vocabulary?.length > 0) {
    parts.push(`- Vocabulary used recently: [${contentHistory.vocabulary.slice(0, 30).join(", ")}]`);
    parts.push("- Use FRESH vocabulary. New words must outnumber review words 3:1.");
  }
  if (contentHistory.activityFormats?.length > 0) {
    parts.push(`- Activity formats used in last session: [${contentHistory.activityFormats.join(", ")}]`);
    parts.push("- Avoid repeating the same activity format sequence.");
  }
  const missedWords = contentHistory.vocabularyResults
    ?.filter((v: any) => !v.correct)
    .map((v: any) => v.word)
    .slice(0, 10);
  if (missedWords?.length > 0) {
    parts.push(`- Words student struggled with (good for review): [${missedWords.join(", ")}]`);
  }
  parts.push("---\n");
  return parts.join("\n");
}

function buildPrompt(strategy: Strategy, theme: string, topic: string, questionIndex: number, grade: string, contentHistory?: any): string {
  const isK2 = grade === "K-2";
  const inputType = INPUT_TYPES[strategy]?.[questionIndex] || "typing";
  const k2Override = isK2 ? `\nK-2 RULES: Maximum 1 blank per sentence. Multiple choice must have only 2 options. Use only Tier 1 (everyday) vocabulary. Keep sentences under 10 words. Instructions should be very simple.` : "";
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

  const inputTypeNote = `INPUT FORMAT: "${inputType}"${k2Override}
${inputType === "typing" ? "The student will TYPE their answer in a text field." : ""}
${inputType === "listen_then_type" ? "The student will LISTEN to an audio clip (via TTS), then TYPE their answer. You MUST include an 'audioClip' field with 2-3 sentences to be read aloud." : ""}
${inputType === "multiple_choice" ? `The student will SELECT from ${isK2 ? "2" : "4"} options. You MUST include an 'options' array with exactly ${isK2 ? "2" : "4"} choices. 'modelAnswer' must exactly match one option text.` : ""}
${inputType === "recording" ? "The student will RECORD themselves speaking. 'modelAnswer' is what they should say." : ""}
${inputType === "record_then_type" ? "The student will TYPE their answer AND THEN RECORD themselves saying the full sentence aloud." : ""}`;

  const extraFields = getInputTypeFields(inputType, topic);

  if (strategy === "sentence_frames") {
    const scaffolding = [
      "ONE blank to fill in. Provide a sentence frame with exactly one blank marked as ___.",
      "LISTEN THEN TYPE: After hearing the audio clip, the student completes a sentence frame with one blank. Include the audioClip field.",
      "Read a passage then fill TWO blanks in a sentence frame. Provide a passage and a frame with two blanks.",
      "MULTIPLE CHOICE: Provide 4 word options to complete the sentence frame. Include the options array.",
      "Complete the sentence frame by typing, then record saying the full completed sentence aloud.",
      "The student writes their OWN complete sentence about the topic with NO frame provided — fully open.",
    ][questionIndex];

    const histCtx = buildHistoryContext(contentHistory);

    return `You are an expert ELD activity generator for grades ${grade} ELL students.

${themeDirective}
${STRICT_RULES}
${inputTypeNote}
${histCtx}

Generate a SENTENCE FRAMES activity about "${topic}".
${difficultyNote}: ${scaffolding}

STRUCTURE:
1. Include a short 3-5 sentence passage (field: "passage") specifically about "${topic}"
2. Present a sentence frame for the student to complete (unless this is a free production activity)
3. The question should clearly show the frame with blanks marked as ___

Return ONLY valid JSON (no markdown):
{
  "type": "sentence_frame",
  "inputType": "${inputType}",${extraFields}
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
      "RECORDING: The student simply REPEATS the base sentence by recording themselves. Keep the sentence short (4-6 words). About " + topic + ".",
      "TYPING: The student reads the expanded version and fills in the missing expansion word by typing.",
      "RECORDING: The student records the expanded sentence with a new detail added (WHERE).",
      "MULTIPLE CHOICE: The student chooses which expansion makes the most sense from 4 options. Include the options array.",
      "TYPING: The student writes the fully expanded sentence from memory.",
      "TYPING: The student creates their own expanded sentence about the session theme using the same structure.",
    ][questionIndex];

    return `You are an expert ELD activity generator for grades ${grade} ELL students.

${themeDirective}
${STRICT_RULES}
${inputTypeNote}

Generate a SENTENCE EXPANSION activity about "${topic}".
${difficultyNote}: ${expansion}

The 6 questions build on each other, creating a progressively longer sentence about "${topic}".

Return ONLY valid JSON (no markdown):
{
  "type": "sentence_expansion",
  "inputType": "${inputType}",${extraFields}
  "baseSentence": "<the sentence the student should say or expand>",
  "question": "<instruction telling the student what to do>",
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
    "TYPING: Provide BOTH a sentence starter AND a word bank of 5-6 vocabulary words about " + topic + ".",
    "LISTEN THEN TYPE: Include an audioClip with a prompt read aloud. Student listens then writes their response. Include the audioClip field.",
    "TYPING: Provide a sentence starter ONLY (no word bank).",
    "TYPING: Include a short passage to read, then ask the student to write what happens next in 2 sentences.",
    "RECORD THEN TYPE: Student first thinks about their answer, types it, then records themselves saying it aloud.",
    "TYPING: OPEN prompt — student writes freely. Most challenging. About " + topic + ".",
  ][questionIndex];

  return `You are an expert ELD activity generator for grades ${grade} ELL students.

${themeDirective}
${STRICT_RULES}
${inputTypeNote}

Generate a QUICK WRITES activity about "${topic}".
${difficultyNote}: ${scaffold}

RULES:
- The prompt must be clear, specific, and vivid — specifically about "${topic}"
- Ask for 2-3 sentences minimum
- Include an encouraging note like "Most students finish in about 2 minutes!"

Return ONLY valid JSON (no markdown):
{
  "type": "quick_write",
  "inputType": "${inputType}",${extraFields}
  "question": "<the writing prompt about ${topic}>",
  "sentenceStarter": "<sentence starter or null if open prompt>",
  "wordBank": ${questionIndex === 0 ? '["<5-6 vocabulary words about ' + topic + '>"]' : "null"},
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
    const { grade, theme, topic, domainScores, questionIndex, contentHistory } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { strategy, weakestDomain, reason } = selectStrategy(domainScores);
    const prompt = buildPrompt(
      strategy,
      theme || "Nature & animals",
      topic || theme || "Nature & animals",
      questionIndex || 0,
      grade || "3-5",
      contentHistory
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
    // Ensure inputType is set
    if (!activity.inputType) {
      activity.inputType = INPUT_TYPES[strategy]?.[questionIndex || 0] || "typing";
    }

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
