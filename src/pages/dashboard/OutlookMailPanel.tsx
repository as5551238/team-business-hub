/**
 * Outlook 邮件摘要面板
 *
 * 显示在 Dashboard 侧边栏，展示最近未读邮件，
 * 支持一键「转为任务」。
 */

import { useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { Mail, ExternalLink, ArrowRight, Star, Paperclip, RefreshCw } from 'lucide-react';
import { mailToTaskTitle, mailToTaskDescription } from '@/lib/outlook/mailSync';
import { getConnectionStatus } from '@/lib/outlook/tokenManager';
import { fetchMailSummary } from '@/lib/outlook/mailSync';
import { GraphApiError } from '@/lib/outlook/graphClient';
import { handleError } from '@/lib/errorHandler';

export function OutlookMailPanel() {
  const { state, dispatch } = useStore();
  const mails = state.outlookMailSummary || [];
  const [syncing, setSyncing] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const connectionStatus = getConnectionStatus();
  if (!connectionStatus.connected) return null;

  const unreadMails = mails.filter(m => !m.isRead);
  const displayMails = unreadMails.length > 0 ? unreadMails : mails.slice(0, 5);

  const handleSync = useCallback(async () => {
    if (!state.currentUser) return;
    setSyncing(true);
    try {
      const newMails = await fetchMailSummary(state.currentUser.id, 20, true);
      dispatch({ type: 'SET_OUTLOOK_MAIL_SUMMARY', payload: newMails });
    } catch (e) {
      handleError(e, { module: 'OutlookMailPanel', operation: 'SYNC', severity: 'warning' });
    }
    setSyncing(false);
  }, [state.currentUser, dispatch]);

  const handleConvertToTask = useCallback((mailId: string) => {
    const mail = mails.find(m => m.id === mailId);
    if (!mail || !state.currentUser) return;
    setConvertingId(mailId);
    try {
      dispatch({
        type: 'ADD_TASK',
        payload: {
          title: mailToTaskTitle(mail),
          description: mailToTaskDescription(mail),
          status: 'todo',
          priority: mail.importance === 'high' ? 'high' : mail.importance === 'low' ? 'low' : 'medium',
          leaderId: state.currentUser.id,
          tags: ['邮件'],
          subtasks: [],
          attachments: [],
          trackingRecords: [],
          supporterIds: [],
          category: '',
          repeatCycle: 'none',
          summary: `来自 ${mail.senderName} 的邮件`,
          parentId: null,
          startDate: null,
          dueDate: null,
          reminderDate: null,
          completedAt: null,
          goalId: null,
          projectId: null,
          blockedBy: [],
          sprintId: null,
        },
      });
      dispatch({ type: 'LINK_OUTLOOK_MAIL', payload: { mailId, itemId: mail.id, itemType: 'task' } });
    } catch (e) {
      handleError(e, { module: 'OutlookMailPanel', operation: 'CONVERT', severity: 'warning' });
    }
    setConvertingId(null);
  }, [mails, state.currentUser, dispatch]);

  const importanceColor: Record<string, string> = {
    high: 'text-red-500',
    low: 'text-gray-400',
    normal: '',
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-orange-500" />
          <span className="text-sm font-semibold">Outlook 邮件</span>
          {unreadMails.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">{unreadMails.length} 未读</span>
          )}
        </div>
        <button onClick={handleSync} disabled={syncing} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary" aria-label="同步邮件">
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
        </button>
      </div>

      {displayMails.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">暂无邮件，点击刷新同步</div>
      ) : (
        <div className="divide-y divide-border">
          {displayMails.map(mail => (
            <div key={mail.id} className="px-4 py-2.5 hover:bg-muted/30 transition-colors">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className={`text-xs font-medium truncate ${!mail.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>{mail.subject}</span>
                    {mail.importance === 'high' && <Star size={10} className="text-red-500 flex-shrink-0" />}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{mail.senderName} · {new Date(mail.receivedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {mail.hasAttachments && <Paperclip size={10} className="text-muted-foreground" />}
                  {!mail.isRead && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                {mail.outlookLink && (
                  <a href={mail.outlookLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                    <ExternalLink size={10} /> 打开
                  </a>
                )}
                <button
                  onClick={() => handleConvertToTask(mail.id)}
                  disabled={convertingId === mail.id}
                  className="text-[10px] text-orange-600 hover:text-orange-800 flex items-center gap-0.5 disabled:opacity-50"
                >
                  <ArrowRight size={10} /> {convertingId === mail.id ? '转换中...' : '转任务'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
