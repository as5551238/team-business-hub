/**
 * 关键路径法 (CPM) — Critical Path Method
 * 计算任务的最早/最迟开始完成时间、浮动时间、关键路径
 */

export const DAY_MS = 86400000;

export function parseDate(s: string | null | undefined): number {
  return s ? new Date(s).getTime() : 0;
}

export interface CPMTaskMetrics {
  es: number;
  ef: number;
  ls: number;
  lf: number;
  slack: number;
  isCritical: boolean;
}

export interface CPMResult {
  /** 每个任务的CPM指标 */
  taskMetrics: Map<string, CPMTaskMetrics>;
  /** 主关键路径链（从起点到终点的有序ID链） */
  criticalPath: string[];
  /** 所有关键任务ID集合（slack=0的任务，用于UI高亮） */
  criticalTaskIds: Set<string>;
  /** 项目总工期（天） */
  projectDuration: number;
}

export function calculateCriticalPath(tasks: Array<{
  id: string;
  startDate: string | null;
  dueDate: string | null;
  blockedBy: string[];
}>): CPMResult {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const durations = new Map<string, number>();
  const metrics = new Map<string, { es: number; ef: number; ls: number; lf: number; slack: number; isCritical: boolean }>();

  for (const t of tasks) {
    const startTs = parseDate(t.startDate) || parseDate(t.dueDate) || Date.now();
    const dueTs = parseDate(t.dueDate) || addDay(startTs);
    const dur = Math.max(1, Math.round((dueTs - startTs) / DAY_MS));
    durations.set(t.id, dur);
  }

  const adjList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const t of tasks) {
    adjList.set(t.id, []);
    inDegree.set(t.id, 0);
  }
  for (const t of tasks) {
    for (const dep of (t.blockedBy || [])) {
      if (taskMap.has(dep)) {
        adjList.get(dep)!.push(t.id);
        inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
      }
    }
  }

  const sorted: string[] = [];
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const next of (adjList.get(id) || [])) {
      const nd = (inDegree.get(next) || 1) - 1;
      inDegree.set(next, nd);
      if (nd === 0) queue.push(next);
    }
  }
  const cycleNodes = new Set<string>();
  for (const [id, deg] of inDegree) {
    if (deg > 0) {
      sorted.push(id);
      cycleNodes.add(id);
    }
  }

  for (const id of sorted) {
    const dur = durations.get(id) || 1;
    const deps = (taskMap.get(id)?.blockedBy || []).filter(d => taskMap.has(d) && !cycleNodes.has(d));
    let es = 0;
    for (const dep of deps) {
      const m = metrics.get(dep);
      if (m) es = Math.max(es, m.ef);
    }
  const m: CPMTaskMetrics = { es, ef: es + dur, ls: 0, lf: 0, slack: 0, isCritical: false };
    if (cycleNodes.has(id)) {
      m.slack = NaN;
      m.ls = 0;
      m.lf = m.ef;
    }
    metrics.set(id, m);
  }

  let projectDuration = 0;
  for (const [, m] of metrics) {
    projectDuration = Math.max(projectDuration, m.ef);
  }

  const reversed = [...sorted].reverse();
  for (const id of reversed) {
    if (cycleNodes.has(id)) continue;
    const dur = durations.get(id) || 1;
    const succs = (adjList.get(id) || []).filter(s => !cycleNodes.has(s));
    let lf = projectDuration;
    for (const succ of succs) {
      const sm = metrics.get(succ);
      if (sm) lf = Math.min(lf, sm.ls);
    }
    const m = metrics.get(id)!;
    m.ls = lf - dur;
    m.lf = lf;
    m.slack = m.ls - m.es;
    m.isCritical = m.slack === 0;
  }

  // 收集所有关键任务ID（slack === 0）
  const criticalTaskIds = new Set<string>();
  for (const id of sorted) {
    const m = metrics.get(id);
    if (m && m.isCritical) criticalTaskIds.add(id);
  }

  // 从终点回溯，构建主关键路径链
  const criticalPath: string[] = [];
  const endId = sorted.find(id => {
    const m = metrics.get(id);
    return m && m.ef === projectDuration;
  });
  if (endId && criticalTaskIds.has(endId)) {
    let cur: string | null = endId;
    const visited = new Set<string>();
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      criticalPath.unshift(cur);
      const deps = (taskMap.get(cur)?.blockedBy || [])
        .filter(d => taskMap.has(d) && !cycleNodes.has(d) && criticalTaskIds.has(d));
      // 选择 EF 最大的前驱
      let bestDep: string | null = null;
      let bestEF = -1;
      for (const dep of deps) {
        const dm = metrics.get(dep);
        if (dm && dm.ef > bestEF) { bestEF = dm.ef; bestDep = dep; }
      }
      cur = bestDep;
    }
  }

  return { taskMetrics: metrics, criticalPath, criticalTaskIds, projectDuration };
}

function addDay(ts: number): number {
  return ts + DAY_MS;
}

/** 为非关键路径任务建议缓冲区 */
export function suggestBuffers(
  taskMetrics: Map<string, CPMTaskMetrics>,
  criticalTaskIds: Set<string>
): Array<{ taskId: string; slack: number; suggestBuffer: number }> {
  const suggestions: Array<{ taskId: string; slack: number; suggestBuffer: number }> = [];
  for (const [id, m] of taskMetrics) {
    if (criticalTaskIds.has(id)) continue;
    if (m.slack > 0 && !isNaN(m.slack)) {
      const suggestBuffer = Math.max(1, Math.round(m.slack * 0.3));
      suggestions.push({ taskId: id, slack: m.slack, suggestBuffer });
    }
  }
  return suggestions.sort((a, b) => b.slack - a.slack);
}
