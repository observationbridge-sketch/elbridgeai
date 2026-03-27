import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function buildCheckinEmail(firstName: string): { subject: string; text: string } {
  const name = firstName || "there";
  return {
    subject: `Quick question about ElbridgeAI — ${name}`,
    text: `Hi ${name},

You've been using ElbridgeAI for two weeks now — thank you for being part of the beta.

I have one question, and an honest reply is all I need:

Did students come back for more sessions — if not, what seemed to stop them?

That's it. Just reply to this email.

Every answer — good or bad — helps me figure out whether this is worth building further in the summer.

Thank you,
Mr. Salgado
ElbridgeAI

---
Your beta access runs through June 2026.
elbridgeai.com`,
  };
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

    // Find beta teachers created ~14 days ago (±1 day window) who haven't been checked in
    const now = new Date();
    const thirteenDaysAgo = new Date(now);
    thirteenDaysAgo.setUTCDate(now.getUTCDate() - 15);
    thirteenDaysAgo.setUTCHours(0, 0, 0, 0);

    const fifteenDaysAgo = new Date(now);
    fifteenDaysAgo.setUTCDate(now.getUTCDate() - 13);
    fifteenDaysAgo.setUTCHours(23, 59, 59, 999);

    // Get active free_trial subscriptions created in the 14-day window
    const { data: subs, error: subsError } = await supabase
      .from("subscriptions")
      .select("user_id, created_at")
      .eq("plan", "free_trial")
      .eq("status", "active")
      .gte("created_at", thirteenDaysAgo.toISOString())
      .lte("created_at", fifteenDaysAgo.toISOString());

    if (subsError) throw subsError;
    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No teachers due for check-in today" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userIds = subs.map((s: any) => s.user_id);

    // Filter out teachers who already received the check-in
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, check_in_sent")
      .in("id", userIds)
      .eq("check_in_sent", false);

    if (profilesError) throw profilesError;
    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ message: "All eligible teachers already checked in" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: string[] = [];

    for (const profile of profiles) {
      // Get teacher email from auth
      const { data: userData } = await supabase.auth.admin.getUserById(profile.id);
      if (!userData?.user?.email) continue;

      const email = userData.user.email;
      const firstName = profile.full_name?.split(" ")[0] || email.split("@")[0];
      const { subject, text } = buildCheckinEmail(firstName);

      // Send plain-text email via Resend
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Mr. Salgado <hello@elbridgeai.com>",
          reply_to: "bridgeaitools@gmail.com",
          to: [email],
          subject,
          text,
        }),
      });

      if (!resendRes.ok) {
        const err = await resendRes.text();
        console.error(`Failed to send check-in to ${email}:`, err);
        results.push(`${email}: failed`);
        continue;
      }

      // Mark as sent
      await supabase
        .from("profiles")
        .update({ check_in_sent: true })
        .eq("id", profile.id);

      results.push(`${email}: sent`);
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Beta check-in error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
