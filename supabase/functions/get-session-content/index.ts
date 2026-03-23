/**
 * supabase/functions/get-session-content/index.ts
 *
 * DROP-IN replacement for calling generate-anchor-sentence +
 * generate-part2 + generate-part3-challenge separately.
 *
 * Returns a full pre-generated session bundle from content_bank.
 * Falls back to live Claude generation ONLY if the bank is empty
 * for this grade/theme — and queues a background job to fill the gap.
 *
 * Frontend call:
 *   const { data } = await supabase.functions.invoke('get-session-content', {
 *     body: { grade: 'K-2', theme: 'Nature & animals' }
 *   });
 *   // data.anchor, data.part2_activities, data.part3_challenge
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { grade, theme } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── 1. Try the content bank first ──────────────────────────────────────
    const { data: rows, error } = await supabase
      .rpc("get_cached_session", { p_grade: grade, p_theme: theme });

    if (error) {
      console.error("content_bank RPC error:", error.message);
    }

    if (rows && rows.length > 0) {
      const session = rows[0];

      // Mark as used (fire and forget — don't await)
      supabase.rpc("mark_session_used", { p_id: session.id }).then(() => {});

      console.log(`[get-session-content] Cache HIT — id:${session.id} theme:${session.theme}`);

      return new Response(
        JSON.stringify({
          source: "cache",
          id: session.id,
          grade: session.grade,
          theme: session.theme,
          topic: session.topic,
          anchor: session.anchor,
          part2_activities: session.part2_activities,
          part3_challenge: session.part3_challenge,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Cache miss — fall back to live generation ───────────────────────
    console.warn(`[get-session-content] Cache MISS for grade:${grade} theme:${theme} — falling back to live generation`);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

    // Call existing anchor function
    const anchorRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-anchor-sentence`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({ grade }),
      }
    );
    const anchor = await anchorRes.json();
    const topic = anchor.topic || theme;

    // Call part2 for each activity
    const activityCount = grade === "K-2" ? 4 : 6;
    const part2Activities = [];
    for (let i = 0; i < activityCount; i++) {
      const p2Res = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-part2`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({ grade, theme, topic, questionIndex: i }),
        }
      );
      const activity = await p2Res.json();
      part2Activities.push(activity);
    }

    // Call part3
    const p3Res = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-part3-challenge`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({ grade, theme, topic }),
      }
    );
    const part3 = await p3Res.json();

    // Save to bank for next time (fire and forget)
    supabase.from("content_bank").insert({
      grade,
      theme,
      topic,
      anchor,
      part2_activities: part2Activities,
      part3_challenge: part3,
      used_count: 1,
      last_used_at: new Date().toISOString(),
    }).then(({ error: insertErr }) => {
      if (insertErr) console.error("Failed to cache live session:", insertErr.message);
      else console.log("[get-session-content] Live session cached for next time");
    });

    return new Response(
      JSON.stringify({
        source: "live",
        grade,
        theme,
        topic,
        anchor,
        part2_activities: part2Activities,
        part3_challenge: part3,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("get-session-content error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
