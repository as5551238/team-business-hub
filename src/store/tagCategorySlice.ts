import type { AppState } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete } from './supabase';
import { genId } from './utils';
import { reducerCanDelete, needMutate, tsNow, markPendingDelete } from './shared';
import { cascadeDeleteTag, cascadeDeleteCategory } from './cascadeHandlers';

export function tagCategoryReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'ADD_TAG': {
      const s = needMutate(state, ['tags']);
      const now = tsNow();
      const tag = { ...action.payload, id: genId('tag'), createdAt: now, updatedAt: now };
      s.tags.push(tag);
      supabaseInsert('tags', tag);
      return s;
    }
    case 'UPDATE_TAG': {
      const s = needMutate(state, ['tags']);
      const now = tsNow();
      const idx = s.tags.findIndex(t => t.id === action.payload.id);
      if (idx !== -1) { s.tags[idx] = { ...s.tags[idx], ...action.payload.updates, updatedAt: now }; supabaseUpdate('tags', action.payload.id, { ...action.payload.updates, updated_at: now }); }
      return s;
    }
    case 'DELETE_TAG': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const tid = action.payload;
      const now = tsNow();
      const s = needMutate(state, ['tags', 'goals', 'projects', 'tasks']);
      markPendingDelete(tid);
      cascadeDeleteTag(s, tid, now);
      s.tags = s.tags.filter(t => t.id !== tid);
      supabaseDelete('tags', tid);
      return s;
    }
    case 'ADD_CATEGORY': {
      const s = needMutate(state, ['categories']);
      const now = tsNow();
      const c = { ...action.payload, id: genId('cat'), createdAt: now };
      s.categories.push(c);
      supabaseInsert('categories', c);
      return s;
    }
    case 'UPDATE_CATEGORY': {
      const s = needMutate(state, ['categories']);
      const idx = s.categories.findIndex(c => c.id === action.payload.id);
      if (idx !== -1) { s.categories[idx] = { ...s.categories[idx], ...action.payload.updates }; supabaseUpdate('categories', action.payload.id, action.payload.updates); }
      return s;
    }
    case 'DELETE_CATEGORY': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const cid = action.payload;
      const now = tsNow();
      const s = needMutate(state, ['categories', 'goals', 'projects', 'tasks']);
      markPendingDelete(cid);
      cascadeDeleteCategory(s, cid, now);
      s.categories = s.categories.filter(c => c.id !== cid);
      supabaseDelete('categories', cid);
      return s;
    }
    case 'SET_CATEGORIES': {
      const s = needMutate(state, ['categories']);
      s.categories = action.payload;
      return s;
    }
  }
  return null;
}
