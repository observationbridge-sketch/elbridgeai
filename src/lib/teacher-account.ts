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
}
