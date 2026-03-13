# Memory: index.md
Updated: now

ElbridgeAI - K-12 English Language Learning platform for teachers and students (grades 3-5, K-2 and 6-8 rolling out soon)

## Branding & Legal
- NEVER use "WIDA" — use "Standard ELD Frameworks" or "National Proficiency Standards"
- NEVER use "WIDA Can-Do Descriptors" — use "Academic Can-Do Benchmarks"
- Footer disclaimer: "ELBridgeAI is an independent tool designed to support language acquisition."
- Focus: Grades 3-5 (K-2 and 6-8 rolling out soon)

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
- Proficiency levels: Entering, Emerging, Developing, Expanding, Bridging

## Session Flow (3 parts, 12 steps, ~25-30 min)
- Part 1: 5-step Literacy Squared routine with 2-3 sentence anchor passage
- Part 2: 6 adaptive activities using one of 3 strategies
- Part 3: Fun challenge (Story Builder / Speed Round / Teach It Back)
- Theme + topic declared at session start, enforced across all parts

## Edge Functions
- generate-anchor-sentence, generate-part2, generate-part3-challenge, generate-activity (legacy)

## Gamification
- Points, animal evolution (🐣→🦋), 13 badges, real-time leaderboard

## Database Tables
- sessions, session_students, student_responses (session_part, strategy, wida_level column)
- student_points, student_badges, teacher_preferences
