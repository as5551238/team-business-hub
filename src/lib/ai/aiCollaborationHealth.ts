/**
 * 协作健康度评分引擎 — 基于评论响应时间、任务逾期率、@mention回复率计算
 * 确定性计算，无需 LLM
 */
import type { AppState, Comment } from '@/types';

export interface CollaborationHealth {
  overallScore: number; // 0-100
  commentResponseRate: number; // % comments responded within 24h
  taskOnTimeRate: number; // % tasks completed before dueDate
  mentionResponseRate: number; // % @mentions that got a reply
  avgResponseHours: number; // average hours to respond to comments
  trend: 'improving' | 'stable' | 'declining';
  insights: string[];
}

export function computeCollaborationHealth(state: AppState): CollaborationHealth {
  const tasks = state.tasks ?? [];
  const comments = state.comments ?? [];
  const members = state.members.filter(m => m.status === 'active');
  const notifications = state.notifications ?? [];

  // 1. Task on-time rate
  const completedTasks = tasks.filter(t => t.status === 'done');
  const completedWithDue = completedTasks.filter(t => t.dueDate && t.completedAt);
  const onTimeTasks = completedWithDue.filter(t => t.completedAt! <= t.dueDate + 'T23:59:59');
  const taskOnTimeRate = completedWithDue.length > 0 ? Math.round((onTimeTasks.length / completedWithDue.length) * 100) : 100;

  // 2. Comment response rate (comments that got a response within 24h)
  const commentsByItem = new Map<string, Comment[]>();
  for (const c of comments) {
    const key = c.itemId;
    if (!commentsByItem.has(key)) commentsByItem.set(key, []);
    commentsByItem.get(key)!.push(c);
  }

  let respondedWithin24h = 0;
  let totalResponseCheck = 0;
  let totalResponseMs = 0;
  let responseCount = 0;

  for (const [, itemComments] of commentsByItem) {
    const sorted = itemComments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      // If different member responded
      if (curr.memberId !== next.memberId) {
        totalResponseCheck++;
        const diffMs = new Date(next.createdAt).getTime() - new Date(curr.createdAt).getTime();
        totalResponseMs += diffMs;
        responseCount++;
        if (diffMs <= 24 * 3600000) respondedWithin24h++;
      }
    }
  }

  const commentResponseRate = totalResponseCheck > 0 ? Math.round((respondedWithin24h / totalResponseCheck) * 100) : 100;
  const avgResponseHours = responseCount > 0 ? Math.round((totalResponseMs / responseCount) / 3600000 * 10) / 10 : 0;

  // 3. @mention response rate (mentioned members who commented on the same item after being mentioned)
  const mentionComments = comments.filter(c => (c.mentionedMemberIds ?? []).length > 0);
  let mentionResponded = 0;
  let totalMentions = 0;

  for (const mc of mentionComments) {
    const mentionedIds = mc.mentionedMemberIds ?? [];
    const itemComments = commentsByItem.get(mc.itemId) ?? [];
    for (const mid of mentionedIds) {
      totalMentions++;
      const afterMention = itemComments.filter(c =>
        c.memberId === mid && new Date(c.createdAt).getTime() > new Date(mc.createdAt).getTime()
      );
      if (afterMention.length > 0) mentionResponded++;
    }
  }

  const mentionResponseRate = totalMentions > 0 ? Math.round((mentionResponded / totalMentions) * 100) : 100;

  // 4. Overall score (weighted)
  const overallScore = Math.round(
    taskOnTimeRate * 0.35 +
    commentResponseRate * 0.30 +
    mentionResponseRate * 0.20 +
    Math.min(100, Math.max(0, 100 - avgResponseHours * 2)) * 0.15
  );

  // 5. Trend (compare recent vs older data, simplified)
  const recentTasks = tasks.filter(t => t.completedAt && new Date(t.completedAt).getTime() > Date.now() - 7 * 86400000);
  const recentOnTime = recentTasks.filter(t => t.dueDate && t.completedAt! <= t.dueDate + 'T23:59:59');
  const recentRate = recentTasks.length > 0 ? recentOnTime.length / recentTasks.length : 0.5;
  const trend: 'improving' | 'stable' | 'declining' = recentRate > taskOnTimeRate / 100 + 0.05 ? 'improving' : recentRate < taskOnTimeRate / 100 - 0.05 ? 'declining' : 'stable';

  // 6. Insights
  const insights: string[] = [];
  if (taskOnTimeRate < 70) insights.push(`任务准时率仅${taskOnTimeRate}%，建议减少并行任务数，聚焦交付`);
  if (commentResponseRate < 60) insights.push(`评论24h响应率${commentResponseRate}%，团队沟通需加强及时性`);
  if (mentionResponseRate < 50) insights.push(`@提及回复率${mentionResponseRate}%，被@的成员应及时响应`);
  if (avgResponseHours > 24) insights.push(`平均响应时间${avgResponseHours}小时，建议团队成员每日至少查看一次讨论`);
  if (overallScore >= 80) insights.push(`协作健康度优秀(${overallScore}分)，保持当前节奏`);
  if (insights.length === 0) insights.push('数据尚不充分，持续使用后将生成更精准的洞察');

  return { overallScore, commentResponseRate, taskOnTimeRate, mentionResponseRate, avgResponseHours, trend, insights };
}
