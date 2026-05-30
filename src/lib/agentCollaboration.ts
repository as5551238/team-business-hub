/**
 * Agent 协同管理 — 人机协同看板 + 绩效度量
 *
 * Round 4 — 长期超越
 * 让人看得见 Agent 做了什么、做得怎么样
 */

import { readAuditLogs, getAuditStats, type AuditLogEntry } from './agentGateway';

// ===== Agent 类型定义 =====

export interface AgentProfile {
  id: string;
  name: string;
  type: 'claude' | 'cursor' | 'copilot' | 'custom' | 'internal';
  avatar: string;
  description: string;
  capabilities: string[];
  status: 'active' | 'idle' | 'offline';
  lastActive: string;
  totalOps: number;
  successRate: number;
}

// ===== Agent 绩效度量 =====

export interface AgentPerformance {
  agentId: string;
  period: string; // 今日/本周/本月
  totalOps: number;
  successOps: number;
  errorOps: number;
  deniedOps: number;
  avgDurationMs: number;
  topTools: Array<{ tool: string; count: number; avgDurationMs: number }>;
  dailyCounts: Array<{ date: string; count: number }>;
  contributionScore: number; // 0-100
}

/** 计算指定 Agent 的绩效 */
export function calcAgentPerformance(agentId: string, days = 7): AgentPerformance {
  const logs = readAuditLogs(2000, agentId);
  const cutoff = Date.now() - days * 86400000;
  const recentLogs = logs.filter(l => new Date(l.timestamp).getTime() >= cutoff);

  const successOps = recentLogs.filter(l => l.result === 'success').length;
  const errorOps = recentLogs.filter(l => l.result === 'error').length;
  const deniedOps = recentLogs.filter(l => l.result === 'denied').length;
  const totalOps = recentLogs.length;
  const avgDurationMs = totalOps > 0 ? Math.round(recentLogs.reduce((sum, l) => sum + l.durationMs, 0) / totalOps) : 0;

  // 工具使用统计
  const toolMap: Record<string, { count: number; totalDuration: number }> = {};
  for (const l of recentLogs) {
    if (!toolMap[l.toolName]) toolMap[l.toolName] = { count: 0, totalDuration: 0 };
    toolMap[l.toolName].count++;
    toolMap[l.toolName].totalDuration += l.durationMs;
  }
  const topTools = Object.entries(toolMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([tool, data]) => ({ tool, count: data.count, avgDurationMs: Math.round(data.totalDuration / data.count) }));

  // 日粒度统计
  const dailyMap: Record<string, number> = {};
  for (const l of recentLogs) {
    const date = l.timestamp.split('T')[0];
    dailyMap[date] = (dailyMap[date] || 0) + 1;
  }
  const dailyCounts = Object.entries(dailyMap).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count }));

  // 贡献评分 = 成功率 * 40 + 操作量归一 * 30 + 工具多样性 * 30
  const successRate = totalOps > 0 ? (successOps / totalOps) * 100 : 0;
  const volumeScore = Math.min(100, totalOps * 2);
  const diversityScore = Math.min(100, Object.keys(toolMap).length * 10);
  const contributionScore = Math.round(successRate * 0.4 + volumeScore * 0.3 + diversityScore * 0.3);

  return {
    agentId,
    period: `${days}天`,
    totalOps,
    successOps,
    errorOps,
    deniedOps,
    avgDurationMs,
    topTools,
    dailyCounts,
    contributionScore,
  };
}

// ===== 人机协同统计 =====

export interface HumanAgentStats {
  totalHumanOps: number;
  totalAgentOps: number;
  agentRatio: number; // Agent 操作占比
  topAgentTools: string[];
  agentSaveHours: number; // Agent 节省的预估工时
  collaborationScore: number; // 人机协同度 0-100
}

/** 计算人机协同统计 */
export function calcHumanAgentStats(humanOpCount: number): HumanAgentStats {
  const stats = getAuditStats();
  const totalAgentOps = stats.totalOps;
  const totalOps = humanOpCount + totalAgentOps;
  const agentRatio = totalOps > 0 ? Math.round((totalAgentOps / totalOps) * 100) : 0;

  // 预估节省工时：每个操作平均 2 分钟
  const agentSaveHours = Math.round(totalAgentOps * 2 / 60 * 10) / 10;

  // 协同度 = Agent操作比例适中(30-50%最佳) + 成功率 + 工具覆盖度
  const ratioScore = agentRatio >= 25 && agentRatio <= 50 ? 100 : agentRatio < 25 ? agentRatio * 4 : Math.max(0, 100 - (agentRatio - 50) * 2);
  const successScore = stats.successRate;
  const coverageScore = Math.min(100, stats.topTools.length * 10);
  const collaborationScore = Math.round(ratioScore * 0.4 + successScore * 0.3 + coverageScore * 0.3);

  return {
    totalHumanOps: humanOpCount,
    totalAgentOps,
    agentRatio,
    topAgentTools: stats.topTools.slice(0, 5).map(t => t.tool),
    agentSaveHours,
    collaborationScore,
  };
}

// ===== 识别审计中的活跃 Agent =====

export function identifyActiveAgents(): Array<{ agentId: string; lastActive: string; opCount: number }> {
  const logs = readAuditLogs(2000);
  const agentMap: Record<string, { lastActive: string; opCount: number }> = {};
  for (const l of logs) {
    if (!agentMap[l.agentId]) agentMap[l.agentId] = { lastActive: l.timestamp, opCount: 0 };
    agentMap[l.agentId].lastActive = l.timestamp;
    agentMap[l.agentId].opCount++;
  }
  return Object.entries(agentMap)
    .map(([agentId, data]) => ({ agentId, ...data }))
    .sort((a, b) => b.opCount - a.opCount);
}
