ElbridgeAI - K-12 English Language Learning platform for teachers and students (grades 3-5)

## Design System
- Primary: ocean blue (210 80% 45%)
- Accent: teal (170 55% 40%)
- Success: green (145 60% 40%)
- Warning: amber (38 90% 55%)
- Radius: 0.75rem
- Button variants: hero (gradient), heroOutline, success

## Architecture
- Teachers: auth via Supabase, dashboard with session codes
- Students: anon access, join via 6-char code + first name
- AI: Lovable AI (gemini-3-flash-preview) generates activities per domain
- Domains: Reading, Writing, Speaking, Listening
- WIDA levels: Entering, Emerging, Developing, Expanding, Bridging
- TTS: Best-voice selection (Google > cloud en-US > local en-US)

## Session Structure (Two Parts)
### Part 1 — Daily Language Builder (5 steps, 1 anchor sentence)
- Step 1: Listen (TTS auto-play, replay button, "I heard it")
- Step 2: Repeat (mic input, flexible word matching with Levenshtein)
- Step 3: Write (type from memory, sentence hidden, compare after)
- Step 4: Record (mic input again, fluency evaluation)
- Step 5: AI Feedback (summary card, badge, strengths/practice)
- Anchor sentences from: academic frames, compare/contrast, descriptive, vocab, character dev
- Feeds into Speaking + Writing domain scores

### Part 2 — Free Domain Practice (8 questions)
- 2 per domain: Reading → Listening → Speaking → Writing (repeat)
- Difficulty: Entering (Q1-2) → Emerging (Q3-4) → Developing (Q5-6) → Expanding (Q7-8)
- Theme matches anchor sentence from Part 1
- Flexible grading: acceptableKeywords, effort-based credit (3+ words)

### Total = 13 steps, ~15-30 minutes, progress bar across both parts

## Database Tables
- sessions (teacher_id, code, status)
- session_students (session_id, student_name)
- student_responses (session_id, student_id, domain, question, answers, is_correct, wida_level)
- teacher_preferences (teacher_id, weekly_email_opt_out)

## Edge Functions
- generate-anchor-sentence: AI anchor sentence for Part 1 (verify_jwt=false)
- generate-activity: AI activity generation for Part 2, 8 questions (verify_jwt=false)
- send-weekly-report: Weekly email via Resend (verify_jwt=false)

## Email
- Resend from reports@elbridgeai.com
- Cron: Monday 13:00 UTC (weekly-email-report)
- Secret: RESEND_API_KEY
