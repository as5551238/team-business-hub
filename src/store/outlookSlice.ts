/**
 * Outlook Store Slice
 *
 * 管理 outlookCalendarEvents 和 outlookMailSummary 的 reducer 逻辑。
 * 采用与项目其他 slice 相同的模式（返回 null 表示不处理）。
 */

import type { AppState, OutlookCalendarEvent, OutlookMailSummary } from '@/types';
import type { Action } from '../types';

export function outlookReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'SET_OUTLOOK_CALENDAR_EVENTS': {
      const s = { ...state, outlookCalendarEvents: action.payload as OutlookCalendarEvent[] };
      return s;
    }

    case 'MERGE_OUTLOOK_CALENDAR_EVENTS': {
      const incoming = action.payload as OutlookCalendarEvent[];
      const existingMap = new Map(state.outlookCalendarEvents.map(e => [e.id, e]));
      for (const evt of incoming) {
        existingMap.set(evt.id, evt); // LWW: 直接覆盖
      }
      return { ...state, outlookCalendarEvents: Array.from(existingMap.values()) };
    }

    case 'DELETE_OUTLOOK_CALENDAR_EVENTS': {
      const idsToDelete = new Set(action.payload as string[]);
      return { ...state, outlookCalendarEvents: state.outlookCalendarEvents.filter(e => !idsToDelete.has(e.id)) };
    }

    case 'LINK_OUTLOOK_CALENDAR_EVENT': {
      const { eventId, itemId, itemType } = action.payload as { eventId: string; itemId: string; itemType: 'task' | 'goal' | 'project' };
      const idx = state.outlookCalendarEvents.findIndex(e => e.id === eventId);
      if (idx < 0) return state;
      const updated = [...state.outlookCalendarEvents];
      updated[idx] = { ...updated[idx], linkedItemId: itemId, linkedItemType: itemType };
      return { ...state, outlookCalendarEvents: updated };
    }

    case 'SET_OUTLOOK_MAIL_SUMMARY': {
      return { ...state, outlookMailSummary: action.payload as OutlookMailSummary[] };
    }

    case 'MERGE_OUTLOOK_MAIL_SUMMARY': {
      const incoming = action.payload as OutlookMailSummary[];
      const existingMap = new Map(state.outlookMailSummary.map(m => [m.id, m]));
      for (const mail of incoming) {
        existingMap.set(mail.id, mail);
      }
      return { ...state, outlookMailSummary: Array.from(existingMap.values()) };
    }

    case 'LINK_OUTLOOK_MAIL': {
      const { mailId, itemId, itemType } = action.payload as { mailId: string; itemId: string; itemType: 'task' | 'goal' | 'project' };
      const idx = state.outlookMailSummary.findIndex(m => m.id === mailId);
      if (idx < 0) return state;
      const updated = [...state.outlookMailSummary];
      updated[idx] = { ...updated[idx], linkedItemId: itemId, linkedItemType: itemType };
      return { ...state, outlookMailSummary: updated };
    }

    case 'CLEAR_OUTLOOK_DATA': {
      return { ...state, outlookCalendarEvents: [], outlookMailSummary: [] };
    }

    default:
      return null;
  }
}
