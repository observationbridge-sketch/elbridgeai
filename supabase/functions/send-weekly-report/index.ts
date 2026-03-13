import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TeacherReport {
  teacherId: string;
  email: string;
  name: string;
  totalSessions: number;
  totalStudents: number;
  domainScores: Record<string, { correct: number; total: number }>;
  widaLevels: Record<string, number>;
  strategyBreakdown: Record<string, number>;
}

function getWeekRange(): { start: string; end: string; label: string } {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const end = new Date(now);
  end.setUTCDate(now.getUTCDate() - dayOfWeek); // Last Sunday
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 6); // Previous Monday
  start.setUTCHours(0, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: `${fmt(start)} to ${fmt(end)}`,
  };
}

function buildPlainText(report: TeacherReport, weekLabel: string): string {
  const domains = ["Reading", "Writing", "Speaking", "Listening"];
  const widaLevels = ["Entering", "Emerging", "Developing", "Expanding", "Bridging"];

  let text = `Weekly ElbridgeAI Student Report — ${weekLabel}\n\n`;
  text += `Hi ${report.name},\n\nHere's how your students performed this past week.\n\n`;
  text += `Sessions: ${report.totalSessions}  |  Students: ${report.totalStudents}\n\n`;
  text += `DOMAIN PERFORMANCE\n`;
  for (const d of domains) {
    const data = report.domainScores[d] || { correct: 0, total: 0 };
    const pct = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
    text += `  ${d}: ${pct}%\n`;
  }
  text += `\nWIDA LEVELS\n`;
  for (const level of widaLevels) {
    const count = report.widaLevels[level] || 0;
    if (count > 0) text += `  ${level}: ${count}\n`;
  }
  text += `\nView Full Dashboard: https://elbridgeai.lovable.app/teacher/dashboard\n`;
  text += `\nTo manage email preferences or unsubscribe, visit:\nhttps://elbridgeai.lovable.app/teacher/dashboard#email-settings\n`;
  text += `\n—\nElbridgeAI • Empowering English Language Learners\n`;
  return text;
}

function buildEmailHtml(report: TeacherReport, weekLabel: string): string {
  const domains = ["Reading", "Writing", "Speaking", "Listening"];
  const widaLevels = ["Entering", "Emerging", "Developing", "Expanding", "Bridging"];

  let bestDomain = "";
  let bestScore = -1;
  let worstDomain = "";
  let worstScore = 101;

  const domainRows = domains
    .map((d) => {
      const data = report.domainScores[d] || { correct: 0, total: 0 };
      const pct = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
      if (data.total > 0) {
        if (pct > bestScore) { bestScore = pct; bestDomain = d; }
        if (pct < worstScore) { worstScore = pct; worstDomain = d; }
      }
      const barColor = pct >= 70 ? "#2e9e6b" : pct >= 50 ? "#d4a017" : "#dc5050";
      return `<tr>
        <td style="padding:10px 12px;font-weight:600;color:#1a3a5c;">${d}</td>
        <td style="padding:10px 12px;">
          <div style="background:#e8edf2;border-radius:8px;height:20px;width:100%;overflow:hidden;">
            <div style="background:${barColor};height:100%;width:${pct}%;border-radius:8px;"></div>
          </div>
        </td>
        <td style="padding:10px 12px;text-align:right;font-weight:700;color:${barColor};">${pct}%</td>
      </tr>`;
    })
    .join("");

  const widaRows = widaLevels
    .map((level) => {
      const count = report.widaLevels[level] || 0;
      return count > 0
        ? `<span style="display:inline-block;margin:4px 6px;padding:6px 14px;background:#e0f0f5;color:#1a6b5a;border-radius:20px;font-size:13px;font-weight:600;">${level}: ${count}</span>`
        : "";
    })
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#1a6db5,#2e9e6b);padding:32px 40px;text-align:center;">
  <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;">📊 Weekly Report</h1>
  <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">ElbridgeAI • ${weekLabel}</p>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:28px 40px 12px;">
  <p style="margin:0;font-size:16px;color:#1a3a5c;">Hi ${report.name},</p>
  <p style="margin:8px 0 0;font-size:14px;color:#5a6f85;">Here's how your students performed this past week.</p>
</td></tr>

<!-- Quick Stats -->
<tr><td style="padding:12px 40px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="width:50%;padding:12px;text-align:center;background:#f6f9fc;border-radius:12px;">
        <div style="font-size:36px;font-weight:800;color:#1a6db5;">${report.totalSessions}</div>
        <div style="font-size:12px;color:#5a6f85;margin-top:4px;">Sessions</div>
      </td>
      <td style="width:16px;"></td>
      <td style="width:50%;padding:12px;text-align:center;background:#f6f9fc;border-radius:12px;">
        <div style="font-size:36px;font-weight:800;color:#2e9e6b;">${report.totalStudents}</div>
        <div style="font-size:12px;color:#5a6f85;margin-top:4px;">Students</div>
      </td>
    </tr>
  </table>
</td></tr>

<!-- Domain Scores -->
<tr><td style="padding:20px 40px 8px;">
  <h2 style="margin:0;font-size:16px;color:#1a3a5c;">Domain Performance</h2>
</td></tr>
<tr><td style="padding:0 40px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${domainRows}</table>
</td></tr>

<!-- Highlight & Flag -->
${bestDomain ? `<tr><td style="padding:16px 40px 4px;">
  <div style="padding:14px 18px;background:#e8f5e9;border-radius:10px;border-left:4px solid #2e9e6b;">
    <strong style="color:#1a6b5a;">🌟 Strongest:</strong> <span style="color:#1a3a5c;">${bestDomain} at ${bestScore}%</span>
  </div>
</td></tr>` : ""}
${worstDomain && worstDomain !== bestDomain ? `<tr><td style="padding:4px 40px 16px;">
  <div style="padding:14px 18px;background:#fff3e0;border-radius:10px;border-left:4px solid #d4a017;">
    <strong style="color:#b8860b;">⚠️ Needs support:</strong> <span style="color:#1a3a5c;">${worstDomain} at ${worstScore}%</span>
  </div>
</td></tr>` : ""}

<!-- WIDA Levels -->
${widaRows ? `<tr><td style="padding:16px 40px 8px;">
  <h2 style="margin:0;font-size:16px;color:#1a3a5c;">WIDA Levels</h2>
</td></tr>
<tr><td style="padding:0 40px 20px;">${widaRows}</td></tr>` : ""}

<!-- CTA -->
<tr><td style="padding:16px 40px 32px;text-align:center;">
  <a href="https://elbridgeai.lovable.app/teacher/dashboard" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#1a6db5,#2e9e6b);color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">View Full Dashboard →</a>
  <p style="margin:12px 0 0;font-size:12px;color:#8a9bb0;">Log in to see detailed trends and student breakdowns.</p>
</td></tr>

<!-- Footer -->
<tr><td style="padding:20px 40px;background:#f6f9fc;text-align:center;border-top:1px solid #e8edf2;">
  <p style="margin:0;font-size:11px;color:#8a9bb0;">ElbridgeAI • Empowering English Language Learners</p>
  <p style="margin:4px 0 0;font-size:11px;color:#8a9bb0;">You can manage your email preferences in your <a href="https://elbridgeai.lovable.app/teacher/dashboard#email-settings" style="color:#1a6db5;text-decoration:underline;">dashboard settings</a>.</p>
  <p style="margin:4px 0 0;font-size:11px;"><a href="https://elbridgeai.lovable.app/teacher/dashboard#email-settings" style="color:#8a9bb0;text-decoration:underline;">Unsubscribe</a></p>
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if this is a manual request for a specific teacher
    let manualTeacherId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        manualTeacherId = body.teacher_id || null;
      } catch { /* cron calls with minimal body */ }
    }

    const { start, end, label } = getWeekRange();

    // Get teachers (either specific one or all non-opted-out)
    let teacherIds: string[] = [];

    if (manualTeacherId) {
      teacherIds = [manualTeacherId];
    } else {
      // Get all teachers who had sessions, excluding opted-out
      const { data: sessions } = await supabase
        .from("sessions")
        .select("teacher_id")
        .gte("created_at", start)
        .lte("created_at", end);

      if (!sessions || sessions.length === 0) {
        return new Response(JSON.stringify({ message: "No sessions this week" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const uniqueTeachers = [...new Set(sessions.map((s: any) => s.teacher_id))];

      // Check opt-outs
      const { data: optOuts } = await supabase
        .from("teacher_preferences")
        .select("teacher_id")
        .eq("weekly_email_opt_out", true)
        .in("teacher_id", uniqueTeachers);

      const optedOutIds = new Set((optOuts || []).map((o: any) => o.teacher_id));
      teacherIds = uniqueTeachers.filter((id) => !optedOutIds.has(id));
    }

    const results: string[] = [];

    for (const teacherId of teacherIds) {
      // Get teacher info
      const { data: userData } = await supabase.auth.admin.getUserById(teacherId);
      if (!userData?.user) continue;

      const email = userData.user.email!;
      const name = userData.user.user_metadata?.full_name || email.split("@")[0];

      // Get sessions for this teacher this week
      const { data: teacherSessions } = await supabase
        .from("sessions")
        .select("id")
        .eq("teacher_id", teacherId)
        .gte("created_at", start)
        .lte("created_at", end);

      if (!teacherSessions || teacherSessions.length === 0) {
        if (manualTeacherId) {
          // For manual requests, still send with zero data
        } else {
          continue;
        }
      }

      const sessionIds = (teacherSessions || []).map((s: any) => s.id);

      // Get unique students
      const { data: students } = await supabase
        .from("session_students")
        .select("id")
        .in("session_id", sessionIds);

      // Get responses
      const { data: responses } = await supabase
        .from("student_responses")
        .select("domain, is_correct, wida_level")
        .in("session_id", sessionIds);

      const domainScores: Record<string, { correct: number; total: number }> = {};
      const widaLevels: Record<string, number> = {};

      (responses || []).forEach((r: any) => {
        if (!domainScores[r.domain]) domainScores[r.domain] = { correct: 0, total: 0 };
        domainScores[r.domain].total++;
        if (r.is_correct) domainScores[r.domain].correct++;
        widaLevels[r.wida_level] = (widaLevels[r.wida_level] || 0) + 1;
      });

      const report: TeacherReport = {
        teacherId,
        email,
        name,
        totalSessions: sessionIds.length,
        totalStudents: (students || []).length,
        domainScores,
        widaLevels,
      };

      const html = buildEmailHtml(report, label);
      const plainText = buildPlainText(report, label);

      // Send via Resend
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "ElbridgeAI Reports <reports@elbridgeai.com>",
          to: [email],
          subject: `Your Weekly ElbridgeAI Student Report — ${label}`,
          html,
          text: plainText,
        }),
      });

      if (!resendRes.ok) {
        const err = await resendRes.text();
        console.error(`Failed to send to ${email}:`, err);
        results.push(`${email}: failed`);
      } else {
        results.push(`${email}: sent`);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Weekly report error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
