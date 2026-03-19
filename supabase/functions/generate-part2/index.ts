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

IMPORTANT SESSION DIFFICULTY CURVE:
Activity 1: Easy (warm up) → Activity 2: Easy-Medium → Activity 3: Medium-Hard → Activity 4: HARDEST (peak) → Activity 5: Medium-Easy (wind down) → Activity 6: Easy and fun (end on a win)
Students MUST always finish a session feeling successful, not stuck.
`;

// ===== HARDCODED 3-5 ACTIVITY SEQUENCE =====
// Position 1: sentence_frame, typing
// Position 2: say_and_expand, recording
// Position 3: multiple_choice, tap
// Position 4: sentence_expansion, recording
// Position 5: quick_write (1-2 sentences max), typing
// Position 6: share_your_thoughts, recording
const GRADES_3_5_SEQUENCE = [
  { type: "sentence_frame", inputType: "typing" },
  { type: "say_and_expand", inputType: "recording" },
  { type: "multiple_choice", inputType: "tap" },
  { type: "sentence_expansion", inputType: "recording" },
  { type: "quick_write", inputType: "typing" },
  { type: "share_your_thoughts", inputType: "recording" },
];

// K-2 sequence: keep existing strategy-based approach but enforce at least 2 recordings
// Positions 5 and 6 are always recording for K-2 (existing behavior), plus position 2
const K2_INPUT_TYPES = ["typing", "recording", "typing", "recording", "recording", "recording"];

function getOptionCount(questionIndex: number, isK2: boolean): number {
  if (isK2) return 2;
  if (questionIndex <= 1) return 2;
  if (questionIndex <= 3) return 4;
  return 2;
}

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
  const sentenceMatch = (activity.question || "").match(/write\s+(\d+)\s+sentence/i);
  if (sentenceMatch && parseInt(sentenceMatch[1]) >= 3) return true;
  if ((activity.scenes && activity.scenes.length >= 3)) return true;
  return false;
}

function generateFallbackActivity(position: number, theme: string, topic: string, grade: string): any {
  const isK2 = grade === "K-2";
  if (position === 5) {
    if (isK2) {
      return {
        type: "talk_to_companion",
        inputType: "recording",
        question: `Tell your animal companion: "My favorite thing about ${topic} is ___!" Say it out loud! 🎤`,
        modelAnswer: `My favorite thing about ${topic} is how fun it is!`,
        acceptableKeywords: [topic.split(" ")[0]?.toLowerCase() || "fun", "favorite"],
        difficulty: 6,
        theme,
      };
    }
    return {
      type: "share_your_thoughts",
      inputType: "recording",
      question: `What do YOU think about ${topic}? Share your thoughts! 🎤\n\nTry using: ${topic.split(" ")[0]?.toLowerCase() || "interesting"}, learned, amazing`,
      helpWords: [topic.split(" ")[0]?.toLowerCase() || "interesting", "learned", "amazing"],
      modelAnswer: `I think ${topic} is really interesting because there's so much to explore!`,
      acceptableKeywords: ["think", "about", topic.split(" ")[0]?.toLowerCase() || "interesting"],
      difficulty: 6,
      theme,
    };
  }
  // Position 5 (0-indexed 4) — quick_write wind-down
  return {
    type: "quick_write",
    inputType: isK2 ? "recording" : "typing",
    question: `Write one sentence about your favorite part of ${topic}. Keep it short and fun! ✨`,
    modelAnswer: `My favorite part of ${topic} is how amazing it is!`,
    acceptableKeywords: ["favorite", topic.split(" ")[0]?.toLowerCase() || "fun"],
    difficulty: 5,
    theme,
  };
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

function extractJsonFromAiResponse(rawContent: string): any {
  const cleaned = rawContent
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const arrayStart = cleaned.indexOf("[");
  const objectStart = cleaned.indexOf("{");
  const startCandidates = [arrayStart, objectStart].filter((v) => v >= 0);
  const jsonStart = startCandidates.length > 0 ? Math.min(...startCandidates) : -1;

  if (jsonStart === -1) {
    throw new Error("No JSON payload found in AI response");
  }

  const startsWithArray = cleaned[jsonStart] === "[";
  const jsonEnd = startsWithArray ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
  if (jsonEnd === -1 || jsonEnd < jsonStart) {
    throw new Error("JSON payload appears truncated");
  }

  const candidate = cleaned.slice(jsonStart, jsonEnd + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    const repaired = candidate
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[\x00-\x1F\x7F]/g, "");
    return JSON.parse(repaired);
  }
}

function isValidFillInBlankSchema(value: any): boolean {
  if (!value || typeof value !== "object") return false;
  if (typeof value.sentence !== "string" || !value.sentence.trim()) return false;
  if (!Array.isArray(value.blanks)) return false;
  if (!Array.isArray(value.answers) || value.answers.length === 0) return false;
  if (!Array.isArray(value.wordBank) || value.wordBank.length === 0) return false;
  return true;
}

function normalizeSentenceFrameActivity(activity: any): any {
  if (!activity || typeof activity !== "object") return activity;

  const fillInBlank = activity.fillInBlank || (isValidFillInBlankSchema(activity) ? activity : null);
  if (!fillInBlank || !isValidFillInBlankSchema(fillInBlank)) {
    if (activity.sentenceFrame && activity.wordBank?.length > 0) {
      const answers = activity.acceptableKeywords?.slice(0, 1) || [activity.wordBank[0]];
      activity.fillInBlank = {
        sentence: activity.sentenceFrame,
        blanks: ["blank"],
        answers,
        wordBank: activity.wordBank,
      };
      return activity;
    }
    return activity;
  }

  const sentenceFrame = fillInBlank.sentence;

  return {
    ...activity,
    type: activity.type || "sentence_frame",
    question: activity.question || `Fill in the blanks: ${sentenceFrame}`,
    sentenceFrame: activity.sentenceFrame || sentenceFrame,
    wordBank: Array.isArray(activity.wordBank) && activity.wordBank.length > 0
      ? activity.wordBank
      : fillInBlank.wordBank,
    modelAnswer: activity.modelAnswer || fillInBlank.answers.join(" "),
    acceptableKeywords: Array.isArray(activity.acceptableKeywords) && activity.acceptableKeywords.length > 0
      ? activity.acceptableKeywords
      : fillInBlank.answers,
    fillInBlank: {
      sentence: sentenceFrame,
      blanks: fillInBlank.blanks,
      answers: fillInBlank.answers,
      wordBank: fillInBlank.wordBank,
    },
  };
}

// Difficulty arc labels
const ARC_LABELS = [
  "Activity 1 of 6 — WARM UP (easy, heavy scaffolding, build confidence)",
  "Activity 2 of 6 — EASY-MEDIUM (moderate scaffolding)",
  "Activity 3 of 6 — MEDIUM-HARD (increasing complexity)",
  "Activity 4 of 6 — HARDEST (peak challenge, most complex task)",
  "Activity 5 of 6 — WIND DOWN (medium-easy, relaxed)",
  "Activity 6 of 6 — EASY & FUN (lightest, creative, end on a win!)",
];

function buildPrompt35(questionIndex: number, theme: string, topic: string, contentHistory?: any): string {
  const pos = GRADES_3_5_SEQUENCE[questionIndex];
  const arcLabel = ARC_LABELS[questionIndex];
  const histCtx = buildHistoryContext(contentHistory);

  const inputDesc = pos.inputType === "typing" ? "The student will TYPE their answer in a text field."
    : pos.inputType === "recording" ? "The student will RECORD themselves speaking. 'modelAnswer' is what they should say.\nSPEAKING QUALITY RULE: The student must produce at least one complete sentence. acceptableKeywords must include at least 3 content words."
    : pos.inputType === "tap" ? "The student will TAP/SELECT from multiple choice options. You MUST include an 'options' array with exactly 4 choices. 'modelAnswer' must exactly match one option text."
    : "";

  const themeDirective = `CRITICAL THEME RULE: ALL content MUST relate directly to "${topic}" (theme: "${theme}"). Before outputting, verify: "Does this activity relate to ${topic}?"`;

  // Position-specific prompts
  if (questionIndex === 0) {
    // Position 1: sentence_frame, typing
    return `You are an expert ELD activity generator for grades 3-5 ELL students.

${themeDirective}
${STRICT_RULES}
${histCtx}

DIFFICULTY ARC: ${arcLabel}
INPUT FORMAT: "typing" — ${inputDesc}

Generate a SENTENCE FRAME activity about "${topic}".
This is the warm-up — easy, with heavy scaffolding.

STRUCTURE:
1. Include a short 3-5 sentence passage (field: "passage") about "${topic}" — MAXIMUM 60 WORDS
2. Present a sentence frame with 1 blank marked as ___
3. Include a "wordBank" array with 4-6 key vocabulary words from the passage
4. Include a fillInBlank object: { "sentence": string, "blanks": array, "answers": string[], "wordBank": string[] }

FILL-IN-THE-BLANK RULES:
- The sentence MUST make grammatical sense when correct words are inserted
- Clear context clues so the student can guess the answer
- Maximum 1 blank for this warm-up position

Return ONLY valid JSON:
{
  "type": "sentence_frame",
  "inputType": "typing",
  "passage": "<3-5 sentence passage about ${topic}, MAX 60 words>",
  "question": "<instruction + sentence frame with ___ blank>",
  "sentenceFrame": "<just the frame with ___ blank>",
  "wordBank": ["<4-6 vocabulary words>"],
  "fillInBlank": { "sentence": "<sentence with ___>", "blanks": ["<blank info>"], "answers": ["<correct word>"], "wordBank": ["<word choices>"] },
  "modelAnswer": "<completed sentence>",
  "acceptableKeywords": ["<6-8 words>"],
  "difficulty": 1,
  "theme": "${theme}"
}`;
  }

  if (questionIndex === 1) {
    // Position 2: say_and_expand, recording
    return `You are an expert ELD activity generator for grades 3-5 ELL students.

${themeDirective}
${STRICT_RULES}
${histCtx}

DIFFICULTY ARC: ${arcLabel}
INPUT FORMAT: "recording" — ${inputDesc}

Generate a SAY AND EXPAND activity about "${topic}".
Give the student a base sentence about "${topic}" and ask them to SAY it out loud, then EXPAND it by adding more detail (where, when, why, or how).

Example: Base: "The bird flies." → Student says: "The colorful bird flies high above the tall trees in the morning."

STRUCTURE:
- Provide a simple base sentence (4-8 words)
- Ask the student to record themselves saying an expanded version
- The expansion should add 1-2 details

Return ONLY valid JSON:
{
  "type": "say_and_expand",
  "inputType": "recording",
  "baseSentence": "<simple base sentence about ${topic}>",
  "question": "<instruction telling student to say the sentence and expand it>",
  "expansionHint": "<what to add: where/when/why/how>",
  "modelAnswer": "<example expanded sentence>",
  "acceptableKeywords": ["<5-8 content words>"],
  "difficulty": 2,
  "theme": "${theme}"
}`;
  }

  if (questionIndex === 2) {
    // Position 3: multiple_choice, tap
    return `You are an expert ELD activity generator for grades 3-5 ELL students.

${themeDirective}
${STRICT_RULES}
${histCtx}

DIFFICULTY ARC: ${arcLabel}
INPUT FORMAT: "tap" — ${inputDesc}

Generate a MULTIPLE CHOICE activity about "${topic}".
This is medium-hard difficulty. Include a short passage or context, then ask a comprehension or vocabulary question with 4 options. Make distractors plausible but clearly wrong.

Return ONLY valid JSON:
{
  "type": "multiple_choice",
  "inputType": "tap",
  "passage": "<optional 2-4 sentence context about ${topic}>",
  "question": "<the question>",
  "options": ["<option A>", "<option B>", "<option C>", "<option D>"],
  "modelAnswer": "<the correct option text, must exactly match one option>",
  "acceptableKeywords": ["<3-5 key words>"],
  "difficulty": 3,
  "theme": "${theme}"
}`;
  }

  if (questionIndex === 3) {
    // Position 4: sentence_expansion, recording — PEAK difficulty
    return `You are an expert ELD activity generator for grades 3-5 ELL students.

${themeDirective}
${STRICT_RULES}
${histCtx}

DIFFICULTY ARC: ${arcLabel}
INPUT FORMAT: "recording" — ${inputDesc}

Generate a SENTENCE EXPANSION activity about "${topic}".
This is PEAK difficulty — the hardest activity in the session.
Give the student a base sentence and ask them to record an expanded version that adds multiple details (where + when, or how + why). The expansion should require critical thinking.

Return ONLY valid JSON:
{
  "type": "sentence_expansion",
  "inputType": "recording",
  "baseSentence": "<base sentence about ${topic}>",
  "question": "<instruction to expand with multiple details>",
  "expansionHint": "<what details to add>",
  "modelAnswer": "<fully expanded sentence with multiple details>",
  "acceptableKeywords": ["<5-8 content words>"],
  "difficulty": 4,
  "theme": "${theme}"
}`;
  }

  if (questionIndex === 4) {
    // Position 5: quick_write (1-2 sentences max), typing — wind down
    return `You are an expert ELD activity generator for grades 3-5 ELL students.

${themeDirective}
${STRICT_RULES}
${histCtx}

DIFFICULTY ARC: ${arcLabel}
INPUT FORMAT: "typing" — ${inputDesc}

Generate a QUICK WRITE activity about "${topic}".
This is the wind-down — medium-easy. The student writes only 1-2 sentences MAX.
Give a fun, low-pressure prompt. No multi-paragraph writing. Keep it light.

HARD RULE: Maximum 1-2 sentences expected. Do NOT ask for 3+ sentences.
IMPORTANT: This must be a PERSONAL OPINION or PREFERENCE question — ask the student what they would choose, prefer, or like about ${topic}. Example: "If you could have one power from ${topic}, what would it be?"
Do NOT ask about real life connections — that comes next.

Return ONLY valid JSON:
{
  "type": "quick_write",
  "inputType": "typing",
  "question": "<fun writing prompt about ${topic}, 1-2 sentences only>",
  "sentenceStarter": "<optional sentence starter or null>",
  "wordBank": null,
  "modelAnswer": "<1-2 sentence sample response>",
  "acceptableKeywords": ["<5-8 words>"],
  "difficulty": 5,
  "theme": "${theme}"
}`;
  }

  // Position 6: share_your_thoughts, recording — light & fun
  // Rotate between 3 prompt frames
  const promptFrames = [
    `"What do YOU think about ${topic}?"`,
    `"Have you ever seen something like this in real life?"`,
    `"Tell a friend something interesting about ${topic}"`,
  ];
  const selectedFrame = promptFrames[qIdx % promptFrames.length];

  return `You are an expert ELD activity generator for grades 3-5 ELL students.

${themeDirective}
${STRICT_RULES}
${histCtx}

DIFFICULTY ARC: ${arcLabel}
INPUT FORMAT: "recording" — ${inputDesc}

Generate a SHARE YOUR THOUGHTS activity about "${topic}".
This is the final activity — light, fun, creative, open-ended. No wrong answers. Maximum 1-2 sentences.
The student must end the session feeling successful and happy.

Use this prompt frame as inspiration (adapt it naturally): ${selectedFrame}

IMPORTANT: This must be a REAL LIFE CONNECTION question — ask the student where they have seen something like this in their own life, or when they have felt or done something similar. Do NOT repeat preference or opinion questions — that was already covered in position 5. Example: "Have you ever seen something like this in real life? Tell us about it."
- Do NOT mention any animal companion, pet, or mascot
- Frame it as the student sharing their own thoughts
- Always include a "helpWords" array with 2-3 vocabulary words from the lesson (e.g., ["brave", "strong", "protect"])
- Add a line like "Try using: brave, strong, protect" in the question text

Return ONLY valid JSON:
{
  "type": "share_your_thoughts",
  "inputType": "recording",
  "question": "<open-ended prompt about ${topic} — no companion references>",
  "helpWords": ["<2-3 vocabulary words from the lesson>"],
  "modelAnswer": "<example 1-2 sentence response>",
  "acceptableKeywords": ["<3-5 content words>"],
  "difficulty": 6,
  "theme": "${theme}"
}`;
}

// K-2 prompt builder (keeps existing strategy-based approach with enforced recording positions)
function buildPromptK2(questionIndex: number, theme: string, topic: string, contentHistory?: any, sentenceFrameTier?: number): string {
  const tier = sentenceFrameTier || 1;
  const inputType = K2_INPUT_TYPES[questionIndex] || "typing";
  const arcLabel = ARC_LABELS[questionIndex];
  const histCtx = buildHistoryContext(contentHistory);

  const inputDesc = inputType === "typing" ? "The student will TYPE their answer."
    : "The student will RECORD themselves speaking. acceptableKeywords must include at least 3 content words.";

  const themeDirective = `CRITICAL THEME RULE: ALL content MUST relate directly to "${topic}" (theme: "${theme}").`;

  const k2Rules = `
K-2 CONTENT RULES (MANDATORY):
- Maximum 8 words per sentence, simple subject-verb-object structure ONLY
- NO subordinate clauses, NO "but", "however", "which", "although", "when", "because", "features"
- NEVER use "because", "although", "when", or any subordinate clause connector — BANNED in K-2
- Topics must be CONCRETE and VISUAL — things kids can see, touch, or imagine
- ALL vocabulary words must have a MAXIMUM of 2 syllables — NO exceptions
- Maximum 3 new vocabulary words per session
- Multiple choice must have only 2-3 options (short, 1-3 words each)
- Use only Tier 1 (common everyday) vocabulary
- Keep all sentences under 8 words
- Instructions should be very simple — as if talking to a 6-year-old
- For speaking activities: maximum 1 sentence, must involve the student's animal companion (Baby Chick)

ADAPTIVE DIFFICULTY TIER (current: Tier ${tier}):
${tier === 1 ? "- Tier 1: Maximum 4 words per sentence, exactly 1 blank, exactly 2 word choices" : ""}${tier === 2 ? "- Tier 2: Maximum 6 words per sentence, exactly 2 blanks, exactly 3 word choices" : ""}${tier === 3 ? "- Tier 3: Maximum 8 words per sentence, exactly 3 blanks, exactly 4 word choices" : ""}`;

  // For K-2, use sentence_frames for typing positions, speaking for recording positions
  if (inputType === "recording") {
    // Speaking activity for K-2
    const isLastTwo = questionIndex >= 4;
    return `You are an expert ELD activity generator for grades K-2 ELL students.

${themeDirective}
${STRICT_RULES}
${k2Rules}
${histCtx}

DIFFICULTY ARC: ${arcLabel}
INPUT FORMAT: "recording" — ${inputDesc}

Generate a SPEAKING activity about "${topic}" for K-2 students.
The student records themselves saying one sentence. Must involve their animal companion (Baby Chick).
${isLastTwo ? "This must be LIGHT and FUN. No wrong answers. End on a win!" : ""}

Return ONLY valid JSON:
{
  "type": "${isLastTwo ? "talk_to_companion" : "say_and_expand"}",
  "inputType": "recording",
  "question": "<simple instruction involving Baby Chick and ${topic}>",
  ${!isLastTwo ? '"baseSentence": "<simple 4-6 word sentence to repeat/expand>",' : ""}
  "modelAnswer": "<example 1 sentence response>",
  "acceptableKeywords": ["<3-5 simple words>"],
  "difficulty": ${questionIndex + 1},
  "theme": "${theme}"
}`;
  }

  // Typing activity (sentence_frames) for K-2
  return `You are an expert ELD activity generator for grades K-2 ELL students.

${themeDirective}
${STRICT_RULES}
${k2Rules}
${histCtx}

DIFFICULTY ARC: ${arcLabel}
INPUT FORMAT: "typing" — ${inputDesc}

Generate a SENTENCE FRAME activity about "${topic}" for K-2 students.
Do NOT include a reading passage — omit the "passage" field entirely or set it to null.
Show ONLY the fill-in-the-blank sentence directly.
ALL words must be max 2 syllables.
Include a "wordBank" array with correct answer word(s) PLUS 1-2 distractor single words (tappable tiles).

Include a fillInBlank object: { "sentence": string, "blanks": array, "answers": string[], "wordBank": string[] }

Return ONLY valid JSON:
{
  "type": "sentence_frame",
  "inputType": "typing",
  "passage": null,
  "question": "Tap a word to finish the sentence.",
  "sentenceFrame": "<sentence with ___ blanks>",
  "wordBank": ["<correct + distractor words, max 2 syllables>"],
  "fillInBlank": { "sentence": "<sentence with ___>", "blanks": ["<blank info>"], "answers": ["<correct words>"], "wordBank": ["<same words>"] },
  "modelAnswer": "<completed sentence>",
  "acceptableKeywords": ["<3-5 simple words>"],
  "difficulty": ${questionIndex + 1},
  "theme": "${theme}"
}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { grade, theme, topic, domainScores, questionIndex, contentHistory, sentenceFrameTier } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const isK2 = (grade || "3-5") === "K-2";
    const qIdx = questionIndex || 0;
    const effectiveTopic = topic || theme || "Nature & animals";
    const effectiveTheme = theme || "Nature & animals";

    // Determine expected type and inputType based on grade band
    const expectedType = isK2 ? undefined : GRADES_3_5_SEQUENCE[qIdx]?.type;
    const expectedInputType = isK2 ? K2_INPUT_TYPES[qIdx] : GRADES_3_5_SEQUENCE[qIdx]?.inputType;

    console.log(`[generate-part2] Position ${qIdx + 1}, grade: ${grade}, type: ${expectedType}, inputType: ${expectedInputType}`);

    // Build prompt based on grade band
    const prompt = isK2
      ? buildPromptK2(qIdx, effectiveTheme, effectiveTopic, contentHistory, sentenceFrameTier)
      : buildPrompt35(qIdx, effectiveTheme, effectiveTopic, contentHistory);

    const userMessage = `${prompt}\n\nGenerate activity ${qIdx + 1} of 6 about "${effectiveTopic}". Make it engaging and grade-appropriate.`;

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
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data?.content?.[0]?.text;

    if (!content || typeof content !== "string") {
      console.error("Empty AI response content", { questionIndex: qIdx });
      throw new Error("Empty AI response content");
    }

    let activity;
    try {
      activity = extractJsonFromAiResponse(content);
    } catch (parseError) {
      console.error("Failed to parse AI JSON", { parseError, content });
      throw new Error("Invalid AI response format");
    }

    // Normalize sentence_frame activities
    if (expectedType === "sentence_frame" || activity.type === "sentence_frame") {
      activity = normalizeSentenceFrameActivity(activity);

      const fillPayload = activity.fillInBlank || activity;
      if (!isValidFillInBlankSchema(fillPayload)) {
        console.error("Invalid fill-in schema", { questionIndex: qIdx, activity });
        throw new Error("Missing required fill-in fields");
      }
    }

    // FORCE correct type and inputType for 3-5
    if (!isK2 && expectedType) {
      activity.type = expectedType;
      activity.inputType = expectedInputType;
    }
    // FORCE correct inputType for K-2
    if (isK2 && expectedInputType) {
      activity.inputType = expectedInputType;
    }

    // Add metadata
    activity.strategy = activity.type;
    activity.weakestDomain = domainScores ? Object.entries(domainScores).sort(([,a]: any, [,b]: any) => a - b)[0]?.[0] || "none" : "none";
    activity.strategyReason = `Position ${qIdx + 1}: ${activity.type} (${activity.inputType})`;

    // HARD VALIDATION: reject heavy activities at positions 5-6
    if (qIdx >= 4 && isHeavyActivity(activity)) {
      console.warn(`Position ${qIdx + 1} had heavy activity — replacing with fallback`);
      const fallback = generateFallbackActivity(qIdx, effectiveTheme, effectiveTopic, grade || "3-5");
      fallback.strategy = fallback.type;
      fallback.weakestDomain = activity.weakestDomain;
      fallback.strategyReason = `Position ${qIdx + 1}: fallback`;
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
