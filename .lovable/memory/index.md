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
- AI: Lovable AI (gemini-3-flash-preview) generates activities
- Domains: Reading, Writing, Speaking, Listening
- WIDA levels: Entering, Emerging, Developing, Expanding, Bridging
- TTS: Best-voice selection (Google > cloud en-US > local en-US)

## Session Structure (Two Parts)
### Part 1 — Daily Language Builder (5 steps, 1 anchor sentence, Literacy Squared)
- Step 1: Listen (TTS auto-play, replay, "I heard it")
- Step 2: Repeat (mic input, flexible Levenshtein matching)
- Step 3: Write (type from memory, hidden sentence, compare after)
- Step 4: Record (mic input, fluency evaluation)
- Step 5: AI Feedback (summary card, badge, strengths/practice)
- Anchor categories: academic frames, compare/contrast, descriptive, vocab, character dev
- Feeds into Speaking + Writing domain scores

### Part 2 — Adaptive Strategy Practice (3 questions)
- AI analyzes student history across domains, selects weakest
- Strategy selection: Reading/Listening → Sentence Frames, Speaking → Sentence Expansion, Writing → Quick Writes
- First session defaults to Sentence Frames
- Strategy 1 (Sentence Frames): passage + frame with blanks, progressive (1 blank → 2 → full sentence)
- Strategy 2 (Sentence Expansion): base sentence → add detail → add reason, mic input
- Strategy 3 (Quick Writes): prompt + starter + word bank → starter only → open prompt
- All 3 questions connected to Part 1 anchor theme
- Flexible scoring with acceptableKeywords + effort-based credit

### Total = 8 steps (5+3), ~15-20 minutes, progress bar across both parts

## Gamification System
- Points: Step1=2, Step2-4=5 each, Part1Complete=10, Part2Activity=5 each, SessionComplete=15, Domain80%=5
- Animal Evolution: 🐣 Baby Chick (0-50) → 🐢 Little Turtle (51-150) → 🦊 Clever Fox (151-300) → 🦅 Soaring Eagle (301-500) → 🐬 Ocean Dolphin (501-800) → 🦋 Language Butterfly (801+)
- Badges: First Steps (first_word, first_voice, first_writer), Consistency (streak_3, streak_7, sessions_10), Skill (sentence_master, story_reader, word_weaver, super_listener), Champion (language_champion, full_evolution, perfect_session)
- Class Leaderboard: realtime, top 10, first name + animal + points
- Teacher dashboard shows student points, animals, badges, streaks
- Weekly email includes top student highlight

## Database Tables
- sessions (teacher_id, code, status)
- session_students (session_id, student_name)
- student_responses (session_id, student_id, domain, question, answers, is_correct, wida_level, session_part, strategy)
- teacher_preferences (teacher_id, weekly_email_opt_out)
- student_points (student_name, teacher_id, total_points, sessions_completed, current_streak, last_session_date)
- student_badges (student_name, teacher_id, badge_id, badge_name, badge_icon)

## Edge Functions
- generate-anchor-sentence: AI anchor sentence for Part 1 (verify_jwt=false)
- generate-part2: Adaptive strategy-based activities for Part 2 (verify_jwt=false)
- generate-activity: Legacy activity generation (verify_jwt=false)
- send-weekly-report: Weekly email via Resend with strategy breakdown + top student (verify_jwt=false)

## Email
- Resend from reports@elbridgeai.com
- Cron: Monday 13:00 UTC (weekly-email-report)
- Secret: RESEND_API_KEY
- Includes domain scores, WIDA levels, strategy breakdown, top student leaderboard highlight
