import type { AppState, Bookmark, Sprint, Knowledge } from '@/types';
import { isSupabaseConfigured } from '@/supabase/client';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseUpsert, supabaseDelete } from './supabase';
import { genId } from './utils';
import { reducerCanDelete, canDeleteOwnContent, needMutate, tsNow, markPendingDelete, fireAutomationRules } from './shared';

export function contentReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'ADD_SAVED_VIEW': {
      const s = needMutate(state, ['savedViews']);
      const now = tsNow();
      const view = { ...action.payload, teamId: s.currentTeamId || '__default__', id: genId('sv'), createdAt: now };
      s.savedViews.push(view);
      supabaseInsert('saved_views', view);
      return s;
    }
    case 'UPDATE_SAVED_VIEW': {
      const s = needMutate(state, ['savedViews']);
      const now = tsNow();
      const idx = s.savedViews.findIndex(v => v.id === action.payload.id);
      if (idx !== -1) { s.savedViews[idx] = { ...s.savedViews[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('saved_views', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }
    case 'DELETE_SAVED_VIEW': {
      if (!state.currentUser) return state;
      const svObj = state.savedViews.find(v => v.id === action.payload);
      if (!canDeleteOwnContent(state, svObj?.memberId)) return state;
      const s = needMutate(state, ['savedViews']);
      markPendingDelete(action.payload);
      s.savedViews = s.savedViews.filter(v => v.id !== action.payload);
      supabaseDelete('saved_views', action.payload);
      return s;
    }
    case 'ADD_REVIEW': {
      if (!state.currentUser) return state;
      const s = needMutate(state, ['reviews']);
      const now = tsNow();
      const payload = { ...action.payload };
      if (payload.memberId && payload.memberId !== state.currentUser.id) return state;
      const r = { ...payload, teamId: s.currentTeamId || '__default__', id: genId('rv'), createdAt: now, updatedAt: now };
      s.reviews.push(r);
      supabaseInsert('reviews', r);
      return s;
    }
    case 'UPDATE_REVIEW': {
      if (!state.currentUser) return state;
      const s = needMutate(state, ['reviews']);
      const now = tsNow();
      const idx = s.reviews.findIndex(r => r.id === action.payload.id);
      if (idx !== -1) {
        const existing = s.reviews[idx];
        const isOwnOrTeam = !existing.memberId || existing.memberId === state.currentUser.id;
        const isAdmin = state.currentUser.role === 'admin';
        if (!isOwnOrTeam && !isAdmin) return state;
        s.reviews[idx] = { ...existing, ...action.payload.updates, updatedAt: now };
        supabaseUpdate('reviews', action.payload.id, { ...action.payload.updates, updated_at: now });
      }
      return s;
    }
    case 'DELETE_REVIEW': {
      if (!reducerCanDelete(state, 'team_manage')) return state;
      const s = needMutate(state, ['reviews']);
      markPendingDelete(action.payload);
      s.reviews = s.reviews.filter(r => r.id !== action.payload);
      supabaseDelete('reviews', action.payload);
      return s;
    }
    case 'ADD_TEMPLATE': {
      const s = needMutate(state, ['templates']);
      const now = tsNow();
      const t = { ...action.payload, teamId: s.currentTeamId || '__default__', id: genId('tpl'), createdAt: now, updatedAt: now };
      s.templates.push(t);
      supabaseInsert('templates', t);
      return s;
    }
    case 'UPDATE_TEMPLATE': {
      const s = needMutate(state, ['templates']);
      const now = tsNow();
      const idx = s.templates.findIndex(t => t.id === action.payload.id);
      if (idx !== -1) { s.templates[idx] = { ...s.templates[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('templates', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }
    case 'DELETE_TEMPLATE': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['templates']);
      markPendingDelete(action.payload);
      s.templates = s.templates.filter(t => t.id !== action.payload);
      supabaseDelete('templates', action.payload);
      return s;
    }
    case 'ADD_SCHEDULE_EVENT': {
      const s = needMutate(state, ['scheduleEvents']);
      const now = tsNow();
      const e = { ...action.payload, teamId: s.currentTeamId || '__default__', id: genId('evt'), createdAt: now, updatedAt: now };
      s.scheduleEvents.push(e);
      supabaseInsert('schedule_events', e);
      return s;
    }
    case 'UPDATE_SCHEDULE_EVENT': {
      const s = needMutate(state, ['scheduleEvents']);
      const now = tsNow();
      const idx = s.scheduleEvents.findIndex(e => e.id === action.payload.id);
      if (idx !== -1) { s.scheduleEvents[idx] = { ...s.scheduleEvents[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('schedule_events', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }
    case 'DELETE_SCHEDULE_EVENT': {
      if (!state.currentUser) return state;
      const seObj = state.scheduleEvents.find(e => e.id === action.payload);
      if (!canDeleteOwnContent(state, seObj?.memberId)) return state;
      const s = needMutate(state, ['scheduleEvents']);
      markPendingDelete(action.payload);
      s.scheduleEvents = s.scheduleEvents.filter(e => e.id !== action.payload);
      supabaseDelete('schedule_events', action.payload);
      return s;
    }
    case 'ADD_NOTE': {
      const s = needMutate(state, ['notes']);
      const now = tsNow();
      const n = { ...action.payload, teamId: s.currentTeamId || '__default__', id: genId('note'), createdAt: now, updatedAt: now };
      s.notes.push(n);
      supabaseInsert('notes', n);
      return s;
    }
    case 'UPDATE_NOTE': {
      const s = needMutate(state, ['notes']);
      const now = tsNow();
      const idx = s.notes.findIndex(n => n.id === action.payload.id);
      if (idx !== -1) { s.notes[idx] = { ...s.notes[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('notes', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }
    case 'DELETE_NOTE': {
      if (!state.currentUser) return state;
      const noteObj = state.notes.find(n => n.id === action.payload);
      if (!canDeleteOwnContent(state, noteObj?.createdBy)) return state;
      const s = needMutate(state, ['notes']);
      markPendingDelete(action.payload);
      s.notes = s.notes.filter(n => n.id !== action.payload);
      supabaseDelete('notes', action.payload);
      return s;
    }
    case 'ADD_BOOKMARK': {
      const s = needMutate(state, ['bookmarks']);
      const b: Bookmark = { ...action.payload, teamId: s.currentTeamId || '__default__', id: genId('bm'), createdAt: new Date().toISOString() };
      s.bookmarks.push(b);
      supabaseInsert('bookmarks', b);
      return s;
    }
    case 'UPDATE_BOOKMARK': {
      const s = needMutate(state, ['bookmarks']);
      const now = tsNow();
      const idx = s.bookmarks.findIndex(b => b.id === action.payload.id);
      if (idx !== -1) { s.bookmarks[idx] = { ...s.bookmarks[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('bookmarks', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }
    case 'DELETE_BOOKMARK': {
      if (!state.currentUser) return state;
      const bmObj = state.bookmarks.find(b => b.id === action.payload);
      if (!canDeleteOwnContent(state, bmObj?.memberId)) return state;
      const s = needMutate(state, ['bookmarks']);
      markPendingDelete(action.payload);
      s.bookmarks = s.bookmarks.filter(b => b.id !== action.payload);
      supabaseDelete('bookmarks', action.payload);
      return s;
    }
    case 'REORDER_BOOKMARKS': {
      const s = needMutate(state, ['bookmarks']);
      s.bookmarks = action.payload;
      if (action.payload.length > 0 && isSupabaseConfigured()) supabaseUpsert('bookmarks', action.payload);
      return s;
    }
    case 'SET_BOOKMARKS': {
      const s = needMutate(state, ['bookmarks']);
      s.bookmarks = action.payload;
      if (action.payload.length > 0 && isSupabaseConfigured()) supabaseUpsert('bookmarks', action.payload);
      return s;
    }
    case 'ADD_KNOWLEDGE': {
      const s = needMutate(state, ['knowledge']);
      const now = tsNow();
      const k: Knowledge = { ...action.payload, teamId: s.currentTeamId || '__default__', id: genId('kb'), category: action.payload.category ?? '', status: action.payload.status ?? 'active', assigneeId: action.payload.assigneeId ?? undefined, priority: action.payload.priority ?? 'medium', dueDate: action.payload.dueDate ?? null, metadata: action.payload.metadata ?? {}, visibility: action.payload.visibility ?? 'team', tags: action.payload.tags ?? [], relatedItems: action.payload.relatedItems ?? [], content: action.payload.content ?? '', color: action.payload.color ?? '', createdAt: now, updatedAt: now };
      s.knowledge.push(k);
      supabaseInsert('knowledge', k);
      // Phase3-P2: Fire automation rules for content_created trigger
      try {
        fireAutomationRules(s, k.id, 'knowledge', k.title, 'content_created', { status: k.status ?? 'active' }, {});
      } catch (e) { console.warn('knowledge content_created automation failed:', e); }
      return s;
    }
    case 'UPDATE_KNOWLEDGE': {
      const s = needMutate(state, ['knowledge']);
      const now = tsNow();
      const kIdx = s.knowledge.findIndex(k => k.id === action.payload.id);
      if (kIdx !== -1) {
        s.knowledge[kIdx] = { ...s.knowledge[kIdx], ...action.payload.updates, updatedAt: now };
        supabaseUpdate('knowledge', action.payload.id, { ...action.payload.updates, updated_at: now });
      }
      return s;
    }
    case 'DELETE_KNOWLEDGE': {
      const target = state.knowledge.find(k => k.id === action.payload);
      if (!target) return state;
      if (!canDeleteOwnContent(state, target.memberId)) return state;
      const s = needMutate(state, ['knowledge']);
      markPendingDelete(action.payload);
      s.knowledge = s.knowledge.filter(k => k.id !== action.payload);
      supabaseDelete('knowledge', action.payload);
      return s;
    }
    case 'UPDATE_SUBSCRIPTION': {
      // Subscriptions are managed via Stripe webhooks, not direct Supabase writes.
      // No supabaseUpdate needed here — the webhook handler updates the DB.
      const s = needMutate(state, ['subscriptions']);
      const idx = s.subscriptions.findIndex(sub => sub.teamId === action.payload.teamId);
      const now = tsNow();
      if (idx !== -1) {
        s.subscriptions[idx] = { ...s.subscriptions[idx], ...action.payload.updates, updatedAt: now };
      }
      return s;
    }
  }
  return null;
}
