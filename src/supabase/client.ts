import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  return supabaseInstance;
}

export function initSupabase(url: string, anonKey: string): SupabaseClient {
  supabaseInstance = createClient(url, anonKey);
  return supabaseInstance;
}

export function isSupabaseConfigured(): boolean {
  return supabaseInstance !== null;
}

export function resetSupabase(): void {
  // P3#26 fix: remove all Realtime channels before nulling instance to prevent leaks
  if (supabaseInstance) {
    try { supabaseInstance.removeAllChannels(); } catch {}
  }
  supabaseInstance = null;
}

/** Set RLS context for current session.
 *  Uses Supabase RPC set_app_context() which sets session-level Postgres variables.
 *  Since we use anon key, this relies on the RPC being security definer (which it is in schema.sql).
 *  If RPC fails (e.g. RLS not yet applied), silently continues — queries still work via team_id filter. */
export async function setRLSContext(teamId: string, userId: string): Promise<void> {
  const sb = supabaseInstance;
  if (!sb) return;
  try {
    const { error } = await sb.rpc('set_app_context', {
      p_team_id: teamId,
      p_user_id: userId,
    });
    if (error) {
      // Expected: RPC may fail if not yet deployed to Supabase.
      // Frontend queries already filter by team_id, so this is non-blocking.
      console.info('[RLS] set_app_context skipped (not deployed or permission issue):', error.message);
    }
  } catch (e) {
    console.info('[RLS] set_app_context skipped:', String(e));
  }
}
