import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export async function ensureTeacherAccount(user: User) {
  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : null;

  const { error } = await supabase.rpc("ensure_teacher_account", {
    p_user_id: user.id,
    p_full_name: fullName,
  });

  if (error) {
    throw error;
  }

  // Activate beta pass (creates subscription + increments beta slot counter).
  // Safe to call multiple times — the edge function returns 409 if already activated.
  try {
    const { error: passError } = await supabase.functions.invoke("activate-pass");
    if (passError) {
      // Log but don't block the auth flow — 409 "already_activated" is expected on login
      console.warn("activate-pass:", passError.message);
    }
  } catch (e) {
    console.warn("activate-pass call failed:", e);
  }
}
