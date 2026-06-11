import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Service-role Supabase client. Bypasses RLS — use ONLY in trusted server code
 * (the poller and the scoring engine). Never expose to the browser.
 */
export function createAdminClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = serverEnv();
  return createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
