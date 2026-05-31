import type { AppState } from '@/types';
import { isSupabaseConfigured } from '@/supabase/client';
import type { Action } from './types';
import { supabaseUpsert, supabaseUpdate } from './supabase';
import { needMutate } from './shared';

export function notificationReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'MARK_NOTIFICATION_READ': {
      const s = needMutate(state, ['notifications']);
      const idx = s.notifications.findIndex(n => n.id === action.payload);
      if (idx !== -1) { s.notifications[idx].read = true; supabaseUpdate('notifications', action.payload, { read: true }); }
      return s;
    }
    case 'MARK_ALL_NOTIFICATIONS_READ': {
      const s = needMutate(state, ['notifications']);
      const unread = s.notifications.filter(n => !n.read);
      if (unread.length === 0) return state;
      unread.forEach(n => { n.read = true; });
      if (isSupabaseConfigured()) supabaseUpsert('notifications', unread);
      return s;
    }
    case 'ADD_NOTIFICATION': {
      const s = needMutate(state, ['notifications']);
      const n = { ...action.payload, read: action.payload.read ?? false };
      if (n.id && s.notifications.some(x => x.id === n.id)) return state;
      s.notifications.unshift(n);
      return s;
    }
  }
  return null;
}
