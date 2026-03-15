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

IMPORTANT SESSION DIFFICULTY CURVE:
Activity 1: Easy (warm up) → Activity 2: Easy-Medium → Activity 3: Medium-Hard → Activity 4: HARDEST (peak) → Activity 5: Medium-Easy (wind down) → Activity 6: Easy and fun (end on a win)
Students MUST always finish a session feeling successful, not stuck.

CRITICAL RULE FOR POSITIONS 5 AND 6: For activity positions 5 and 6, you MUST ONLY generate light, low-cognitive-load activities. NEVER generate multi-sentence organizing tasks, story sequencing, multi-scene writing, or any task requiring 3+ sentences of original writing for these positions. The session must end feeling easy and fun. The 4-scene sequential story writing prompt is BANNED from positions 5 and 6 — it may ONLY appear in positions 2, 3, or 4.
`;

type Strategy = "sentence_frames" | "sentence_expansion" | "quick_writes";

// Difficulty arc: 1-2 warmup, 3-4 peak, 5 wind-down, 6 light/fun
const INPUT_TYPES: Record<Strategy, string[]> = {
  sentence_frames: ["typing", "listen_then_type", "typing", "multiple_choice", "multiple_choice", "typing"],
  sentence_expansion: ["recording", "typing", "recording", "multiple_choice", "typing", "typing"],
  quick_writes: ["typing", "listen_then_type", "typing", "typing", "multiple_choice", "typing"],
};

// HARD RULE: Activities banned from positions 5 and 6
const HEAVY_ACTIVITY_PATTERNS = [
  "sequential story", "4-scene", "multi-scene", "organize sentences",
  "story writing", "multiple paragraphs", "write a story with",
  "arrange the scenes", "put the story in order", "write 4",
  "write three or more sentences", "write 3 or more",
];

function isHeavyActivity(activity: any): boolean {
  const text = JSON.stringify(activity).toLowerCase();
  if (HEAVY_ACTIVITY_PATTERNS.some(p => text.includes(p))) return true;
  // Check if question asks for 3+ sentences
  const sentenceMatch = (activity.question || "").match(/write\s+(\d+)\s+sentence/i);
  if (sentenceMatch && parseInt(sentenceMatch[1]) >= 3) return true;
  if ((activity.scenes && activity.scenes.length >= 3)) return true;
  return false;
}

// Fallback light activities for positions 5 and 6
function generateFallbackActivity(position: number, theme: string, topic: string, grade: string, strategy: Strategy): any {
  const isK2 = grade === "K-2";
  if (position === 5) {
    // Position 6 (0-indexed 5) — light & fun
    if (isK2) {
      return {
        type: "light_fun",
        inputType: "recording",
        question: `Tell your animal companion: "My favorite thing about ${topic} is ___!" Say it out loud! 🎤`,
        modelAnswer: `My favorite thing about ${topic} is how fun it is!`,
        acceptableKeywords: [topic.split(" ")[0]?.toLowerCase() || "fun", "favorite"],
        difficulty: 6,
        theme,
        strategy,
        weakestDomain: "speaking",
        strategyReason: "Light ending activity",
      };
    }
    return {
      type: "light_fun",
      inputType: "typing",
      question: `🎉 Finish this silly sentence about ${topic}: "If I could _____, I would _____ because _____!"`,
      modelAnswer: `If I could fly to ${topic}, I would explore everything because it would be amazing!`,
      acceptableKeywords: ["if", "would", "because", topic.split(" ")[0]?.toLowerCase() || "fun"],
      difficulty: 6,
      theme,
      strategy,
      weakestDomain: "writing",
      strategyReason: "Light ending activity",
    };
  }
  // Position 5 (0-indexed 4) — medium-easy
  return {
    type: "true_false",
    inputType: isK2 ? "recording" : "multiple_choice",
    question: `True or False: ${topic} is something you might find in a story about ${theme}. Explain why in one sentence.`,
    options: isK2 ? undefined : ["True — it fits the theme!", "False — it doesn't fit.", "True — definitely!", "False — not at all."],
    modelAnswer: `True — ${topic} fits perfectly with ${theme}!`,
    acceptableKeywords: ["true", "because", topic.split(" ")[0]?.toLowerCase() || "yes"],
    difficulty: 5,
    theme,
    strategy,
    weakestDomain: "reading",
    strategyReason: "Wind-down activity",
  };
}

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

// Position-specific format constraints
function getPositionConstraint(questionIndex: number, grade: string, theme: string): string {
  const isK2 = grade === "K-2";

  // Difficulty arc labels
  const arcLabels = [
    "Activity 1 of 6 — WARM UP (easy, heavy scaffolding, build confidence)",
    "Activity 2 of 6 — EASY-MEDIUM (moderate scaffolding)",
    "Activity 3 of 6 — MEDIUM-HARD (increasing complexity)",
    "Activity 4 of 6 — HARDEST (peak challenge, most complex task, this is the summit!)",
    "Activity 5 of 6 — WIND DOWN (medium-easy, relaxed, winding down)",
    "Activity 6 of 6 — EASY & FUN (lightest, creative, no wrong answer, end on a win!)",
  ];

  let constraint = arcLabels[questionIndex] || arcLabels[5];

  // Position 3-4: multi-scene story MUST go here if applicable (BANNED from 5 or 6)
  if (questionIndex === 2 || questionIndex === 3) {
    constraint += `\nNOTE: If generating a multi-scene story or 4-scene sequential writing task, it MUST be placed at position 3 or 4 (this one). This is the appropriate position for the heaviest cognitive load.`;
  }

  // Position 5 (second-to-last): medium-easy formats only
  if (questionIndex === 4) {
    constraint += `\n
HARD FORMAT RESTRICTION for position 5 — ONLY these formats are allowed:
- True/False with a one-sentence explanation
- "What happened first/next/last?" — one sentence each
- Match the word to its meaning — single answer
- Fill-in-one-blank sentence
NO multi-sentence writing. NO story sequencing. NO scene organization. Maximum 1-2 sentences expected from student.`;
    if (isK2) {
      constraint += `\nK-2 OVERRIDE: This MUST be a Speaking activity (not Writing). Use recording input type. Maximum 1 sentence.`;
    }
  }

  // Position 6 (last): light & fun only
  if (questionIndex === 5) {
    const lightFormats = isK2
      ? `HARD FORMAT RESTRICTION for last activity (K-2) — ONLY these are allowed:
- "Tell your animal companion one thing you learned today!" (1 sentence, recording)
- "If you were the ${theme} character today, what would you do?" (1 sentence, recording)
- "Say your favorite word from today and use it in a silly sentence!" (1 sentence, recording)
Max 1 sentence response expected. Must involve the student's animal companion.
Set inputType to "recording". This is NON-NEGOTIABLE.`
      : `HARD FORMAT RESTRICTION for last activity — ONLY these are allowed:
- "Finish this silly sentence:" (one creative sentence, no wrong answer)
- "Pick your favorite word from today and use it in one sentence"
- "Write one thing your animal/character would say right now" (1 sentence)
- Fill-in-the-blank with a fun themed sentence (single word answer)
- Emoji story: "Pick 3 emojis then write one sentence about them"
- "What would your character say right now?" (1 sentence)
This MUST feel light, fun, creative. No wrong answers. Maximum 1-2 sentences. 
Students must end the session feeling successful, not stuck.`;

    constraint += `\n${lightFormats}`;
  }

  // ABSOLUTE BAN on heavy writing for positions 5 and 6
  if (questionIndex >= 4) {
    constraint += `\n
ABSOLUTE BAN FOR POSITIONS 5-6:
- NEVER generate a 4-scene sequential story writing prompt
- NEVER generate multi-scene story organization tasks  
- NEVER ask students to write and organize multiple sentences in order
- NEVER generate any activity requiring 3+ sentences of original writing
- NEVER generate story sequencing or scene ordering tasks
- The session MUST end feeling easy and fun. Students must finish feeling successful.
If you violate this rule, the activity will be rejected and replaced with a fallback.`;
  }

  return constraint;
}

function buildPrompt(strategy: Strategy, theme: string, topic: string, questionIndex: number, grade: string, contentHistory?: any): string {
  const isK2 = grade === "K-2";
  // Override input type for K-2 last activity to recording
  let inputType = INPUT_TYPES[strategy]?.[questionIndex] || "typing";
  if (isK2 && questionIndex === 5) inputType = "recording";
  if (isK2 && questionIndex === 4) inputType = "recording";

  const k2Override = isK2 ? `
K-2 CONTENT RULES (MANDATORY):
- Maximum 8 words per sentence, simple subject-verb-object structure ONLY
- NO subordinate clauses, NO "but", "however", "which", "although", "features"
- Topics must be CONCRETE and VISUAL — things kids can see, touch, or imagine
- Maximum 3 new vocabulary words per session, single-syllable preferred
- Maximum 1 blank per sentence
- Multiple choice must have only 2-3 options (short, 1-3 words each)
- Use only Tier 1 (common everyday) vocabulary
- Keep all sentences under 8 words
- Instructions should be very simple — as if talking to a 6-year-old
- For listening activities: audio is 1-2 short sentences, then ONE question with emoji/picture choices
- For speaking activities: maximum 1 sentence, must involve the student's animal companion (Baby Chick)
- ALL answer options must be very short (1-3 words or emojis)` : "";
  const themeDirective = `CRITICAL THEME RULE: This activity is part of a session about "${topic}" (theme: "${theme}"). ALL content MUST relate directly to "${topic}" only. Before outputting, verify: "Does this activity relate to ${topic}?" — if not, regenerate.`;

  const positionConstraint = getPositionConstraint(questionIndex, grade, theme);

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
      "Read a passage then fill TWO blanks in a sentence frame. Provide a passage and a frame with two blanks. This is the HARDEST activity — make it challenging!",
      "MULTIPLE CHOICE: Provide 4 word options to complete the sentence frame. Include the options array. This is PEAK difficulty — make the distractors tricky.",
      "WIND DOWN: Medium-easy format. See FORMAT RESTRICTION below.",
      "LIGHT & FUN: See FORMAT RESTRICTION below. Keep it playful and creative!",
    ][questionIndex];

    const histCtx = buildHistoryContext(contentHistory);

    return `You are an expert ELD activity generator for grades ${grade} ELL students.

${themeDirective}
${STRICT_RULES}
${inputTypeNote}
${histCtx}

Generate a SENTENCE FRAMES activity about "${topic}".
DIFFICULTY ARC: ${positionConstraint}
Task: ${scaffolding}

STRUCTURE:
1. Include a short 3-5 sentence passage (field: "passage") specifically about "${topic}"
2. Present a sentence frame for the student to complete (unless this is a free production or light/fun activity)
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
      "RECORDING: The student records the expanded sentence with a new detail added (WHERE). This is PEAK difficulty — make the expansion challenging!",
      "MULTIPLE CHOICE: The student chooses which expansion makes the most sense from 4 options. Include the options array. PEAK difficulty — tricky distractors!",
      "WIND DOWN: Medium-easy format. See FORMAT RESTRICTION below.",
      "LIGHT & FUN: See FORMAT RESTRICTION below. Keep it playful and creative!",
    ][questionIndex];

    return `You are an expert ELD activity generator for grades ${grade} ELL students.

${themeDirective}
${STRICT_RULES}
${inputTypeNote}

Generate a SENTENCE EXPANSION activity about "${topic}".
DIFFICULTY ARC: ${positionConstraint}
Task: ${expansion}

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
    "TYPING: Provide a sentence starter ONLY (no word bank). This is PEAK difficulty — the prompt should be challenging and require critical thinking!",
    "TYPING: Include a short passage to read, then ask the student to write what happens next in 2 sentences. PEAK difficulty — complex passage!",
    "WIND DOWN: Medium-easy format. See FORMAT RESTRICTION below.",
    "LIGHT & FUN: See FORMAT RESTRICTION below. Keep it playful and creative!",
  ][questionIndex];

  return `You are an expert ELD activity generator for grades ${grade} ELL students.

${themeDirective}
${STRICT_RULES}
${inputTypeNote}

Generate a QUICK WRITES activity about "${topic}".
DIFFICULTY ARC: ${positionConstraint}
Task: ${scaffold}

RULES:
- The prompt must be clear, specific, and vivid — specifically about "${topic}"
- Ask for 2-3 sentences minimum (unless this is the LIGHT & FUN last activity — then 1-2 sentences max)
- Include an encouraging note like "Most students finish in about 2 minutes!"

Return ONLY valid JSON (no markdown):
{
  "type": "quick_write",
  "inputType": "${inputType}",${extraFields}
  "question": "<the writing prompt about ${topic}>",
  "sentenceStarter": "<sentence starter or null if open prompt>",
  "wordBank": ${questionIndex === 0 ? '["<5-6 vocabulary words about ' + topic + '>"]' : "null"},
  "modelAnswer": "<a sample response>",
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
      const isK2 = (grade || "3-5") === "K-2";
      let expectedInputType = INPUT_TYPES[strategy]?.[(questionIndex || 0)] || "typing";
      if (isK2 && (questionIndex || 0) >= 4) expectedInputType = "recording";
      activity.inputType = expectedInputType;
    }

    // HARD VALIDATION: If position 5 or 6, reject heavy activities and use fallback
    const qIdx = questionIndex || 0;
    if (qIdx >= 4 && isHeavyActivity(activity)) {
      console.warn(`Position ${qIdx + 1} had heavy activity — replacing with fallback`);
      const fallback = generateFallbackActivity(
        qIdx,
        theme || "Nature & animals",
        topic || theme || "Nature & animals",
        grade || "3-5",
        strategy
      );
      fallback.strategy = strategy;
      fallback.weakestDomain = weakestDomain;
      fallback.strategyReason = reason;
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
