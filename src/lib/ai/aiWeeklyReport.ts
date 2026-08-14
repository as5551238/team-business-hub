/**
 * 周报模板生成器
 * 
 * 每周五17:00自动生成，包含：
 * - 本周关键成果
 * - 目标达成率统计
 * - 团队贡献度排行
 * - 风险预警
 * - 下周重点建议
 */

import type { AppState } from '@/types';
import { callLLM } from '@/lib/ai/llmService';
import { collectSnapshot } from '@/lib/ai/dataCollector';
import { computeEfficiency, detectRisks } from '@/lib/ai/analysisEngine';

export interface WeeklyReport {
  periodStart: string;
  periodEnd: string;
  summary: string;
  keyAchievements: KeyAchievement[];
  goalProgress: GoalProgressItem[];
  memberContributions: MemberContribution[];
  riskSummary: WeeklyRiskSummary;
  nextWeekFocus: string;
  generatedAt: number;
}

export interface KeyAchievement {
  title: string;
  assignee: string;
  completedDate: string;
  impact: 'high' | 'medium' | 'low';
}

export interface GoalProgressItem {
  id: string;
  title: string;
  startProgress: number;
  endProgress: number;
  delta: number;
  status: 'on-track' | 'at-risk' | 'behind';
}

export interface MemberContribution {
  memberId: string;
  name: string;
  tasksCompleted: number;
  tasksCreated: number;
  onTimeRate: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
}

export interface WeeklyRiskSummary {
  totalRisks: number;
  criticalRisks: number;
  newRisks: Array<{ title: string; severity: string }>;
  resolvedCount: number;
}

// ===== 本地生成 =====

export function generateWeeklyReportLocal(state: AppState): WeeklyReport {
  const now = new Date();
  const weekEnd = new Date(now);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const tasks = Object.values(state.tasks);
  const goals = Object.values(state.goals);
  const members = Object.values(state.members);

  // 本周完成任务 → 关键成果
  const completedThisWeek = tasks.filter(t =>
    t.status === 'done' && t.updatedAt && new Date(t.updatedAt) >= weekStart
  );
  const keyAchievements: KeyAchievement[] = completedThisWeek.slice(0, 10).map(t => ({
    title: t.title,
    assignee: members.find(m => m.id === t.leaderId)?.name || '未指定',
    completedDate: t.updatedAt ? new Date(t.updatedAt).toISOString().split('T')[0] : '',
    impact: (t.priority === 'S' || t.priority === 'A') ? 'high' : t.priority === 'B' ? 'medium' as const : 'low' as const,
  }));

  // 目标进度
  const goalProgress: GoalProgressItem[] = goals
    .filter(g => g.status === 'in-progress')
    .slice(0, 5)
    .map(g => {
      const progress = g.progress || 0;
      const delta = progress; // 简化：使用当前进度作为本周增量
      return {
        id: g.id,
        title: g.title,
        startProgress: Math.max(0, progress - delta),
        endProgress: progress,
        delta,
        status: progress >= 60 ? 'on-track' as const : progress >= 30 ? 'at-risk' as const : 'behind' as const,
      };
    });

  // 成员贡献
  const memberContributions: MemberContribution[] = members
    .filter(m => m.status === 'active')
    .map(m => {
      const memberTasks = tasks.filter(t => t.leaderId === m.id);
      const completed = memberTasks.filter(t =>
        t.status === 'done' && t.updatedAt && new Date(t.updatedAt) >= weekStart
      ).length;
      const created = memberTasks.filter(t =>
        t.createdAt && new Date(t.createdAt) >= weekStart
      ).length;
      const withDueDate = memberTasks.filter(t =>
        t.status === 'done' && t.dueDate && t.updatedAt
      );
      const onTime = withDueDate.filter(t => t.updatedAt! <= t.dueDate!).length;
      const onTimeRate = withDueDate.length > 0 ? onTime / withDueDate.length : 0;

      let grade: 'S' | 'A' | 'B' | 'C' | 'D' = 'D';
      if (completed >= 5 && onTimeRate >= 0.9) grade = 'S';
      else if (completed >= 3 && onTimeRate >= 0.8) grade = 'A';
      else if (completed >= 2) grade = 'B';
      else if (completed >= 1) grade = 'C';

      return {
        memberId: m.id,
        name: m.name,
        tasksCompleted: completed,
        tasksCreated: created,
        onTimeRate: Math.round(onTimeRate * 100) / 100,
        grade,
      };
    })
    .sort((a, b) => b.tasksCompleted - a.tasksCompleted);

  // 风险摘要
  const snap = collectSnapshot(state, 'weekly');
  const risks = detectRisks(snap);
  const riskSummary: WeeklyRiskSummary = {
    totalRisks: risks.length,
    criticalRisks: risks.filter(r => r.severity === 'critical').length,
    newRisks: risks.slice(0, 3).map(r => ({ title: r.title, severity: r.severity })),
    resolvedCount: 0,
  };

  // 周报摘要
  const completedCount = completedThisWeek.length;
  const totalActive = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length;
  const summary = `本周完成${completedCount}项任务，${totalActive}项仍在进行中。` +
    (goalProgress.filter(g => g.status === 'behind').length > 0
      ? `有${goalProgress.filter(g => g.status === 'behind').length}个目标进度落后。`
      : '各项目标推进正常。');

  // 下周重点
  const nextWeekFocus = generateLocalNextWeekFocus(keyAchievements, goalProgress, riskSummary);

  return {
    periodStart: weekStart.toISOString().split('T')[0],
    periodEnd: weekEnd.toISOString().split('T')[0],
    summary,
    keyAchievements,
    goalProgress,
    memberContributions,
    riskSummary,
    nextWeekFocus,
    generatedAt: Date.now(),
  };
}

function generateLocalNextWeekFocus(
  achievements: KeyAchievement[],
  goalProgress: GoalProgressItem[],
  riskSummary: WeeklyRiskSummary
): string {
  const parts: string[] = [];

  const behindGoals = goalProgress.filter(g => g.status === 'behind');
  if (behindGoals.length > 0) {
    parts.push(`重点推进落后目标：${behindGoals.map(g => g.title).join('、')}`);
  }

  if (riskSummary.criticalRisks > 0) {
    parts.push(`解决${riskSummary.criticalRisks}个关键风险`);
  }

  if (achievements.length < 3) {
    parts.push('提升团队产出节奏');
  }

  if (parts.length === 0) {
    parts.push('保持当前节奏，持续推进各项目标');
  }

  return parts.join('；') + '。';
}

// ===== LLM 增强版 =====

export async function generateWeeklyReportDeep(state: AppState): Promise<WeeklyReport> {
  const local = generateWeeklyReportLocal(state);

  try {
    const contextStr = JSON.stringify({
      summary: local.summary,
      completedTasks: local.keyAchievements.length,
      goalProgress: local.goalProgress.map(g => ({ title: g.title, progress: g.endProgress, status: g.status })),
      topContributors: local.memberContributions.slice(0, 3).map(m => ({ name: m.name, completed: m.tasksCompleted })),
      riskCount: local.riskSummary.totalRisks,
      criticalRisks: local.riskSummary.criticalRisks,
    });

    const prompt = `你是团队管理AI助手，根据本周数据生成下周重点建议。
要求：
1. 150字以内
2. 具体、可执行
3. 基于数据给出建议，不是泛泛而谈
4. 语气专业简洁

数据：
${contextStr}`;

    const aiSuggestion = await callLLM(prompt, {
      model: 'deepseek-chat',
      temperature: 0.3,
      max_tokens: 300,
    });

    if (aiSuggestion && aiSuggestion.trim()) {
      local.nextWeekFocus = aiSuggestion.trim();
    }
  } catch {
    // LLM 失败时保留本地建议
  }

  return local;
}
