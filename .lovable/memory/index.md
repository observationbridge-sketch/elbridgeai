# Memory: index.md
Updated: now

ElbridgeAI - K-12 English Language Learning platform for teachers and students

## Design System
- Primary: ocean blue (210 80% 45%)
- Accent: teal (170 55% 40%)
- Success: green (145 60% 40%)
- Warning: amber (38 90% 55%)
- Radius: 0.75rem
- Button variants: hero (gradient), heroOutline, success

## Architecture
- Teachers: auth via Supabase (Google OAuth + email), dashboard with session codes
- Students: anon access, join via 6-char code + first name → theme picker → session
- AI: Lovable AI (openai/gpt-5) generates activities per domain
- Domains: Reading, Writing, Speaking, Listening
- WIDA levels: Entering, Emerging, Developing, Expanding, Bridging

## K-2 vs 3-5 Differentiation
- K-2: max 8 words/sentence, 3 vocab words, concrete topics, Tier 1 vocab only
- K-2 UI: 22px min body text, star progress (no text labels), emoji illustrations
- K-2: "I heard it! 👂" button, larger animal companion, feeling rating (😕😐😊)
- K-2 listening: auto-play audio, emoji hint display, "Hear it again! 🔁"
- K-2 positions 5-6: Speaking only (recording), must involve animal companion
- Session difficulty curve: Easy→Medium→Hard→PEAK→Wind-down→Fun-finish
- K-2 sentence_frames: No passage, tap-only word bank, max 2-syllable words
- K-2 sentence_frames: NO "Sentence frame" box, NO text input, NO Submit button
- K-2 sentence_frames: ONLY blank sentence (large) + tappable word tiles

## Adaptive Difficulty (K-2 Sentence Frames)
- 3 Tiers: T1 (4-word/1blank/2choices), T2 (6-word/2blanks/3choices), T3 (8-word/3blanks/4choices)
- Advance: 3 consecutive correct → tier up. Drop: 2 consecutive wrong → tier down
- Tier persisted in student_points.sentence_frame_tier
- Tier history in student_tier_history table
- consecutive_tier_drops tracked for "Needs Support" flagging (≥2 drops)
- Labels: Beginning 🌱, Developing 🌿, Expanding 🌳
- BANNED connectors in K-2: "because", "although", "when", all subordinate clause connectors

## Edge Functions
- generate-anchor-sentence: AI anchor (verify_jwt=false)
- generate-activity: Part 1 activities with K-2 content rules
- generate-part2: Strategy activities with difficulty arc + tier param for K-2
- generate-part3-challenge: Final challenge
