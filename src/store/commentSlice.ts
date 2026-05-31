import type { AppState } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete } from './supabase';
import { genId } from './utils';
import { canDeleteOwnContent, needMutate, clampComment, markPendingDelete } from './shared';

export function commentReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'ADD_COMMENT': {
      if (!state.currentUser) return state;
      const s = needMutate(state, ['comments', 'notifications']);
      const comment = { ...action.payload, id: genId('c'), createdAt: new Date().toISOString(), content: clampComment(action.payload.content) };
      supabaseInsert('comments', comment);
      s.comments.push(comment);
      const mentionedIds: string[] = comment.mentionedMemberIds ?? [];
      if (mentionedIds.length > 0) {
        const itemName = (state.goals.find(g => g.id === comment.itemId) || state.projects.find(p => p.id === comment.itemId) || state.tasks.find(t => t.id === comment.itemId))?.title || '事项';
        for (const mid of mentionedIds) {
          if (mid === state.currentUser.id) continue;
          s.notifications.unshift({
            id: genId('n'), type: 'mentioned', title: '有人@了你',
            message: `${state.currentUser.name} 在「${itemName}」中提及了你`,
            relatedId: comment.itemId, relatedType: comment.itemType,
            memberId: mid, read: false, createdAt: new Date().toISOString(),
          });
        }
      }
      return s;
    }
    case 'DELETE_COMMENT': {
      if (!state.currentUser) return state;
      const commentObj = (state.comments ?? []).find(c => c.id === action.payload);
      if (!canDeleteOwnContent(state, commentObj?.memberId)) return state;
      const s = needMutate(state, ['comments']);
      markPendingDelete(action.payload);
      supabaseDelete('comments', action.payload);
      s.comments = s.comments.filter(c => c.id !== action.payload);
      return s;
    }
    case 'UPDATE_COMMENT': {
      if (!state.currentUser) return state;
      const commentObj = (state.comments ?? []).find(c => c.id === action.payload.id);
      if (!canDeleteOwnContent(state, commentObj?.memberId)) return state;
      const s = needMutate(state, ['comments']);
      s.comments = s.comments.map(c => c.id === action.payload.id ? { ...c, ...action.payload.updates } : c);
      supabaseUpdate('comments', action.payload.id, action.payload.updates);
      return s;
    }
  }
  return null;
}
