/**
 * 轻量延期预测 — 基于历史偏差率的风险标注（自学习版）
 *
 * E2 目标：任务创建/编辑时自动标注 "预计延期风险：低/中/高"
 * P1 增强：偏差率库持久化 + 任务完成时自动学习
 *
 * 算法：
 * 1. 收集过去90天已完成任务的「实际工期/计划工期」比率
 * 2. 按负责人+优先级分组计算历史偏差中位数
 * 3. 新任务基于同类历史偏差推算预计完成日期
 * 4. 预计完成日期 > 截止日期 → 标注延期风险
 * 5. 每次任务完成时，持久化偏差率到 localStorage（跨会话学习）
 */
import type { Task, TaskPriority } from '@/types';

export type DelayRisk = 'none' | 'low' | 'medium' | 'high';

const DAY_MS = 86400000;
const STORAGE_KEY = 'tbh-delay-ratio-library';
const MAX_LIBRARY_SIZE = 2000;

interface HistoricalRecord {
  leaderId: string;
  priority: TaskPriority;
  plannedDays: number;
  actualDays: number;
  ratio: number;
  taskId: string;
  completedAt: string;
}

// ===== 偏差率库持久化 =====

export function loadLibrary(): HistoricalRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

function saveLibrary(records: HistoricalRecord[]) {
  // 淘汰超过180天的旧数据，保留最近 MAX_LIBRARY_SIZE 条
  const cutoff = new Date(Date.now() - 180 * DAY_MS).toISOString();
  const filtered = records
    .filter(r => r.completedAt > cutoff)
    .slice(-MAX_LIBRARY_SIZE);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch {}
}

/**
 * 任务完成时调用 — 将新偏差率记录持久化
 * 建议在 taskSlice 的 status='done' 逻辑中调用
 */
export function learnFromCompletedTask(task: Task): void {
  if (task.status !== 'done' || !task.completedAt || !task.startDate || !task.dueDate) return;
  const startTs = new Date(task.startDate).getTime();
  const dueTs = new Date(task.dueDate).getTime();
  const completedTs = new Date(task.completedAt).getTime();
  if (isNaN(startTs) || isNaN(dueTs) || isNaN(completedTs)) return;
  const plannedDays = Math.max(1, Math.round((dueTs - startTs) / DAY_MS) || 1);
  const actualDays = Math.max(1, Math.round((completedTs - startTs) / DAY_MS) || 1);

  const library = loadLibrary();
  library.push({
    taskId: task.id,
    leaderId: task.leaderId,
    priority: task.priority,
    plannedDays,
    actualDays,
    ratio: actualDays / plannedDays,
    completedAt: task.completedAt,
  });
  saveLibrary(library);
}

/** 收集历史记录（持久化库 + 最近90天内存数据合并） */
function collectHistory(tasks: Task[], now: number = Date.now()): HistoricalRecord[] {
  const cutoff = now - 90 * DAY_MS;
  // 1. 从持久化库加载
  const library = loadLibrary().filter(r => new Date(r.completedAt).getTime() >= cutoff);
  // 2. 从当前任务列表补充（确保最新数据）
  const fromTasks: HistoricalRecord[] = [];
  for (const t of tasks) {
    if (t.status !== 'done' || !t.completedAt || !t.startDate || !t.dueDate) continue;
    const completedTs = new Date(t.completedAt).getTime();
    if (completedTs < cutoff) continue;
    const startTs = new Date(t.startDate).getTime();
    const dueTs = new Date(t.dueDate).getTime();
    if (isNaN(startTs) || isNaN(dueTs) || isNaN(completedTs)) continue;
    const plannedDays = Math.max(1, Math.round((dueTs - startTs) / DAY_MS) || 1);
    const actualDays = Math.max(1, Math.round((completedTs - startTs) / DAY_MS) || 1);
    // 去重：如果持久化库已包含此任务的记录，跳过
    const alreadyExists = library.some(r => r.taskId === t.id);
    if (!alreadyExists) {
      fromTasks.push({
        taskId: t.id,
        leaderId: t.leaderId,
        priority: t.priority,
        plannedDays,
        actualDays,
        ratio: actualDays / plannedDays,
        completedAt: t.completedAt,
      });
    }
  }
  return [...library, ...fromTasks];
}

/** 计算指定分组的历史偏差率中位数 */
function medianRatio(records: HistoricalRecord[]): number {
  if (records.length === 0) return 1.0;
  const sorted = records.map(r => r.ratio).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 获取匹配分组的历史偏差率 */
function getGroupRatio(records: HistoricalRecord[], leaderId: string, priority: TaskPriority): number {
  let group = records.filter(r => r.leaderId === leaderId && r.priority === priority);
  if (group.length >= 3) return medianRatio(group);
  group = records.filter(r => r.leaderId === leaderId);
  if (group.length >= 3) return medianRatio(group);
  group = records.filter(r => r.priority === priority);
  if (group.length >= 3) return medianRatio(group);
  return medianRatio(records);
}

/** 预测任务的延期风险 */
export function predictDelayRisk(task: Task, allTasks: Task[]): {
  risk: DelayRisk;
  ratio: number;
  predictedDaysOverdue: number;
  historicalSampleSize: number;
} {
  if (task.status === 'done' || task.status === 'cancelled') {
    return { risk: 'none', ratio: 1, predictedDaysOverdue: 0, historicalSampleSize: 0 };
  }
  if (!task.startDate || !task.dueDate) {
    return { risk: 'none', ratio: 1, predictedDaysOverdue: 0, historicalSampleSize: 0 };
  }

  const records = collectHistory(allTasks);
  const rawRatio = getGroupRatio(records, task.leaderId, task.priority);
  const ratio = Number.isFinite(rawRatio) ? rawRatio : 1;

  const startTs = new Date(task.startDate).getTime();
  const dueTs = new Date(task.dueDate).getTime();
  const plannedDays = Math.max(1, Math.round((dueTs - startTs) / DAY_MS) || 1);
  const predictedActualDays = Math.round(plannedDays * ratio);
  const predictedDaysOverdue = Math.max(0, predictedActualDays - plannedDays) || 0;

  let risk: DelayRisk;
  if (predictedDaysOverdue === 0) risk = 'none';
  else if (predictedDaysOverdue <= 3) risk = 'low';
  else if (predictedDaysOverdue <= 7) risk = 'medium';
  else risk = 'high';

  const group = records.filter(r => r.leaderId === task.leaderId && r.priority === task.priority);
  const sampleSize = group.length;
  if (sampleSize < 3 && risk !== 'none') {
    if (risk === 'high') risk = 'medium';
    else if (risk === 'medium') risk = 'low';
  }

  return { risk, ratio, predictedDaysOverdue, historicalSampleSize: sampleSize };
}

/** 批量预测任务的延期风险 */
export function predictDelayRisks(tasks: Task[]): Map<string, {
  risk: DelayRisk;
  ratio: number;
  predictedDaysOverdue: number;
}> {
  const result = new Map<string, { risk: DelayRisk; ratio: number; predictedDaysOverdue: number }>();
  const activeTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.startDate && t.dueDate);
  const records = collectHistory(tasks);

  for (const task of activeTasks) {
    const rawRatio = getGroupRatio(records, task.leaderId, task.priority);
    const ratio = Number.isFinite(rawRatio) ? rawRatio : 1;
    const startTs = new Date(task.startDate!).getTime();
    const dueTs = new Date(task.dueDate!).getTime();
    const plannedDays = Math.max(1, Math.round((dueTs - startTs) / DAY_MS) || 1);
    const predictedActualDays = Math.round(plannedDays * ratio);
    const predictedDaysOverdue = Math.max(0, predictedActualDays - plannedDays) || 0;

    let risk: DelayRisk;
    if (predictedDaysOverdue === 0) risk = 'none';
    else if (predictedDaysOverdue <= 3) risk = 'low';
    else if (predictedDaysOverdue <= 7) risk = 'medium';
    else risk = 'high';

    result.set(task.id, { risk, ratio, predictedDaysOverdue });
  }
  return result;
}

/** 获取延期风险的UI颜色 */
export function getDelayRiskColor(risk: DelayRisk): string {
  switch (risk) {
    case 'high': return 'text-red-600 bg-red-50 border-red-200';
    case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'none': return '';
  }
}

/** 获取延期风险的中文标签 */
export function getDelayRiskLabel(risk: DelayRisk): string {
  switch (risk) {
    case 'high': return '高延期风险';
    case 'medium': return '中延期风险';
    case 'low': return '低延期风险';
    case 'none': return '';
  }
}

/** 获取偏差率库统计（供 KPI Dashboard / 管理面板使用） */
export function getDelayLibraryStats(): { totalRecords: number; avgRatio: number; topDelayedLeaders: Array<{ leaderId: string; avgRatio: number }> } {
  const library = loadLibrary();
  if (library.length === 0) return { totalRecords: 0, avgRatio: 1, topDelayedLeaders: [] };
  const validRecords = library.filter(r => Number.isFinite(r.ratio));
  const avgRatio = validRecords.length > 0 ? Math.round(validRecords.reduce((s, r) => s + r.ratio, 0) / validRecords.length * 100) / 100 : 1;
  const byLeader = new Map<string, number[]>();
  for (const r of validRecords) {
    const arr = byLeader.get(r.leaderId) ?? [];
    arr.push(r.ratio);
    byLeader.set(r.leaderId, arr);
  }
  const leaders = Array.from(byLeader.entries())
    .map(([leaderId, ratios]) => { const valid = ratios.filter(v => Number.isFinite(v)); return { leaderId, avgRatio: valid.length > 0 ? Math.round(valid.reduce((s, v) => s + v, 0) / valid.length * 100) / 100 : 1 }; })
    .filter(l => l.avgRatio > 1.1)
    .sort((a, b) => b.avgRatio - a.avgRatio)
    .slice(0, 5);
  return { totalRecords: library.length, avgRatio, topDelayedLeaders: leaders };
}
