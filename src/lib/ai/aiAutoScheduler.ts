/**
 * AI 自动排程引擎 — 根据任务依赖关系 + 人员负载 + 关键路径约束建议最优排程
 * 确定性回退(拓扑排序 + CPM约束 + 负载均衡) + 可选 LLM 深度模式
 *
 * G4: AI排程×CPM联动
 * - 关键路径任务优先保障，不因负载均衡而被延后
 * - 非关键路径任务不得侵占关键路径任务的浮动时间
 * - 排程结果中标注关键路径任务
 */
import { loadAIConfig } from './types';
import { callLLM } from './llmService';
import { calculateCriticalPath, type CPMResult } from '@/lib/gantt/cpm';
import type { AppState } from '@/types';
import { handleError } from '@/lib/errorHandler';

interface LLMScheduleResponse {
  suggestions?: Array<{ taskId?: string; taskTitle?: string; title?: string; currentStartDate?: string | null; currentDueDate?: string | null; suggestedStartDate?: string; startDate?: string; suggestedDueDate?: string; dueDate?: string; reason?: string; priority?: number }>;
  risks?: Array<string | { description?: string }>;
}

export interface ScheduleSuggestion {
  taskId: string;
  taskTitle: string;
  currentStartDate: string | null;
  currentDueDate: string | null;
  suggestedStartDate: string;
  suggestedDueDate: string;
  reason: string;
  priority: number; // 1=critical, 2=high, 3=medium
  isCriticalPath?: boolean; // G4: 是否在关键路径上
  slackDays?: number;       // G4: 浮动天数
}

export interface AutoScheduleResult {
  suggestions: ScheduleSuggestion[];
  fromLLM: boolean;
  summary: string;
}

/** 确定性自动排程：拓扑排序 + CPM约束 + 负载均衡 */
export function autoScheduleLocal(state: AppState): AutoScheduleResult {
  const tasks = state.tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
  const members = state.members.filter(m => m.status === 'active');
  const suggestions: ScheduleSuggestion[] = [];

  // G4: 计算 CPM 关键路径
  const cpmResult: CPMResult = calculateCriticalPath(tasks);
  const criticalTaskIds = cpmResult.criticalTaskIds;

  // Build dependency graph
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const t of tasks) {
    inDegree.set(t.id, 0);
    dependents.set(t.id, []);
  }
  for (const t of tasks) {
    for (const dep of (t.blockedBy ?? [])) {
      if (taskMap.has(dep)) {
        inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
        dependents.get(dep)?.push(t.id);
      }
    }
  }

  // Topological sort (Kahn's algorithm) — 关键路径任务优先出队
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  // 关键路径任务排在队列前面
  queue.sort((a, b) => (criticalTaskIds.has(a) ? 0 : 1) - (criticalTaskIds.has(b) ? 0 : 1));

  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    const newReady: string[] = [];
    for (const depId of (dependents.get(id) ?? [])) {
      const newDeg = (inDegree.get(depId) ?? 1) - 1;
      inDegree.set(depId, newDeg);
      if (newDeg === 0) newReady.push(depId);
    }
    // 新就绪的关键路径任务优先入队
    newReady.sort((a, b) => (criticalTaskIds.has(a) ? 0 : 1) - (criticalTaskIds.has(b) ? 0 : 1));
    queue.push(...newReady);
  }
  for (const [id, deg] of inDegree) {
    if (deg > 0 && !sorted.includes(id)) sorted.push(id);
  }

  // Assign start dates: each task starts after all its dependencies end
  const assignedDates = new Map<string, { start: number; due: number }>();
  const memberLoad = new Map<string, number>(); // memberId -> current end timestamp

  for (const m of members) memberLoad.set(m.id, Date.now());

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayTs = today.getTime();
  const DAY_MS = 86400000;

  for (const taskId of sorted) {
    const task = taskMap.get(taskId);
    if (!task) continue;

    const taskDuration = Math.max(1, Math.round((parseDate(task.dueDate) - parseDate(task.startDate)) / DAY_MS) || 3);
    let earliestStart = todayTs;

    // Start after all dependencies are done
    for (const depId of (task.blockedBy ?? [])) {
      const depDates = assignedDates.get(depId);
      if (depDates) earliestStart = Math.max(earliestStart, depDates.due + DAY_MS);
    }

    // Respect existing future start dates
    const existingStart = parseDate(task.startDate);
    if (existingStart && existingStart > todayTs) {
      earliestStart = Math.max(earliestStart, existingStart);
    }

    // Load balancing: if the assignee is overloaded, delay slightly
    // G4: 关键路径任务不受负载均衡约束——关键任务不可延后
    const isCritical = criticalTaskIds.has(taskId);
    const slackDays = cpmResult.taskMetrics.has(taskId) ? Math.round((cpmResult.taskMetrics.get(taskId)?.slack ?? 0) / 86400000) : undefined;

    if (!isCritical) {
      const leaderId = task.leaderId;
      const leaderBusyUntil = memberLoad.get(leaderId) ?? todayTs;
      if (leaderBusyUntil > earliestStart) {
        const supporters = (task.supporterIds ?? []) as string[];
        if (supporters.length > 0) {
          const minSupporterEnd = Math.min(...supporters.map(s => memberLoad.get(s) ?? todayTs));
          if (minSupporterEnd < leaderBusyUntil) {
            earliestStart = Math.max(earliestStart, minSupporterEnd);
          }
        }
      }
    }

    const suggestedDue = earliestStart + taskDuration * DAY_MS;
    assignedDates.set(taskId, { start: earliestStart, due: suggestedDue });

    // Update member load
    memberLoad.set(leaderId, Math.max(memberLoad.get(leaderId) ?? todayTs, suggestedDue));

    // Check if schedule differs from current
    const currentStart = parseDate(task.startDate) || todayTs;
    const currentDue = parseDate(task.dueDate) || todayTs;
    const startDiff = Math.abs(earliestStart - currentStart) / DAY_MS;
    const dueDiff = Math.abs(suggestedDue - currentDue) / DAY_MS;

    if (startDiff > 1 || dueDiff > 1) {
      suggestions.push({
        taskId: task.id,
        taskTitle: task.title,
        currentStartDate: task.startDate,
        currentDueDate: task.dueDate,
        suggestedStartDate: formatDate(earliestStart),
        suggestedDueDate: formatDate(suggestedDue),
        reason: isCritical
          ? `关键路径任务，依赖关系要求${startDiff > 1 ? `延后${Math.round(startDiff)}天开始` : '调整截止日期'}，禁止负载均衡延后`
          : startDiff > 1 ? `依赖关系要求延后${Math.round(startDiff)}天开始` : `建议调整截止日期以均衡负载`,
        priority: isCritical ? 1 : (task.blockedBy ?? []).length > 0 ? 1 : task.priority === 'urgent' || task.priority === 'high' ? 2 : 3,
        isCriticalPath: isCritical,
        slackDays,
      });
    }
  }

  suggestions.sort((a, b) => a.priority - b.priority);

  return {
    suggestions: suggestions.slice(0, 15),
    fromLLM: false,
    summary: suggestions.length === 0
      ? '当前排程合理，无需调整'
      : `建议调整 ${suggestions.length} 个任务的日期以优化依赖关系和人员负载（关键路径 ${cpmResult.criticalPath.length} 项，工期 ${cpmResult.projectDuration} 天）`,
  };
}

/** LLM 深度排程建议 */
export async function autoScheduleDeep(state: AppState): Promise<AutoScheduleResult> {
  const config = loadAIConfig();
  if (!config.provider || config.provider === 'none') return autoScheduleLocal(state);

  const local = autoScheduleLocal(state);
  const taskSummary = local.suggestions.slice(0, 8).map(s =>
    `【${s.taskTitle}】 当前:${s.currentStartDate || '?'}~${s.currentDueDate || '?'} 建议:${s.suggestedStartDate}~${s.suggestedDueDate} 原因:${s.reason}`
  ).join('\n');

  const prompt = `你是项目管理排程专家。以下是团队任务排程分析结果，请优化建议并补充漏项：

任务总数: ${state.tasks.length}
活跃成员: ${state.members.filter(m => m.status === 'active').length}

初步建议:
${taskSummary}

请给出：
1. 优化后的排程建议（含原建议中没有的关键任务）
2. 可能的风险点
3. 最优执行顺序建议

以JSON格式返回: { "suggestions": [...], "risks": [...], "optimalOrder": [...] }`;

  try {
    const resp = await callLLM(prompt, config);
    if (resp) {
      try {
        const parsed = JSON.parse(resp);
        if (Array.isArray(parsed.suggestions)) {
          const deepSuggestions = (parsed as LLMScheduleResponse).suggestions!.slice(0, 10).map(s => ({
            taskId: s.taskId || '', taskTitle: s.taskTitle || s.title || '', currentStartDate: s.currentStartDate || null, currentDueDate: s.currentDueDate || null,
            suggestedStartDate: s.suggestedStartDate || s.startDate || formatDate(Date.now()), suggestedDueDate: s.suggestedDueDate || s.dueDate || formatDate(Date.now() + 7 * 86400000),
            reason: s.reason || '', priority: s.priority || 3,
          }));
          const risks = Array.isArray(parsed.risks) ? parsed.risks.slice(0, 3).map(r => typeof r === 'string' ? r : (r as { description?: string }).description || '').filter(Boolean) : [];
          return { suggestions: deepSuggestions, fromLLM: true, summary: `AI 优化了排程建议，识别 ${risks.length} 个风险点${risks.length > 0 ? '：' + risks.join('；') : ''}` };
        }
      } catch (e) { handleError(e, { module: 'aiAutoScheduler', operation: 'PARSE_LLM_JSON', severity: 'warn' }); }
    }
  } catch (e) { handleError(e, { module: 'aiAutoScheduler', operation: 'LLM_CALL', severity: 'warn' }); }

  return local;
}

function parseDate(s: string | null | undefined): number {
  return s ? new Date(s).getTime() : 0;
}
function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
