/**
 * Outlook Calendar Sync
 *
 * 从 Microsoft Graph API 拉取日历事件，转为 OutlookCalendarEvent 存入 store。
 * 支持增量同步（delta query）和全量拉取。
 */

import { graphRequest, graphRequestAll, GraphApiError } from './graphClient';
import type { OutlookCalendarEvent } from '@/types';
import { handleError } from '@/lib/errorHandler';

const DELTA_TOKEN_KEY = 'tbh-outlook-calendar-delta';

// ===== Graph API 原始类型 =====

interface GraphDateTime {
  dateTime: string;
  timeZone: string;
}

interface GraphCalendarEvent {
  id: string;
  subject: string;
  bodyPreview: string;
  start: GraphDateTime;
  end: GraphDateTime;
  isAllDay: boolean;
  location: { displayName: string } | null;
  isRecurring: boolean;
  seriesMasterId: string | null;
  sensitivity: 'normal' | 'personal' | 'private' | 'confidential';
  webLink: string;
  etag: string;
}

// ===== 转换函数 =====

function graphEventToLocal(evt: GraphCalendarEvent, memberId: string): OutlookCalendarEvent {
  return {
    id: evt.id,
    memberId,
    subject: evt.subject || '(无主题)',
    bodyPreview: evt.bodyPreview || '',
    startTime: evt.start.dateTime,
    endTime: evt.end.dateTime,
    isAllDay: evt.isAllDay,
    location: evt.location?.displayName || '',
    isRecurring: evt.isRecurring,
    seriesMasterId: evt.seriesMasterId,
    sensitivity: evt.sensitivity || 'normal',
    outlookLink: evt.webLink || null,
    linkedItemId: null,
    linkedItemType: null,
    etag: evt.etag || null,
    lastSyncedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

// ===== 全量拉取 =====

/**
 * 拉取指定日期范围的日历事件。
 * 默认拉取最近 30 天 + 未来 30 天。
 */
export async function fetchCalendarEvents(
  memberId: string,
  startDate?: string,
  endDate?: string,
): Promise<OutlookCalendarEvent[]> {
  const now = new Date();
  const start = startDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end = endDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const data = await graphRequest<{ value: GraphCalendarEvent[] }>({
      path: '/me/calendarView',
      params: {
        startDateTime: start,
        endDateTime: end,
        '$select': 'id,subject,bodyPreview,start,end,isAllDay,location,isRecurring,seriesMasterId,sensitivity,webLink',
        '$top': '100',
        '$orderby': 'start/dateTime',
      },
    });

    const events = (data.value || []).map(evt => graphEventToLocal(evt, memberId));

    // 保存 delta token 供后续增量同步
    const deltaLink = (data as Record<string, unknown>)['@odata.deltaLink'] as string | undefined;
    if (deltaLink) {
      try { localStorage.setItem(DELTA_TOKEN_KEY, deltaLink); } catch (e) { /* ignore */ }
    }

    return events;
  } catch (err) {
    if (err instanceof GraphApiError && err.statusCode === 401) {
      throw err; // 401 交给上层处理
    }
    handleError(err, { module: 'outlook/calendarSync', operation: 'FETCH', severity: 'warning' });
    return [];
  }
}

// ===== 增量同步 =====

/**
 * 使用 delta query 增量拉取变更事件。
 * 如果没有 delta token，退回全量拉取。
 */
export async function syncCalendarDelta(memberId: string): Promise<{
  added: OutlookCalendarEvent[];
  updated: OutlookCalendarEvent[];
  deleted: string[];
}> {
  let deltaLink: string | null = null;
  try {
    deltaLink = localStorage.getItem(DELTA_TOKEN_KEY);
  } catch (e) { /* ignore */ }

  if (!deltaLink) {
    // 无 delta token，执行全量拉取
    const all = await fetchCalendarEvents(memberId);
    return { added: all, updated: [], deleted: [] };
  }

  try {
    const path = deltaLink.replace('https://graph.microsoft.com/v1.0', '');
    const data = await graphRequest<{ value: (GraphCalendarEvent & { '@removed'?: unknown })[] }>({
      path,
    });

    const added: OutlookCalendarEvent[] = [];
    const updated: OutlookCalendarEvent[] = [];
    const deleted: string[] = [];

    for (const evt of data.value || []) {
      if (evt['@removed']) {
        deleted.push(evt.id);
      } else {
        const local = graphEventToLocal(evt, memberId);
        // 新增还是更新由上层根据 id 判断
        added.push(local);
      }
    }

    // 更新 delta link
    const newDeltaLink = (data as Record<string, unknown>)['@odata.deltaLink'] as string | undefined;
    if (newDeltaLink) {
      try { localStorage.setItem(DELTA_TOKEN_KEY, newDeltaLink); } catch (e) { /* ignore */ }
    }

    return { added, updated, deleted };
  } catch (err) {
    if (err instanceof GraphApiError && err.statusCode === 410) {
      // delta token 过期，清除后全量拉取
      try { localStorage.removeItem(DELTA_TOKEN_KEY); } catch (e) { /* ignore */ }
      const all = await fetchCalendarEvents(memberId);
      return { added: all, updated: [], deleted: [] };
    }
    handleError(err, { module: 'outlook/calendarSync', operation: 'DELTA', severity: 'warning' });
    return { added: [], updated: [], deleted: [] };
  }
}

// ===== 获取未读邮件数 =====

export async function getUnreadCount(): Promise<number> {
  try {
    const data = await graphRequest<{ unreadItemCount: number }>({
      path: '/me/mailFolders/inbox',
      params: { '$select': 'unreadItemCount' },
    });
    return data.unreadItemCount ?? 0;
  } catch (err) {
    handleError(err, { module: 'outlook/calendarSync', operation: 'UNREAD_COUNT', severity: 'debug' });
    return 0;
  }
}
