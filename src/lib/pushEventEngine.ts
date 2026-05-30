/**
 * 事件自动推送引擎 — 通知事件自动同步到外部渠道
 *
 * Round 6 — 生态集成深度 +2
 * - 监听 dispatch 事件，自动触发 IM 推送 + Zapier webhook
 * - 支持事件过滤和去重
 * - 与现有 AutomationRule 系统协同
 */
import { pushNotification, triggerZapierWebhook, getPushConfigs, formatTaskNotification } from './pushConnector';
import type { PushMessage } from './pushConnector';

// ===== 渠道类型 =====

export type NotificationChannel = 'sw' | 'wechat_work' | 'dingtalk' | 'feishu' | 'webhook' | 'email' | 'in-app';

// ===== 事件类型 =====

export type PushEventType =
  | 'task.created' | 'task.updated' | 'task.completed' | 'task.overdue' | 'task.reminder'
  | 'goal.created' | 'goal.updated' | 'goal.completed'
  | 'risk.alert'
  | 'member.mentioned';

export interface PushEvent {
  type: PushEventType;
  title: string;
  content: string;
  url?: string;
  mentionedList?: string[];
  data?: Record<string, unknown>;
}

export interface AiPushEvent {
  type: 'risk_alert' | 'delay_warning' | 'resource_bottleneck' | 'alignment_health' | 'kr_progress';
  title: string;
  body: string;
  targetId: string;
  targetType: 'goal' | 'project' | 'task';
  priority: 'high' | 'medium' | 'low';
}

// ===== 事件过滤配置 =====

const PUSH_CONFIG_KEY = 'tbh-push-events';

interface PushEventConfig {
  enabled: boolean;
  channels: string[];  // 备用：指定推送到哪些渠道，空=全部
  minLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

const DEFAULT_EVENT_CONFIG: Record<PushEventType, PushEventConfig> = {
  'task.created': { enabled: true, channels: [], minLevel: 'none' },
  'task.updated': { enabled: false, channels: [], minLevel: 'none' },
  'task.completed': { enabled: true, channels: [], minLevel: 'none' },
  'task.overdue': { enabled: true, channels: [], minLevel: 'high' },
  'task.reminder': { enabled: true, channels: [], minLevel: 'medium' },
  'goal.created': { enabled: true, channels: [], minLevel: 'none' },
  'goal.updated': { enabled: false, channels: [], minLevel: 'none' },
  'goal.completed': { enabled: true, channels: [], minLevel: 'none' },
  'risk.alert': { enabled: true, channels: [], minLevel: 'high' },
  'member.mentioned': { enabled: true, channels: [], minLevel: 'none' },
};

export function loadPushEventConfigs(): Record<PushEventType, PushEventConfig> {
  try {
    const stored = localStorage.getItem(PUSH_CONFIG_KEY);
    if (stored) return { ...DEFAULT_EVENT_CONFIG, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_EVENT_CONFIG };
}

export function savePushEventConfigs(configs: Record<PushEventType, PushEventConfig>) {
  try {
    localStorage.setItem(PUSH_CONFIG_KEY, JSON.stringify(configs));
  } catch {}
}

// ===== 去重机制 =====

const recentEvents = new Map<string, number>();
const DEDUP_WINDOW_MS = 30000; // 30秒内同一事件不重复推送

function isDuplicate(eventKey: string): boolean {
  const now = Date.now();
  const last = recentEvents.get(eventKey);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  recentEvents.set(eventKey, now);
  // 清理过期条目
  if (recentEvents.size > 200) {
    for (const [k, v] of recentEvents) {
      if (now - v > DEDUP_WINDOW_MS) recentEvents.delete(k);
    }
  }
  return false;
}

// ===== 推送调度 =====

const LEVEL_PRIORITY: Record<string, number> = {
  none: 0, low: 1, medium: 2, high: 3, critical: 4,
};

const LEVEL_MAP: Record<string, number> = {
  none: 0, low: 1, medium: 2, high: 3, critical: 4,
};

/**
 * 统一事件推送入口 — 任何组件/模块调用此函数触发外部推送
 */
export async function dispatchPushEvent(event: PushEvent): Promise<void> {
  const configs = loadPushEventConfigs();
  const eventCfg = configs[event.type];
  if (!eventCfg || !eventCfg.enabled) return;

  // 去重
  const eventKey = `${event.type}:${event.data?.id || event.title}`;
  if (isDuplicate(eventKey)) return;

  // 构建 PushMessage
  const msg: PushMessage = {
    title: event.title,
    content: event.content,
    url: event.url,
    mentionedList: event.mentionedList,
  };

  // IM 推送（所有已启用的渠道）
  const pushConfigs = getPushConfigs().filter(c => c.enabled);
  if (pushConfigs.length > 0) {
    try {
      await pushNotification(msg);
    } catch {}
  }

  // Zapier/n8n 推送
  try {
    await triggerZapierWebhook({
      type: event.type,
      data: event.data || {},
    });
  } catch {}
}

// ===== 预设快捷函数 =====

export function pushTaskEvent(
  type: 'created' | 'updated' | 'completed' | 'overdue' | 'reminder',
  task: { id: string; title: string; status: string; leaderId: string; dueDate?: string },
  getName: (id: string) => string,
) {
  const statusMap: Record<string, string> = { todo: '待处理', in_progress: '进行中', done: '已完成', blocked: '已阻塞' };
  const titleMap: Record<string, string> = {
    created: '新任务创建',
    updated: '任务状态更新',
    completed: '任务已完成',
    overdue: '任务已逾期',
    reminder: '任务即将到期',
  };
  dispatchPushEvent({
    type: `task.${type}` as PushEventType,
    title: titleMap[type] || '任务通知',
    content: `${task.title}\n状态: ${statusMap[task.status] || task.status}\n负责人: ${getName(task.leaderId)}${task.dueDate ? `\n截止日: ${task.dueDate}` : ''}`,
    data: { id: task.id, title: task.title, status: task.status, leaderId: task.leaderId },
  });
}

export function pushGoalEvent(
  type: 'created' | 'updated' | 'completed',
  goal: { id: string; title: string; status: string },
) {
  const titleMap: Record<string, string> = {
    created: '新目标创建',
    updated: '目标状态更新',
    completed: '目标已达成',
  };
  dispatchPushEvent({
    type: `goal.${type}` as PushEventType,
    title: titleMap[type] || '目标通知',
    content: `${goal.title}\n状态: ${goal.status}`,
    data: { id: goal.id, title: goal.title, status: goal.status },
  });
}

export function pushRiskAlert(
  level: string,
  message: string,
  action: string,
  data?: Record<string, unknown>,
) {
  dispatchPushEvent({
    type: 'risk.alert',
    title: `风险预警 [${level}]`,
    content: `${message}\n建议: ${action}`,
    data,
  });
}

// ===== Service Worker 推送 =====

function sendSwPush(title: string, body: string, url?: string): void {
  try {
    if (!('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;
    if (!sw.controller) return;
    if (Notification.permission !== 'granted') return;
    sw.controller.postMessage({
      type: 'PUSH_NOTIFICATION',
      payload: { title, body, url },
    });
  } catch {}
}

function isSwAvailable(): boolean {
  return ('serviceWorker' in navigator)
    && !!navigator.serviceWorker.controller
    && Notification.permission === 'granted';
}

// ===== AI 智能推送 =====

const AI_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const aiRecentEvents = new Map<string, number>();

function isAiDuplicate(key: string): boolean {
  const now = Date.now();
  const last = aiRecentEvents.get(key);
  if (last && now - last < AI_DEDUP_WINDOW_MS) return true;
  aiRecentEvents.set(key, now);
  if (aiRecentEvents.size > 500) {
    for (const [k, v] of aiRecentEvents) {
      if (now - v > AI_DEDUP_WINDOW_MS) aiRecentEvents.delete(k);
    }
  }
  return false;
}

export function dispatchAiPushEvent(event: AiPushEvent): void {
  const dedupKey = `${event.type}:${event.targetId}`;
  if (isAiDuplicate(dedupKey)) return;

  const pushEvent: PushEvent = {
    type: 'risk.alert',
    title: event.title,
    content: event.body,
    url: `/${event.targetType}/${event.targetId}`,
    data: {
      aiType: event.type,
      targetId: event.targetId,
      targetType: event.targetType,
      priority: event.priority,
    },
  };

  switch (event.priority) {
    case 'high':
      if (isSwAvailable()) sendSwPush(event.title, event.body, pushEvent.url);
      dispatchPushEvent(pushEvent);
      break;
    case 'medium':
      dispatchPushEvent(pushEvent);
      break;
    case 'low':
      break;
  }
}
