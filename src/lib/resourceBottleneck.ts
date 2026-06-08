/**
 * E6: 资源瓶颈预警 — 轻量资源看板
 *
 * 基于成员当前任务数+截止日期密度计算"负载指数"
 * 任务创建时推荐"最闲且匹配"的责任人
 * 周报自动生成资源瓶颈摘要
 */
import type { Task, Member } from '@/types';

export interface MemberLoad {
  memberId: string;
  memberName: string;
  activeTasks: number;
  overdueTasks: number;
  loadIndex: number;       // 0-100，100=极度过载
  upcomingDeadlineDensity: number; // 未来7天内的截止任务数
  status: 'available' | 'balanced' | 'overloaded' | 'critical';
}

/** 计算团队成员的负载指数 */
export function calcMemberLoads(tasks: Task[], members: Member[]): MemberLoad[] {
  const now = Date.now();
  const weekLater = now + 7 * 86400000;

  return members.filter(m => m.status === 'active').map(member => {
    const myTasks = tasks.filter(t => t.leaderId === member.id && t.status !== 'done' && t.status !== 'cancelled');
    const overdueTasks = myTasks.filter(t => t.dueDate && new Date(t.dueDate).getTime() < now).length;
    const upcomingDeadlines = myTasks.filter(t => t.dueDate && new Date(t.dueDate).getTime() >= now && new Date(t.dueDate).getTime() <= weekLater).length;

    // 负载指数 = 基础负载 + 逾期惩罚 + 密集截止惩罚
    const baseLoad = Math.min(40, myTasks.length * 10); // 每个任务+10，上限40
    const overduePenalty = Math.min(30, overdueTasks * 15); // 每个逾期+15，上限30
    const densityPenalty = Math.min(30, upcomingDeadlines * 10); // 每个密集截止+10，上限30
    const loadIndex = Math.min(100, baseLoad + overduePenalty + densityPenalty);

    let status: MemberLoad['status'];
    if (loadIndex >= 80) status = 'critical';
    else if (loadIndex >= 60) status = 'overloaded';
    else if (loadIndex >= 30) status = 'balanced';
    else status = 'available';

    return { memberId: member.id, memberName: member.name, activeTasks: myTasks.length, overdueTasks, loadIndex, upcomingDeadlineDensity: upcomingDeadlines, status };
  });
}

/** 推荐最优责任人（最闲且技能匹配） */
export function recommendAssignee(tasks: Task[], members: Member[], preferredMemberIds?: string[]): { memberId: string; reason: string } | null {
  const loads = calcMemberLoads(tasks, members);
  const candidates = preferredMemberIds?.length
    ? loads.filter(l => preferredMemberIds.includes(l.memberId))
    : loads;

  if (candidates.length === 0) return null;

  // 按负载排序，选最闲的
  const sorted = [...candidates].sort((a, b) => a.loadIndex - b.loadIndex);
  const best = sorted[0];

  return {
    memberId: best.memberId,
    reason: best.status === 'available'
      ? `当前${best.activeTasks}个活跃任务，负载较低（${best.loadIndex}%）`
      : `当前${best.activeTasks}个活跃任务，负载${best.loadIndex}%（${best.status === 'critical' ? '严重过载' : best.status === 'overloaded' ? '过载' : '均衡'}）`,
  };
}

/** 生成资源瓶颈摘要（周报用） */
export function generateBottleneckSummary(tasks: Task[], members: Member[]): string {
  const loads = calcMemberLoads(tasks, members);
  const critical = loads.filter(l => l.status === 'critical');
  const overloaded = loads.filter(l => l.status === 'overloaded');
  const available = loads.filter(l => l.status === 'available');

  const parts: string[] = [];
  if (critical.length > 0) parts.push(`严重过载(${critical.length}人): ${critical.map(l => `${l.memberName}(${l.activeTasks}任务/${l.overdueTasks}逾期)`).join('、')}`);
  if (overloaded.length > 0) parts.push(`过载(${overloaded.length}人): ${overloaded.map(l => `${l.memberName}(${l.activeTasks}任务)`).join('、')}`);
  if (available.length > 0) parts.push(`可分配(${available.length}人): ${available.map(l => l.memberName).join('、')}`);

  return parts.length > 0 ? parts.join('；') : '团队负载均衡，无瓶颈';
}


