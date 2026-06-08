/**
 * team_settings KV store — DB-first + localStorage fallback
 * DR-19: All business configs must persist to Supabase for cross-device sync.
 * This module provides a unified read/write pattern using the `team_settings` table.
 */
import { getSupabaseClient, isSupabaseConfigured } from './client';
import { handleError } from '@/lib/errorHandler';

/** Read a team_setting value from DB. Returns null if not found. */
export async function getTeamSetting<T = unknown>(key: string, teamId: string): Promise<T | null> {
  try {
    const sb = getSupabaseClient();
    if (!sb) return null;
    const { data } = await sb
      .from('team_settings')
      .select('value')
      .eq('team_id', teamId)
      .eq('key', key)
      .maybeSingle();
    return data ? (data.value as T) : null;
  } catch (e) {
    handleError(e, { module: 'teamSettings', operation: 'GET', severity: 'debug' });
    return null;
  }
}

/** Write a team_setting value to DB (upsert). Fire-and-forget. */
export async function setTeamSetting<T = unknown>(key: string, value: T, teamId: string): Promise<void> {
  try {
    const sb = getSupabaseClient();
    if (!sb) return;
    await sb
      .from('team_settings')
      .upsert(
        { team_id: teamId, key, value, updated_at: new Date().toISOString() },
        { onConflict: 'team_id,key' }
      );
  } catch (e) {
    handleError(e, { module: 'teamSettings', operation: 'SET', severity: 'debug' });
  }
}

/** Delete a team_setting from DB. */
export async function deleteTeamSetting(key: string, teamId: string): Promise<void> {
  try {
    const sb = getSupabaseClient();
    if (!sb) return;
    await sb
      .from('team_settings')
      .delete()
      .eq('team_id', teamId)
      .eq('key', key);
  } catch (e) {
    handleError(e, { module: 'teamSettings', operation: 'DELETE', severity: 'debug' });
  }
}

/**
 * Generic DB-first + localStorage fallback reader.
 * 1. Try DB → return if found
 * 2. Fallback to localStorage → return if found
 * 3. Return null
 */
export async function loadSettingDBFirst<T = unknown>(key: string, lsKey: string, teamId: string): Promise<T | null> {
  // DB first
  const dbVal = await getTeamSetting<T>(key, teamId);
  if (dbVal !== null) return dbVal;
  // localStorage fallback
  try {
    const raw = localStorage.getItem(lsKey);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    handleError(e, { module: 'teamSettings', operation: 'LOAD_LS_FALLBACK', severity: 'debug' });
    return null;
  }
}

/**
 * Generic dual-write: write to both DB (async) and localStorage (sync).
 * DB write is fire-and-forget. localStorage ensures immediate UI availability.
 */
export function saveSettingDualWrite<T = unknown>(key: string, lsKey: string, value: T, teamId: string): void {
  // Sync localStorage write (immediate)
  try { localStorage.setItem(lsKey, JSON.stringify(value)); } catch (e) { handleError(e, { module: 'teamSettings', operation: 'SAVE_LS', severity: 'debug' }); }
  // Async DB write (fire-and-forget)
  if (isSupabaseConfigured()) {
    setTeamSetting(key, value, teamId).catch(() => {});
  }
}
