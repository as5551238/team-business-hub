/**
 * Outlook Mail Sync
 *
 * 从 Microsoft Graph API 拉取邮件摘要（仅元数据，不存正文）。
 * 支持增量同步和未读筛选。
 */

import { graphRequest, GraphApiError } from './graphClient';
import type { OutlookMailSummary } from '@/types';
import { handleError } from '@/lib/errorHandler';

const MAIL_DELTA_KEY = 'tbh-outlook-mail-delta';

// ===== Graph API 原始类型 =====

interface GraphMailMessage {
  id: string;
  subject: string;
  sender: { emailAddress: { name: string; address: string } } | null;
  receivedDateTime: string;
  isRead: boolean;
  importance: 'low' | 'normal' | 'high';
  hasAttachments: boolean;
  webLink: string;
  bodyPreview: string;
  etag: string;
}

// ===== 转换函数 =====

function graphMailToLocal(msg: GraphMailMessage, memberId: string): OutlookMailSummary {
  return {
    id: msg.id,
    memberId,
    subject: msg.subject || '(无主题)',
    senderName: msg.sender?.emailAddress?.name || '',
    senderEmail: msg.sender?.emailAddress?.address || '',
    receivedAt: msg.receivedDateTime,
    isRead: msg.isRead,
    importance: msg.importance || 'normal',
    hasAttachments: msg.hasAttachments,
    outlookLink: msg.webLink || null,
    linkedItemId: null,
    linkedItemType: null,
    etag: msg.etag || null,
    lastSyncedAt: new Date().toISOString(),
  };
}

// ===== 拉取最近邮件 =====

/**
 * 拉取最近邮件摘要。
 * @param top 返回数量，默认 20
 * @param unreadOnly 仅未读，默认 false
 */
export async function fetchMailSummary(
  memberId: string,
  top: number = 20,
  unreadOnly: boolean = false,
): Promise<OutlookMailSummary[]> {
  try {
    const filterParts: string[] = [];
    if (unreadOnly) filterParts.push('isRead eq false');

    const data = await graphRequest<{ value: GraphMailMessage[] }>({
      path: '/me/messages',
      params: {
        '$select': 'id,subject,sender,receivedDateTime,isRead,importance,hasAttachments,webLink,bodyPreview',
        '$top': String(Math.min(top, 50)),
        '$orderby': 'receivedDateTime desc',
        ...(filterParts.length > 0 ? { '$filter': filterParts.join(' and ') } : {}),
      },
    });

    return (data.value || []).map(msg => graphMailToLocal(msg, memberId));
  } catch (err) {
    if (err instanceof GraphApiError && err.statusCode === 401) {
      throw err;
    }
    handleError(err, { module: 'outlook/mailSync', operation: 'FETCH', severity: 'warning' });
    return [];
  }
}

// ===== 邮件转任务辅助 =====

/**
 * 生成 "转为任务" 时预填的任务标题。
 * 格式: [邮件] 主题 - 发件人
 */
export function mailToTaskTitle(mail: OutlookMailSummary): string {
  const sender = mail.senderName || mail.senderEmail || '未知发件人';
  return `[邮件] ${mail.subject} - ${sender}`;
}

/**
 * 生成任务描述（含邮件链接）。
 */
export function mailToTaskDescription(mail: OutlookMailSummary): string {
  const lines: string[] = [];
  lines.push(`**发件人**: ${mail.senderName} <${mail.senderEmail}>`);
  lines.push(`**时间**: ${new Date(mail.receivedAt).toLocaleString('zh-CN')}`);
  lines.push(`**重要性**: ${mail.importance}`);
  if (mail.outlookLink) {
    lines.push(`[在 Outlook 中查看](${mail.outlookLink})`);
  }
  return lines.join('\n');
}
