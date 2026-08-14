import type { AppState } from '@/types';
import { isSupabaseConfigured } from '@/supabase/client';
import type { Action } from './types';
import { supabaseUpsert, supabaseUpdate, supabaseInsert } from './supabase';
import { needMutate } from './shared';

export function notificationReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'MARK_NOTIFICATION_READ': {
      const s = needMutate(state, ['notifications']);
      const now = new Date().toISOString();
      const idx = s.notifications.findIndex(n => n.id === action.payload);
      if (idx !== -1) { s.notifications[idx].read = true; s.notifications[idx].updatedAt = now; supabaseUpdate('notifications', action.payload, { read: true, updated_at: now }); }
      return s;
    }
    case 'MARK_ALL_NOTIFICATIONS_READ': {
      const s = needMutate(state, ['notifications']);
      const now = new Date().toISOString();
      const unread = s.notifications.filter(n => !n.read);
      if (unread.length === 0) return state;
      unread.forEach(n => { n.read = true; n.updatedAt = now; });
      if (isSupabaseConfigured()) supabaseUpsert('notifications', unread.map(n => ({ ...n, updated_at: now })));
      return s;
    }
    case 'ADD_NOTIFICATION': {
      const s = needMutate(state, ['notifications']);
      const n = { ...action.payload, read: action.payload.read ?? false };
      if (n.id && s.notifications.some(x => x.id === n.id)) return state;
      s.notifications.unshift(n);
      supabaseInsert('notifications', n);
      return s;
    }
  }
  return null;
}
