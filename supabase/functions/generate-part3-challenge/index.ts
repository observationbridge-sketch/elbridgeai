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

function sanitizeMultipleChoiceOptions(question: any): void {
  if (!question || !Array.isArray(question.options) || !question.correctAnswer) return;
  const correct = question.correctAnswer.trim().toLowerCase();
  const stem = (question.question || "").trim().toLowerCase();
  const seen = new Set<string>([correct]);
  const sanitized: string[] = [];

  for (const opt of question.options) {
    const norm = opt.trim().toLowerCase();
    if (norm === correct) {
      sanitized.push(question.correctAnswer);
      continue;
    }
    // Reject if: duplicate of another option, matches correct answer, or is substring of question stem
    if (seen.has(norm) || norm === correct || (norm.length > 3 && stem.includes(norm))) {
      continue; // skip bad distractor
    }
    seen.add(norm);
    sanitized.push(opt);
  }

  // If we lost distractors, fill with generic wrong answers
  const fillers = ["None of these", "Not enough information", "All of the above", "Something else"];
  let fillerIdx = 0;
  const targetCount = question.options.length;
  while (sanitized.length < targetCount && fillerIdx < fillers.length) {
    const f = fillers[fillerIdx++];
    if (!seen.has(f.toLowerCase())) {
      seen.add(f.toLowerCase());
      sanitized.push(f);
    }
  }

  // Ensure correct answer is present and randomize its position
  if (!sanitized.includes(question.correctAnswer)) {
    sanitized[0] = question.correctAnswer;
  }
  question.options = sanitized;
}

function validateChallenge(challenge: any, challengeType: string, isK2: boolean): void {
  if (challengeType === "speed_round") {
    const expectedCount = isK2 ? 3 : 5;
    if (!Array.isArray(challenge.questions) || challenge.questions.length !== expectedCount) {
      throw new Error(`speed_round must have exactly ${expectedCount} questions, got ${challenge.questions?.length ?? 0}`);
    }
    for (const q of challenge.questions) {
      if (!Array.isArray(q.options) || !q.correctAnswer || !q.question) {
        throw new Error("Each speed_round question must have options, question, and correctAnswer");
      }
      // Strip "Listen:" or "Listen to this:" prefix from questions and audioDescriptions
      q.question = q.question.replace(/^Listen(?:\s+to\s+this)?:\s*/i, "");
      if (q.audioDescription) {
        q.audioDescription = q.audioDescription.replace(/^Listen(?:\s+to\s+this)?:\s*/i, "");
      }
    }
  } else if (challengeType === "story_builder") {
    if (!Array.isArray(challenge.scenes) || challenge.scenes.length < 3 || challenge.scenes.length > 4) {
      throw new Error(`story_builder must have 3-4 scenes, got ${challenge.scenes?.length ?? 0}`);
    }
  } else if (challengeType === "teach_it_back") {
    if (!Array.isArray(challenge.guidingQuestions) || challenge.guidingQuestions.length === 0) {
      throw new Error("teach_it_back must have guidingQuestions array");
    }
    if (!Array.isArray(challenge.vocabularyHints) || challenge.vocabularyHints.length === 0) {
      throw new Error("teach_it_back must have vocabularyHints array");
    }
  }
}

function generateFallbackChallenge(topic: string, theme: string, isK2: boolean): any {
  const questions = isK2
    ? [
        { domain: "reading", question: `What is ${topic} about?`, options: ["Something fun", "Something scary"], correctAnswer: "Something fun" },
        { domain: "reading", question: `Where can you find ${topic}?`, options: ["Outside", "In a box"], correctAnswer: "Outside" },
        { domain: "listening", audioDescription: `${topic} is very interesting. Many people like to learn about ${topic}.`, question: `Do people like ${topic}?`, options: ["Yes", "No"], correctAnswer: "Yes" },
      ]
    : [
        { domain: "reading", passage: `${topic} is a fascinating subject. Many students enjoy learning about it because it connects to the world around us.`, question: `Why do students enjoy learning about ${topic}?`, options: ["It connects to the world", "It is boring", "It is too hard", "It is only for adults"], correctAnswer: "It connects to the world" },
        { domain: "reading", passage: `Learning about ${topic} helps us understand ${theme} better. There are many interesting facts to discover.`, question: `What does learning about ${topic} help us understand?`, options: [`${theme}`, "Nothing", "Only math", "Only science"], correctAnswer: `${theme}` },
        { domain: "listening", audioDescription: `${topic} is something you can explore every day. The more you learn, the more interesting it gets!`, question: "What happens the more you learn?", options: ["It gets more interesting", "It gets boring", "It disappears", "It stops"], correctAnswer: "It gets more interesting" },
        { domain: "speaking", question: `What is one thing you learned about ${topic} today?`, options: ["I learned something new", "I learned nothing", "I forgot everything", "I didn't listen"], correctAnswer: "I learned something new" },
        { domain: "writing", question: `Complete this sentence: The best thing about ${topic} is _____.`, options: ["how interesting it is", "nothing at all", "that it is boring", "that it ended"], correctAnswer: "how interesting it is" },
      ];

  return {
    challengeType: "speed_round",
    title: "Speed Round",
    instruction: `Answer ${questions.length} quick questions about ${topic}! How fast can you go?`,
    questions,
    theme,
    topic,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { grade, theme, topic, forceType, contentHistory, weakestDomain } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const isK2 = grade === "K-2";
    
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
      const sceneCount = contentHistory?.belowGradeLevel ? 3 : 4;
      const sceneTemplates = Array.from({ length: sceneCount }, (_, i) => {
        const labels = ["opening the story", "continuing the story", "building tension", "with resolution"];
        return `    "<Scene ${i + 1}: vivid 1-2 sentence description ${labels[i] || 'continuing'} about ${topic}>"`;
      }).join(",\n");

      systemPrompt = `You are an expert ELD activity generator for grades ${grade} ELL students.

${themeDirective}
${STRICT_RULES}

Generate a STORY BUILDER challenge. The student will write a mini story connecting ${sceneCount} vivid scene descriptions.

Create exactly ${sceneCount} short scene descriptions (1-2 sentences each) that form a logical sequence about "${topic}". Describe vivid scenes in words — do NOT reference any pictures or images.

Return ONLY valid JSON (no markdown):
{
  "challengeType": "story_builder",
  "title": "Story Builder",
  "instruction": "Look at these ${sceneCount} scenes. Record yourself telling the story in 2-3 sentences! Use words like: first, then, finally.",
  "sceneCount": ${sceneCount},
  "scenes": [
${sceneTemplates}
  ],
  "sentenceStarter": "It all began when...",
  "acceptableKeywords": ["<8-10 keywords related to ${topic} and sequence words>"],
  "sequenceWords": ["first", "then", "next", "finally", "after", "before"],
  "theme": "${theme}",
  "topic": "${topic}"
}`;
    } else if (challengeType === "speed_round") {
      const questionCount = isK2 ? 3 : 5;
      const optionCount = isK2 ? 2 : 4;
      const optionPlaceholders = isK2
        ? `"options": ["<option A>", "<option B>"]`
        : `"options": ["<option A>", "<option B>", "<option C>", "<option D>"]`;

      // Domain mix based on weakest domain for 3-5
      let domainMixInstruction: string;
      if (isK2) {
        domainMixInstruction = "Generate exactly 3 questions: 2 reading + 1 listening.";
      } else {
        const weak = (weakestDomain || "").toLowerCase();
        if (weak === "writing") {
          domainMixInstruction = "Generate exactly 5 questions with this domain mix: 2 writing (sentence completion) + 1 reading (with passage) + 1 listening (with audioDescription) + 1 speaking.";
        } else if (weak === "speaking") {
          domainMixInstruction = "Generate exactly 5 questions with this domain mix: 2 speaking (open-ended prompts) + 1 reading (with passage) + 1 listening (with audioDescription) + 1 writing.";
        } else if (weak === "listening") {
          domainMixInstruction = "Generate exactly 5 questions with this domain mix: 2 listening (with audioDescription) + 1 reading (with passage) + 1 speaking + 1 writing.";
        } else if (weak === "reading") {
          domainMixInstruction = "Generate exactly 5 questions with this domain mix: 2 reading (with passage each) + 1 listening (with audioDescription) + 1 speaking + 1 writing.";
        } else {
          domainMixInstruction = "Generate exactly 5 questions: 2 reading (with passage each) + 1 listening (with audioDescription) + 1 speaking + 1 writing.";
        }
      }

      systemPrompt = `You are an expert ELD activity generator for grades ${grade} ELL students.

${themeDirective}
${STRICT_RULES}

Generate a SPEED ROUND challenge with exactly ${questionCount} multiple-choice questions about "${topic}".
${isK2 ? `K-2 RULES: 
- Each question must have exactly ${optionCount} options only (NOT 4).
- Use simple Tier 1 vocabulary. Short sentences under 10 words.` : ""}
${domainMixInstruction}

Each question must have exactly ${optionCount} options with one clearly correct answer.
Do NOT reference any images, pictures, or visuals.
Do NOT prefix questions or audioDescriptions with "Listen:", "Listen to this:", or any similar label — start directly with the content.
Each question MUST include a "domain" field with one of: "reading", "listening", "speaking", "writing".

WRITING DOMAIN RULES (CRITICAL):
- Writing questions must ALWAYS be multiple choice like every other domain — NEVER ask the student to write or compose anything.
- Use one of these formats:
  1. Sentence completion: "Which word best completes this sentence: The ___ plates shifted underground?" with word options
  2. Correct usage: "Which sentence uses the word 'tectonic' correctly?" with sentence options
  3. Grammar/mechanics: "Which sentence is written correctly?" with sentence options
- The options must be clearly distinguishable — one obviously correct, the rest clearly wrong.
- NEVER use options like "Write only one word", "Write about...", or any instruction as an option.

CRITICAL: The correct answer must NOT always be the first option. Randomly vary which position (A, B, C, or D) contains the correct answer across all ${questionCount} questions. Never put the correct answer in position A more than twice out of ${questionCount} questions.

SELF-CHECK (mandatory before outputting):
1. Are all ${optionCount} options unique (case-insensitive)? No two options may have the same text.
2. Does any distractor match the correctAnswer? If yes, replace it.
3. Is any distractor a substring of the question text? If yes, replace it.
4. Are all options clearly distinct from each other? If not, regenerate.

Return ONLY valid JSON (no markdown):
{
  "challengeType": "speed_round",
  "title": "Speed Round",
  "instruction": "Answer ${questionCount} quick questions about ${topic}! How fast can you go?",
  "questions": [
    {
      "domain": "<domain>",
      ${isK2 ? "" : `"passage": "<2-3 sentence passage if reading domain, omit otherwise>",
      "audioDescription": "<2-3 sentence story if listening domain, omit otherwise>",
      `}"question": "<the question>",
      ${optionPlaceholders},
      "correctAnswer": "<exact text of correct option>"
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

Provide helpful vocabulary words and 3 progressive guiding questions:
1. Basic recall: "What is ${topic}?" — ask specifically what ${topic} is or means
2. Interpretation: "Why is ${topic} important?" — ask why it matters or what makes it interesting  
3. Personal connection: "How does ${topic} connect to your life?" — ask how the student relates to it

Do NOT use generic placeholders. Each question must mention "${topic}" by name. Do NOT reference any images, pictures, or visuals.

Return ONLY valid JSON (no markdown):
{
  "challengeType": "teach_it_back",
  "title": "Teach It Back",
  "instruction": "You just learned about ${topic}. Now teach it to someone else! Record yourself explaining the topic in your own words for at least 30 seconds.",
  "guidingQuestions": [
    "What is ${topic}?",
    "Why is ${topic} important or interesting?",
    "How does ${topic} connect to something in your own life?"
  ],
  "vocabularyHints": ["<6-8 key vocabulary words from the session about ${topic}>"],
  "acceptableKeywords": ["<8-10 keywords for scoring relevance>"],
  "theme": "${theme}",
  "topic": "${topic}"
}`;
    }

    let challenge: any = null;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const userMessage = `${systemPrompt}\n\nGenerate a ${challengeType.replace(/_/g, " ")} challenge about "${topic}" for grades ${grade}. Make it fun and engaging!`;

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
        const content = data.content?.[0]?.text;

        if (!content || typeof content !== "string") {
          throw new Error("Empty AI response content");
        }

        challenge = extractJsonFromAiResponse(content);
        validateChallenge(challenge, challengeType, isK2);
        // Sanitize all multiple choice options in speed_round
        if (challengeType === "speed_round" && Array.isArray(challenge.questions)) {
          for (const q of challenge.questions) {
            sanitizeMultipleChoiceOptions(q);
          }
        }
        challenge.challengeType = challengeType;
        break; // Success
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`generate-part3-challenge attempt ${attempt + 1} failed:`, lastError.message);
      }
    }

    if (!challenge) {
      // All retries failed — return fallback
      console.warn("All retries failed, returning fallback challenge");
      challenge = generateFallbackChallenge(
        topic || theme || "our topic",
        theme || "Nature & animals",
        isK2
      );
    }

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
