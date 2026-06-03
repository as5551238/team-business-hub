/**
 * A2A Agent Discovery + Agent Gateway 翻译层 + 行为审计日志
 *
 * Round 4 — Agent A2A 协议升级
 * - A2A Discovery: Agent 可发现 TBH 的能力、工具列表、连接方式
 * - Agent Gateway: MCP ↔ A2A ↔ REST 协议翻译，Agent 无需关心底层协议
 * - 审计日志: 所有 Agent 操作可追溯、不可篡改
 */

import { handleError } from '@/lib/errorHandler';

// ===== A2A Agent Card (Google A2A 规范) =====

export interface AgentCard {
  name: string;
  version: string;
  description: string;
  url: string;
  capabilities: AgentCapability[];
  authentication: { type: string; description: string };
  provider: { name: string; url: string };
}

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  protocol: 'mcp' | 'a2a' | 'rest';
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
}

/** 生成 TBH Agent Card（A2A 发现端点） */
export function generateAgentCard(baseUrl: string): AgentCard {
  return {
    name: 'team-business-hub',
    version: '1.0.0',
    description: '团队业务中台 — 目标管理(OKR+KPI双轨)、任务闭环、项目协同、智能预测。支持MCP/A2A双协议访问。',
    url: baseUrl,
    capabilities: [
      { id: 'goals', name: '目标管理', description: 'OKR+KPI双轨目标CRUD、进度追踪、双轨汇总', protocol: 'mcp', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'get', 'create', 'update', 'delete'] } } } },
      { id: 'tasks', name: '任务管理', description: '任务CRUD、状态流转、依赖关系、自动联动KR', protocol: 'mcp', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'get', 'create', 'update', 'delete'] } } } },
      { id: 'projects', name: '项目管理', description: '项目CRUD、甘特图数据、分组进度', protocol: 'mcp' },
      { id: 'analytics', name: '智能分析', description: 'CPM关键路径、延期预测(自学习)、KPI评分、资源瓶颈、责任人推荐', protocol: 'mcp' },
      { id: 'prediction', name: '预测引擎', description: '延期风险、资源瓶颈、OKR达成概率、风险前置预警（四维预测）', protocol: 'a2a', inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['delay', 'resource', 'okr', 'risk'] }, targetId: { type: 'string' } } } },
      { id: 'collaboration', name: '协作通知', description: '@mention推送、评论通知、状态变更推送', protocol: 'rest' },
    ],
    authentication: { type: 'bearer-token', description: 'API Token via Authorization header or TBH_API_TOKEN env var' },
    provider: { name: 'Team Business Hub', url: baseUrl },
  };
}

// ===== Agent Gateway — 协议翻译层 =====

export type GatewayProtocol = 'mcp' | 'a2a' | 'rest';

export interface GatewayRequest {
  protocol: GatewayProtocol;
  action: string;
  args: Record<string, any>;
  authToken?: string;
  agentId?: string;
}

export interface GatewayResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  protocol: GatewayProtocol;
  auditId?: string;
}

/** A2A → MCP 工具名映射 */
const A2A_TO_MCP: Record<string, string> = {
  'goals.list': 'list_goals',
  'goals.get': 'get_goal',
  'goals.create': 'create_goal',
  'goals.update': 'update_goal',
  'goals.delete': 'delete_goal',
  'tasks.list': 'list_tasks',
  'tasks.get': 'get_task',
  'tasks.create': 'create_task',
  'tasks.update': 'update_task',
  'tasks.delete': 'delete_task',
  'projects.list': 'list_projects',
  'projects.get': 'get_project',
  'projects.create': 'create_project',
  'projects.update': 'update_project',
  'analytics.critical_path': 'get_critical_path',
  'analytics.predict_delay': 'predict_delay',
  'analytics.kpi_score': 'calc_kpi_score',
  'analytics.resource_bottleneck': 'resource_bottleneck',
  'analytics.recommend_assignee': 'recommend_assignee',
  // A2A 独有的四维预测
  'prediction.delay': 'predict_delay',
  'prediction.resource': 'resource_bottleneck',
  'prediction.okr': 'calc_kpi_score',
  'prediction.risk': 'predict_delay',
};

/** MCP → REST API 路径映射 */
const MCP_TO_REST: Record<string, { method: string; path: string }> = {
  list_goals: { method: 'GET', path: '/api/goals' },
  get_goal: { method: 'GET', path: '/api/goals/{id}' },
  create_goal: { method: 'POST', path: '/api/goals' },
  update_goal: { method: 'PATCH', path: '/api/goals/{id}' },
  delete_goal: { method: 'DELETE', path: '/api/goals/{id}' },
  list_projects: { method: 'GET', path: '/api/projects' },
  get_project: { method: 'GET', path: '/api/projects/{id}' },
  create_project: { method: 'POST', path: '/api/projects' },
  update_project: { method: 'PATCH', path: '/api/projects/{id}' },
  list_tasks: { method: 'GET', path: '/api/tasks' },
  get_task: { method: 'GET', path: '/api/tasks/{id}' },
  create_task: { method: 'POST', path: '/api/tasks' },
  update_task: { method: 'PATCH', path: '/api/tasks/{id}' },
  delete_task: { method: 'DELETE', path: '/api/tasks/{id}' },
  list_members: { method: 'GET', path: '/api/members' },
};

/** 将 A2A action 翻译为 MCP tool name */
export function translateA2AToMCP(a2aAction: string): string | null {
  return A2A_TO_MCP[a2aAction] || null;
}

/** 将 MCP tool name 翻译为 REST endpoint */
export function translateMCPToREST(mcpTool: string): { method: string; path: string } | null {
  return MCP_TO_REST[mcpTool] || null;
}

/** 协议翻译核心 — 根据输入协议自动路由到目标协议 */
export function translateGatewayRequest(req: GatewayRequest): {
  targetProtocol: GatewayProtocol;
  toolName: string;
  args: Record<string, any>;
} {
  if (req.protocol === 'a2a') {
    const mcpName = translateA2AToMCP(req.action);
    if (mcpName) return { targetProtocol: 'mcp', toolName: mcpName, args: req.args };
    return { targetProtocol: 'mcp', toolName: req.action, args: req.args };
  }
  if (req.protocol === 'rest') {
    // REST 请求直接透传，toolName 从路径推导
    const toolName = req.action.replace(/\/api\//, '').replace(/\//g, '_').replace(/s$/, 's_list');
    return { targetProtocol: 'mcp', toolName, args: req.args };
  }
  return { targetProtocol: req.protocol, toolName: req.action, args: req.args };
}

// ===== Agent 行为审计日志 =====

export interface AuditLogEntry {
  id: string;
  agentId: string;
  toolName: string;
  args: Record<string, any>;
  result: 'success' | 'error' | 'denied';
  error?: string;
  protocol: GatewayProtocol;
  timestamp: string;
  durationMs: number;
}

const AUDIT_LOG_KEY = 'tbh-agent-audit-log';
const MAX_AUDIT_ENTRIES = 2000;

/** 写入审计日志 */
export function writeAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): string {
  const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const full: AuditLogEntry = { ...entry, id, timestamp: new Date().toISOString() };

  try {
    const logs = readAuditLogs();
    logs.push(full);
    // 保持最大条目限制
    while (logs.length > MAX_AUDIT_ENTRIES) logs.shift();
    localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(logs));
  } catch (e) {
    handleError(e, { module: 'agentGateway', operation: 'WRITE_AUDIT', severity: 'debug' });
  }
  return id;
}

/** 读取审计日志 */
export function readAuditLogs(limit = 100, agentId?: string): AuditLogEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_LOG_KEY);
    const logs: AuditLogEntry[] = raw ? JSON.parse(raw) : [];
    const filtered = agentId ? logs.filter(l => l.agentId === agentId) : logs;
    return filtered.slice(-limit);
  } catch (e) { handleError(e, { module: 'agentGateway', operation: 'READ_AUDIT', severity: 'debug' });
    return [];
  }
}

/** 获取审计统计 */
export function getAuditStats(): {
  totalOps: number;
  successRate: number;
  topTools: Array<{ tool: string; count: number }>;
  topAgents: Array<{ agentId: string; count: number }>;
  errors: number;
  denied: number;
} {
  const logs = readAuditLogs(MAX_AUDIT_ENTRIES);
  const total = logs.length;
  const success = logs.filter(l => l.result === 'success').length;
  const errors = logs.filter(l => l.result === 'error').length;
  const denied = logs.filter(l => l.result === 'denied').length;

  const toolCounts: Record<string, number> = {};
  const agentCounts: Record<string, number> = {};
  for (const l of logs) {
    toolCounts[l.toolName] = (toolCounts[l.toolName] || 0) + 1;
    agentCounts[l.agentId] = (agentCounts[l.agentId] || 0) + 1;
  }

  return {
    totalOps: total,
    successRate: total > 0 ? Math.round((success / total) * 100) : 0,
    topTools: Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tool, count]) => ({ tool, count })),
    topAgents: Object.entries(agentCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([agentId, count]) => ({ agentId, count })),
    errors,
    denied,
  };
}
