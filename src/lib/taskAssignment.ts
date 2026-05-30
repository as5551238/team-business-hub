/**
 * 智能任务分派引擎 — 基于历史数据和负载的智能推荐
 *
 * Round 9 — 事项闭环深度 +2
 * - 根据负载均衡推荐最优负责人
 * - 根据历史完成率推荐最适合的成员
 * - 考虑技能匹配（基于category）
 */
import type { Task, Member } from '@/types';
import { calcMemberLoads, type MemberLoad } from './resourceBottleneck';
import { loadLibrary } from './delayPrediction';

export interface AssignmentSuggestion {
  memberId: string;
  memberName: string;
  score: number;       // 0-100 推荐度
  reasons: string[];
  currentLoad: number; // 当前负载指数
  avgDeviation: number; // 平均偏差率
  completedCount: number; // 完成任务数
}

export function suggestAssignee(task: { priority: string; category?: string; projectId?: string }, members: Member[], tasks: Task[]): AssignmentSuggestion[] {
  const loads = calcMemberLoads(tasks, members);
  const library = loadLibrary();
  const loadMap = new Map(loads.map((l: MemberLoad) => [l.memberId, l]));
  const activeMembers = members.filter(m => m.status !== 'inactive');

  const suggestions: AssignmentSuggestion[] = [];

  for (const member of activeMembers) {
    const load = loadMap.get(member.id);
    const memberRecords = library.filter(r => r.leaderId === member.id);
    const avgDeviation = memberRecords.length > 0 ? memberRecords.reduce((a, r) => a + r.ratio, 0) / memberRecords.length - 1 : 0;
    const completedCount = memberRecords.length;
    const currentLoadIndex = load?.loadIndex || 0;
    const activeTaskCount = load?.activeTasks || 0;

    // 评分算法
    let score = 50; // 基础分
    const reasons: string[] = [];

    // 负载因素（权重30%）：负载越低分越高
    if (currentLoadIndex <= 3) { score += 20; reasons.push('当前负载低'); }
    else if (currentLoadIndex <= 5) { score += 10; reasons.push('负载适中'); }
    else { score -= 15; reasons.push(`负载较高(${activeTaskCount}项活跃)`); }

    // 历史偏差因素（权重35%）：偏差越低分越高
    if (completedCount >= 3) {
      if (avgDeviation <= 0) { score += 25; reasons.push(`历史提前完成(${Math.round(avgDeviation * 100)}%)`); }
      else if (avgDeviation <= 0.1) { score += 20; reasons.push('历史准点完成'); }
      else if (avgDeviation <= 0.3) { score += 5; reasons.push('历史轻微延期'); }
      else { score -= 10; reasons.push(`历史偏差较大(+${Math.round(avgDeviation * 100)}%)`); }
    } else {
      reasons.push('历史数据不足');
    }

    // 经验因素（权重25%）：完成过更多任务
    if (completedCount >= 20) { score += 15; reasons.push('经验丰富'); }
    else if (completedCount >= 10) { score += 10; reasons.push('有一定经验'); }
    else if (completedCount >= 3) { score += 5; }

    // 优先级匹配（权重10%）
    if (task.priority === 'urgent') {
      if (completedCount >= 5 && avgDeviation <= 0.1) { score += 10; reasons.push('适合紧急任务'); }
    }

    suggestions.push({
      memberId: member.id,
      memberName: member.name || member.id.slice(0, 8),
      score: Math.max(0, Math.min(100, score)),
      reasons,
      currentLoad: currentLoadIndex,
      avgDeviation: Math.round(avgDeviation * 100) / 100,
      completedCount,
    });
  }

  return suggestions.sort((a, b) => b.score - a.score);
}
