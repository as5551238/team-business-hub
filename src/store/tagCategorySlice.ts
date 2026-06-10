import type { AppState } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete } from './supabase';
import { genId } from './utils';
import { reducerCanDelete, needMutate, tsNow, markPendingDelete } from './shared';

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
      s.goals.forEach(g => {
        const prevLen = g.tags?.length ?? 0;
        g.tags = (g.tags ?? []).filter(id => id !== tid);
        if (g.tags.length !== prevLen) { g.updatedAt = now; supabaseUpdate('goals', g.id, { tags: g.tags, updated_at: now }); }
      });
      s.projects.forEach(p => {
        const prevLen = p.tags?.length ?? 0;
        p.tags = (p.tags ?? []).filter(id => id !== tid);
        if (p.tags.length !== prevLen) { p.updatedAt = now; supabaseUpdate('projects', p.id, { tags: p.tags, updated_at: now }); }
      });
      s.tasks.forEach(t => {
        const prevLen = t.tags?.length ?? 0;
        t.tags = (t.tags ?? []).filter(id => id !== tid);
        if (t.tags.length !== prevLen) { t.updatedAt = now; supabaseUpdate('tasks', t.id, { tags: t.tags, updated_at: now }); }
      });
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
      s.goals.forEach(g => { if (g.category === cid) { g.category = ''; g.updatedAt = now; supabaseUpdate('goals', g.id, { category: '', updated_at: now }); } });
      s.projects.forEach(p => { if (p.category === cid) { p.category = ''; p.updatedAt = now; supabaseUpdate('projects', p.id, { category: '', updated_at: now }); } });
      s.tasks.forEach(t => { if (t.category === cid) { t.category = ''; t.updatedAt = now; supabaseUpdate('tasks', t.id, { category: '', updated_at: now }); } });
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
