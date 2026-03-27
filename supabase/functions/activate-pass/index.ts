import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create an authenticated client to verify the user
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;

    // Use service role for privileged operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if user already has an active subscription
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("id, plan, status, expires_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (existingSub) {
      return new Response(
        JSON.stringify({
          error: "already_activated",
          message: "You already have an active subscription",
          subscription: existingSub,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Check if beta is full
    const { data: slots, error: slotsError } = await supabase
      .from("beta_slots")
      .select("slots_total, slots_used")
      .single();

    if (slotsError) throw slotsError;

    if (slots.slots_used >= slots.slots_total) {
      return new Response(
        JSON.stringify({ error: "beta_full", message: "Beta is full" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Create the free_trial subscription (90 days — through June 2026)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .insert({
        user_id: userId,
        plan: "free_trial",
        status: "active",
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (subError) throw subError;

    // 3. Increment slots_used
    const { error: updateError } = await supabase
      .from("beta_slots")
      .update({ slots_used: slots.slots_used + 1 })
      .eq("id", 1);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        status: "activated",
        subscription,
        slots_remaining: slots.slots_total - slots.slots_used - 1,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
