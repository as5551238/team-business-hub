/**
 * NotificationSystem — 提醒/逾期/微信推送逻辑
 * 从 Layout.tsx 抽出的 effect 组件（无渲染，纯副作用）
 */
import { useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { useMemberLookup } from '@/store/hooks';
import { handleError } from '@/lib/errorHandler';
import { pushTaskEvent } from '@/lib/pushEventEngine';
import { requestNotificationPermission, sendBrowserNotification, isNotificationSupported } from '@/lib/browserNotify';
import { isWeChatEnabled, sendWeChatMessage } from '@/supabase/wechat';
import { setWeChatNotify, fireAutomationRules } from '@/store/shared';
import { CURRENT_USER_KEY } from '@/store/types';

interface NotificationSystemProps {
  userId: string | undefined;
}

export default function NotificationSystem({ userId }: NotificationSystemProps) {
  const { state, dispatch } = useStore();
  const memberLookup = useMemberLookup();
  const tasksRef = useRef(state.tasks);
  tasksRef.current = state.tasks;
  const notifsRef = useRef(state.notifications);
  notifsRef.current = state.notifications;

  // Reminder checker: every 60s
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const nowISO = now.toISOString();
      const existingKeys = new Set(notifsRef.current.map(n => n.relatedId + ':' + n.type));
      for (const t of tasksRef.current) {
        if (!t.reminderDate || t.status === 'done' || t.status === 'cancelled') continue;
        if (t.leaderId !== userId && !(t.supporterIds ?? []).includes(userId || '')) continue;
        const reminderTime = t.reminderDate.includes('T') ? new Date(t.reminderDate).toISOString() : t.reminderDate + 'T23:59:59.999Z';
        if (reminderTime <= nowISO) {
          const key = t.id + ':reminder';
          if (existingKeys.has(key)) continue;
          const displayTime = t.reminderDate.includes('T') ? t.reminderDate.replace('T', ' ') : t.reminderDate;
          dispatch({ type: 'ADD_NOTIFICATION', payload: { id: 'nrem_' + t.id + '_' + t.reminderDate, type: 'reminder' as const, title: '任务提醒', message: `"${t.title}" 的提醒时间已到 (${displayTime})`, relatedId: t.id, relatedType: 'task' as const, memberId: userId || '', read: false, createdAt: new Date().toISOString() } });
          pushTaskEvent('reminder', t, memberLookup.getName);
        }
      }
    };
    checkReminders();
    const id = setInterval(checkReminders, 60000);
    return () => clearInterval(id);
  }, [dispatch, userId, memberLookup]);

  // Overdue + approaching deadline detection
  useEffect(() => {
    const checkDeadlines = () => {
      const today = new Date().toISOString().split('T')[0];
      const threeDaysLater = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
      const existingKeys = new Set(notifsRef.current.map(n => n.relatedId + ':' + n.type));
      for (const t of tasksRef.current) {
        if (t.status === 'done' || t.status === 'cancelled' || !t.dueDate) continue;
        if (t.leaderId !== userId && !(t.supporterIds ?? []).includes(userId || '')) continue;
        if (t.dueDate < today) {
          const key = t.id + ':overdue';
          if (existingKeys.has(key)) continue;
          dispatch({ type: 'ADD_NOTIFICATION', payload: { id: 'novd_' + t.id + '_' + t.dueDate, type: 'overdue' as const, title: '任务已逾期', message: `"${t.title}" 已逾期 (截止 ${t.dueDate})`, relatedId: t.id, relatedType: 'task' as const, memberId: userId || '', read: false, createdAt: new Date().toISOString() } });
          pushTaskEvent('overdue', t, memberLookup.getName);
          try { fireAutomationRules(state, t.id, 'task', t.title, 'due_arrive', { dueDate: t.dueDate }, t as Record<string, unknown>); } catch (e) { handleError(e, { module: 'NotifySys', operation: 'FIRE_AUTOMATION_DUE', severity: 'warn' }); }
          try { fireAutomationRules(state, t.id, 'task', t.title, 'overdue', { dueDate: t.dueDate, status: t.status }, t as Record<string, unknown>); } catch (e) { handleError(e, { module: 'NotifySys', operation: 'FIRE_AUTOMATION_OVERDUE', severity: 'warn' }); }
        } else if (t.dueDate <= threeDaysLater) {
          const daysLeft = Math.ceil((new Date(t.dueDate).getTime() - new Date(today).getTime()) / 86400000);
          const key = t.id + ':approaching';
          if (existingKeys.has(key)) continue;
          dispatch({ type: 'ADD_NOTIFICATION', payload: { id: 'napr_' + t.id + '_' + t.dueDate, type: 'sync' as const, title: '任务即将到期', message: `"${t.title}" 将于 ${t.dueDate} 到期（还有${daysLeft}天）`, relatedId: t.id, relatedType: 'task' as const, memberId: userId || '', read: false, createdAt: new Date().toISOString() } });
          try { sendBrowserNotification('任务即将到期', { body: `"${t.title}" 将于${t.dueDate}到期（还有${daysLeft}天）`, tag: 'approaching-' + t.id }); } catch (e) { handleError(e, { module: 'NotifySys', operation: 'BROWSER_NOTIFY', severity: 'debug' }); }
          pushTaskEvent('reminder', t, memberLookup.getName);
        }
      }
    };
    checkDeadlines();
    const id = setInterval(checkDeadlines, 60000);
    return () => clearInterval(id);
  }, [dispatch, userId, memberLookup, state]);

  // Request notification permission + register WeChat bridge
  useEffect(() => {
    if (isNotificationSupported()) requestNotificationPermission();
    setWeChatNotify((title, message) => {
      if (isWeChatEnabled()) sendWeChatMessage(`**${title}**\n${message}`).catch(() => {});
      if (isNotificationSupported()) sendBrowserNotification(title, { body: message, tag: `auto-${Date.now()}`, data: { url: '/' } });
    });
    return () => setWeChatNotify(() => {});
  }, []);

  return null;
}
