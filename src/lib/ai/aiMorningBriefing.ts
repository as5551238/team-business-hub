/**
 * 晨间聚焦模板生成器
 * 
 * 每日8:00自动推送，包含：
 * - 今日聚焦任务（逾期+到期+高优先级）
 * - 目标进度快照
 * - 团队动态摘要
 * - AI建议优先处理事项
 */

import type { AppAction, AppState } from '@/store/types';
import { callLLM } from '@/lib/ai/llmService';
import { collectSnapshot } from '@/lib/ai/dataCollector';
import { detectRisks } from '@/lib/ai/analysisEngine';

export interface MorningBriefing {
  date: string;
  greeting: string;
  focusItems: FocusItem[];
  goalSnapshot: GoalSnapshot[];
  teamActivity: TeamActivitySummary;
  riskAlerts: RiskAlert[];
  aiSuggestion: string;
  generatedAt: number;
}

export interface FocusItem {
  id: string;
  title: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  reason: 'overdue' | 'due-today' | 'high-priority' | 'stalled';
  assignee?: string;
}

export interface GoalSnapshot {
  id: string;
  title: string;
  progress: number;
  trend: 'up' | 'down' | 'stable';
}

export interface TeamActivitySummary {
  completedToday: number;
  completedThisWeek: number;
  activeMembers: number;
  totalMembers: number;
}

export interface RiskAlert {
  itemId: string;
  itemTitle: string;
  riskType: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
}

// ===== 本地生成（无需LLM） =====

export function generateMorningBriefingLocal(state: AppState): MorningBriefing {
  const today = new Date().toISOString().split('T')[0];
  const tasks = Object.values(state.tasks);
  const goals = Object.values(state.goals);
  const members = Object.values(state.members);

  // 聚焦项：逾期 → 到期 → 高优先级
  const focusItems: FocusItem[] = [];

  const overdueTasks = tasks.filter(t =>
    t.status !== 'done' && t.status !== 'cancelled' &&
    t.dueDate && t.dueDate < today
  );
  for (const t of overdueTasks.slice(0, 5)) {
    focusItems.push({
      id: t.id,
      title: t.title,
      priority: 'urgent',
      reason: 'overdue',
      assignee: members.find(m => m.id === t.leaderId)?.name,
    });
  }

  const dueTodayTasks = tasks.filter(t =>
    t.status !== 'done' && t.status !== 'cancelled' &&
    t.dueDate === today
  );
  for (const t of dueTodayTasks.slice(0, 3)) {
    focusItems.push({
      id: t.id,
      title: t.title,
      priority: 'high',
      reason: 'due-today',
      assignee: members.find(m => m.id === t.leaderId)?.name,
    });
  }

  const highPriorityActive = tasks.filter(t =>
    t.status === 'in-progress' && (t.priority === 'A' || t.priority === 'S') &&
    !overdueTasks.includes(t) && !dueTodayTasks.includes(t)
  );
  for (const t of highPriorityActive.slice(0, 2)) {
    focusItems.push({
      id: t.id,
      title: t.title,
      priority: 'medium',
      reason: 'high-priority',
      assignee: members.find(m => m.id === t.leaderId)?.name,
    });
  }

  // 目标快照
  const goalSnapshot: GoalSnapshot[] = goals
    .filter(g => g.status === 'in-progress')
    .slice(0, 3)
    .map(g => ({
      id: g.id,
      title: g.title,
      progress: g.progress || 0,
      trend: (g.progress || 0) >= 50 ? 'up' as const : (g.progress || 0) < 20 ? 'down' as const : 'stable' as const,
    }));

  // 团队活动
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const completedToday = tasks.filter(t =>
    t.status === 'done' && t.updatedAt && new Date(t.updatedAt) >= todayStart
  ).length;
  const completedThisWeek = tasks.filter(t =>
    t.status === 'done' && t.updatedAt && new Date(t.updatedAt) >= weekStart
  ).length;
  const activeMembers = members.filter(m => m.status === 'active').length;

  // 风险检测
  const snap = collectSnapshot(state, 'daily');
  const risks = detectRisks(snap);
  const riskAlerts: RiskAlert[] = risks.slice(0, 3).map(r => ({
    itemId: r.relatedItemId || '',
    itemTitle: r.title,
    riskType: r.type,
    severity: r.severity as 'critical' | 'high' | 'medium',
    description: r.description,
  }));

  // 问候语
  const hour = new Date().getHours();
  const greeting = hour < 12
    ? '早上好！新的一天开始了'
    : hour < 18
      ? '下午好！继续加油'
      : '晚上好！今天辛苦了';

  // AI建议（本地版）
  const aiSuggestion = generateLocalSuggestion(focusItems, riskAlerts, goalSnapshot);

  return {
    date: today,
    greeting,
    focusItems,
    goalSnapshot,
    teamActivity: {
      completedToday,
      completedThisWeek,
      activeMembers,
      totalMembers: members.length,
    },
    riskAlerts,
    aiSuggestion,
    generatedAt: Date.now(),
  };
}

function generateLocalSuggestion(
  focusItems: FocusItem[],
  riskAlerts: RiskAlert[],
  goalSnapshot: GoalSnapshot[]
): string {
  const parts: string[] = [];

  if (focusItems.some(f => f.reason === 'overdue')) {
    const overdueCount = focusItems.filter(f => f.reason === 'overdue').length;
    parts.push(`有${overdueCount}项逾期任务需优先处理`);
  }

  if (riskAlerts.length > 0) {
    parts.push(`检测到${riskAlerts.length}个风险警报，建议关注`);
  }

  const lowProgressGoals = goalSnapshot.filter(g => g.progress < 30);
  if (lowProgressGoals.length > 0) {
    parts.push(`有${lowProgressGoals.length}个目标进度偏低（<30%），建议调整资源`);
  }

  if (parts.length === 0) {
    parts.push('今日无紧急事项，适合推进中长期目标');
  }

  return parts.join('；') + '。';
}

// ===== LLM 增强版 =====

export async function generateMorningBriefingDeep(state: AppState): Promise<MorningBriefing> {
  const local = generateMorningBriefingLocal(state);

  try {
    const contextStr = JSON.stringify({
      focusItems: local.focusItems.map(f => ({ title: f.title, reason: f.reason, priority: f.priority })),
      goalSnapshot: local.goalSnapshot,
      riskAlerts: local.riskAlerts.map(r => ({ title: r.itemTitle, severity: r.severity })),
      teamActivity: local.teamActivity,
    });

    const prompt = `你是团队管理AI助手，根据今日数据生成简洁有力的晨间聚焦建议。
要求：
1. 100字以内
2. 直接给出可执行建议，不要客套话
3. 优先处理逾期和风险项
4. 语气专业简洁

数据：
${contextStr}`;

    const aiSuggestion = await callLLM(prompt, {
      model: 'deepseek-chat',
      temperature: 0.3,
      max_tokens: 200,
    });

    if (aiSuggestion && aiSuggestion.trim()) {
      local.aiSuggestion = aiSuggestion.trim();
    }
  } catch {
    // LLM 失败时保留本地建议
  }

  return local;
}
