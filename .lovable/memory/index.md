# Memory: index.md
Updated: now

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

## Session Flow (3 parts, 12 steps, ~25-30 min)
- Part 1: 5-step Literacy Squared routine with 2-3 sentence anchor passage
- Part 2: 6 adaptive activities using one of 3 strategies (Sentence Frames / Expansion / Quick Writes)
- Part 3: Fun challenge (Story Builder / Speed Round / Teach It Back)
- Theme + topic declared at session start, enforced across all parts

## Edge Functions
- generate-anchor-sentence: returns 2-3 sentence passage + theme + topic
- generate-part2: adaptive strategy, 6 activities, theme-enforced
- generate-part3-challenge: random challenge type, theme-enforced
- generate-activity: legacy (may be unused)

## Gamification
- Points: accumulate across sessions, Part 3 challenge bonuses (20/25 pts)
- Animal evolution: 🐣→🐢→🦊→🦅→🐬→🦋
- Badges: 13 badges across 4 categories
- Leaderboard: real-time via Supabase Realtime

## Database Tables
- sessions, session_students, student_responses (with session_part, strategy)
- student_points, student_badges, teacher_preferences
