ElbridgeAI - K-12 English Language Learning platform for teachers and students (grades 3-5, K-2 and 6-8 rolling out soon)

## Branding & Legal
- NEVER use "WIDA" — use "ELD Proficiency Level" or "Proficiency Level"
- NEVER use "WIDA Can-Do Descriptors" — use "Academic Can-Do Benchmarks"
- NEVER use "Literacy Squared" or "Kathy Escamilla" — these are proprietary
- Footer disclaimer: "ELBridgeAI is an independent tool designed to support language acquisition."
- Focus: Grades 3-5 (K-2 and 6-8 rolling out soon)
- DB column `wida_level` kept for backward compat but NEVER shown to users as "WIDA"

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
- Proficiency levels: Entering, Emerging, Developing, Expanding, Bridging, Reaching

## Grade Bands
- Two bands: K-2 and 3-5 (stored in sessions.grade_band and student_responses.grade_band)
- K-2: 1 sentence anchor (max 8 words), Tier 1 vocab, 4 Part 2 activities, Speed Round only for Part 3
- 3-5: 2-3 sentence anchor, full vocabulary, 6 Part 2 activities, all Part 3 types
- Auto-adjustment: <50% Part 1 → downgrade, >85% Part 1 → upgrade (per-student)
- K-2 proficiency: Entering(1), Emerging(2), Developing(3); 3-5: Expanding(4), Bridging(5), Reaching(6)

## Session Flow (3 parts, 12 steps, ~25-30 min)
- Part 1: 5-step literacy routine with 2-3 sentence anchor passage
- Part 2: 6 adaptive activities using one of 3 strategies
- Part 3: Fun challenge (Story Builder / Speed Round / Teach It Back)
- Theme + topic declared at session start, enforced across all parts

## Content History System
- student_content_history table tracks: theme, topic, key_vocabulary, vocabulary_results, activity_formats, challenge_type per session
- History injected into AI prompts to avoid repetition (last 10 sessions)
- Theme rotation: no repeat within 4-session window; after 8 themes, vary sub-topics
- Vocabulary progression: words from 2+ sessions ago can reappear as review; new:review ratio 3:1

## Edge Functions
- generate-anchor-sentence, generate-part2, generate-part3-challenge, generate-activity (legacy)

## Gamification
- Points, animal evolution (🐣→🦋), 13 badges, real-time leaderboard

## Database Tables
- sessions (teacher_id, code, status, grade_band)
- session_students (session_id, student_name)
- student_responses (session_id, student_id, domain, question, answers, is_correct, wida_level, grade_band)
- student_points, student_badges, teacher_preferences
- student_content_history (student_name, teacher_id, session_id, theme, topic, key_vocabulary, vocabulary_results, activity_formats, challenge_type, grade_band, is_baseline)
