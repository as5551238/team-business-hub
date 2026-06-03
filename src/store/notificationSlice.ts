import type { AppState } from '@/types';
import { isSupabaseConfigured } from '@/supabase/client';
import type { Action } from './types';
import { supabaseUpsert, supabaseUpdate, supabaseInsert, supabaseDelete } from './supabase';
import { needMutate } from './shared';
import { genId } from './utils';

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
      const n = { ...action.payload, read: action.payload.read ?? false, level: action.payload.level || 'normal' };
      if (n.id && s.notifications.some(x => x.id === n.id)) return state;
      // Check mute: if member has muted this item, skip non-urgent notifications
      if (n.level !== 'urgent' && s.notificationPreferences) {
        const pref = s.notificationPreferences.find(p => p.itemId === n.relatedId && p.itemType === n.relatedType && p.memberId === n.memberId && p.muted);
        if (pref) return state; // muted — skip
      }
      s.notifications.unshift(n);
      return s;
    }
    case 'TOGGLE_NOTIFICATION_MUTE': {
      const s = needMutate(state, ['notificationPreferences']);
      const { itemId, itemType, memberId } = action.payload;
      const existing = s.notificationPreferences?.find(p => p.itemId === itemId && p.itemType === itemType && p.memberId === memberId);
      if (existing) {
        existing.muted = !existing.muted;
        supabaseUpdate('notification_preferences', existing.id, { muted: existing.muted });
      } else {
        const pref = { id: genId('np'), itemId, itemType, memberId, muted: true, createdAt: new Date().toISOString() };
        if (!s.notificationPreferences) s.notificationPreferences = [];
        s.notificationPreferences.push(pref);
        supabaseInsert('notification_preferences', pref);
      }
      return s;
    }
  }
  return null;
}
