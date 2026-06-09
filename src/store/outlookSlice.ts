/**
 * Outlook Store Slice
 *
 * 管理 outlookCalendarEvents 和 outlookMailSummary 的 reducer 逻辑。
 * 采用与项目其他 slice 相同的模式（返回 null 表示不处理）。
 */

import type { AppState, OutlookCalendarEvent, OutlookMailSummary } from '@/types';
import type { Action } from '../types';
import { needMutate, reducerCanDelete } from './shared';

export function outlookReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'SET_OUTLOOK_CALENDAR_EVENTS': {
      const s = needMutate(state, ['outlookCalendarEvents']);
      s.outlookCalendarEvents = action.payload as OutlookCalendarEvent[];
      return s;
    }

    case 'MERGE_OUTLOOK_CALENDAR_EVENTS': {
      const incoming = action.payload as OutlookCalendarEvent[];
      const existingMap = new Map(state.outlookCalendarEvents.map(e => [e.id, e]));
      for (const evt of incoming) {
        existingMap.set(evt.id, evt);
      }
      const s = needMutate(state, ['outlookCalendarEvents']);
      s.outlookCalendarEvents = Array.from(existingMap.values());
      return s;
    }

    case 'DELETE_OUTLOOK_CALENDAR_EVENTS': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const idsToDelete = new Set(action.payload as string[]);
      const s = needMutate(state, ['outlookCalendarEvents']);
      s.outlookCalendarEvents = s.outlookCalendarEvents.filter(e => !idsToDelete.has(e.id));
      return s;
    }

    case 'LINK_OUTLOOK_CALENDAR_EVENT': {
      const { eventId, itemId, itemType } = action.payload as { eventId: string; itemId: string; itemType: 'task' | 'goal' | 'project' };
      const idx = state.outlookCalendarEvents.findIndex(e => e.id === eventId);
      if (idx < 0) return state;
      const s = needMutate(state, ['outlookCalendarEvents']);
      s.outlookCalendarEvents[idx] = { ...s.outlookCalendarEvents[idx], linkedItemId: itemId, linkedItemType: itemType };
      return s;
    }

    case 'SET_OUTLOOK_MAIL_SUMMARY': {
      const s = needMutate(state, ['outlookMailSummary']);
      s.outlookMailSummary = action.payload as OutlookMailSummary[];
      return s;
    }

    case 'MERGE_OUTLOOK_MAIL_SUMMARY': {
      const incoming = action.payload as OutlookMailSummary[];
      const existingMap = new Map(state.outlookMailSummary.map(m => [m.id, m]));
      for (const mail of incoming) {
        existingMap.set(mail.id, mail);
      }
      const s = needMutate(state, ['outlookMailSummary']);
      s.outlookMailSummary = Array.from(existingMap.values());
      return s;
    }

    case 'LINK_OUTLOOK_MAIL': {
      const { mailId, itemId, itemType } = action.payload as { mailId: string; itemId: string; itemType: 'task' | 'goal' | 'project' };
      const idx = state.outlookMailSummary.findIndex(m => m.id === mailId);
      if (idx < 0) return state;
      const s = needMutate(state, ['outlookMailSummary']);
      s.outlookMailSummary[idx] = { ...s.outlookMailSummary[idx], linkedItemId: itemId, linkedItemType: itemType };
      return s;
    }

    case 'CLEAR_OUTLOOK_DATA': {
      const s = needMutate(state, ['outlookCalendarEvents', 'outlookMailSummary']);
      s.outlookCalendarEvents = [];
      s.outlookMailSummary = [];
      return s;
    }

    default:
      return null;
  }
}
