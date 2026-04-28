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
  supabaseInstance = null;
}
