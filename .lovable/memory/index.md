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

## Database Tables
- sessions (teacher_id, code, status)
- session_students (session_id, student_name)
- student_responses (session_id, student_id, domain, question, answers, is_correct, wida_level)
- teacher_preferences (teacher_id, weekly_email_opt_out)

## Edge Functions
- generate-activity: AI activity generation (verify_jwt=false)
- send-weekly-report: Weekly email via Resend (verify_jwt=false)

## Email
- Resend from reports@elbridgeai.com
- Cron: Monday 13:00 UTC (weekly-email-report)
- Secret: RESEND_API_KEY
