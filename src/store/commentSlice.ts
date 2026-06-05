import type { AppState } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete } from './supabase';
import { genId } from './utils';
import { canDeleteOwnContent, needMutate, clampComment, markPendingDelete, tsNow } from './shared';
import { cascadeAddComment } from './cascadeHandlers';

export function commentReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'ADD_COMMENT': {
      if (!state.currentUser) return state;
      const s = needMutate(state, ['comments', 'notifications']);
      // Enforce 2-level threading: replies can only target top-level comments (no parentId)
      const parentId = action.payload.parentId;
      if (parentId) {
        const parent = s.comments.find(c => c.id === parentId);
        // If parent itself has a parentId, it's a reply — can't nest deeper
        if (!parent || parent.parentId) {
          // Fall back to top-level comment (strip parentId)
          const comment = { ...action.payload, parentId: undefined, id: genId('c'), createdAt: new Date().toISOString(), content: clampComment(action.payload.content) };
          supabaseInsert('comments', comment);
          s.comments.push(comment);
          cascadeAddComment(s, comment, state.currentUser);
          return s;
        }
      }
      const comment = { ...action.payload, id: genId('c'), createdAt: new Date().toISOString(), content: clampComment(action.payload.content) };
      supabaseInsert('comments', comment);
      s.comments.push(comment);
      cascadeAddComment(s, comment, state.currentUser);
      return s;
    }
    case 'DELETE_COMMENT': {
      if (!state.currentUser) return state;
      const commentObj = (state.comments ?? []).find(c => c.id === action.payload);
      if (!canDeleteOwnContent(state, commentObj?.memberId)) return state;
      const s = needMutate(state, ['comments']);
      markPendingDelete(action.payload);
      supabaseDelete('comments', action.payload);
      // Cascade delete child replies (2-level: only direct children)
      const childIds = s.comments.filter(c => c.parentId === action.payload).map(c => c.id);
      for (const cid of childIds) {
        markPendingDelete(cid);
        supabaseDelete('comments', cid);
      }
      const deleteIds = new Set([action.payload, ...childIds]);
      s.comments = s.comments.filter(c => !deleteIds.has(c.id));
      return s;
    }
    case 'UPDATE_COMMENT': {
      if (!state.currentUser) return state;
      const commentObj = (state.comments ?? []).find(c => c.id === action.payload.id);
      // isRead updates should always be allowed (reading others' comments is not content modification)
      const isReadToggle = action.payload.updates && 'isRead' in action.payload.updates && Object.keys(action.payload.updates).length === 1;
      if (!isReadToggle && !canDeleteOwnContent(state, commentObj?.memberId)) return state;
      const s = needMutate(state, ['comments']);
      const old = s.comments.find(c => c.id === action.payload.id);
      s.comments = s.comments.map(c => c.id === action.payload.id ? { ...c, ...action.payload.updates, updatedAt: tsNow() } : c);
      supabaseUpdate('comments', action.payload.id, { ...action.payload.updates, updated_at: tsNow() }, old?.updatedAt);
      return s;
    }
  }
  return null;
}
