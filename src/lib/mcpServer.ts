/**
 * MCP Server — Agent可编程操作平台
 *
 * 完整工具注册 + 调用 + 权限校验
 * 支持 stdio/HTTP 两种 transport（供 CLI 和远程 Agent 使用）
 *
 * 工具分类：
 * - CRUD: goals/projects/tasks 的增删改查
 * - 智能: CPM关键路径、延期预测、资源推荐
 * - 分析: KPI评分、双轨汇总、瓶颈摘要
 */
import { getApiTokens, validateToolAccess, type ApiToken } from './api';

// ===== 权限校验 =====

export type ToolPermission = 'goals:read' | 'goals:write' | 'projects:read' | 'projects:write' | 'tasks:read' | 'tasks:write' | 'members:read' | 'analytics:read';

const TOOL_PERMISSIONS: Record<string, ToolPermission[]> = {
  list_goals: ['goals:read'],
  get_goal: ['goals:read'],
  create_goal: ['goals:write'],
  update_goal: ['goals:write'],
  delete_goal: ['goals:write'],
  list_projects: ['projects:read'],
  get_project: ['projects:read'],
  create_project: ['projects:write'],
  update_project: ['projects:write'],
  list_tasks: ['tasks:read'],
  get_task: ['tasks:read'],
  create_task: ['tasks:write'],
  update_task: ['tasks:write'],
  delete_task: ['tasks:write'],
  list_members: ['members:read'],
  get_critical_path: ['analytics:read'],
  predict_delay: ['analytics:read'],
  calc_kpi_score: ['analytics:read'],
  resource_bottleneck: ['analytics:read'],
  recommend_assignee: ['analytics:read'],
};

// ===== MCP Tool 定义 =====

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  execute: (args: any, context: MCPContext) => Promise<MCPToolResult>;
}

export interface MCPContext {
  token?: ApiToken;
  baseUrl: string;
  headers: Record<string, string>;
}

export interface MCPToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

// ===== Supabase REST 辅助 =====

const SUPABASE_URL = 'https://atexvoyvnnuaonvrgzhn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WeMPVE8GNCTOqrE7OZhTIw_WXJaz2Ie';

async function restGet(table: string, query?: Record<string, string>): Promise<any[]> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const resp = await fetch(url.toString(), { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  return resp.json();
}

async function restPost(table: string, record: Record<string, any>): Promise<any> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(record),
  });
  return resp.json();
}

async function restPatch(table: string, id: string, updates: Record<string, any>): Promise<any> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
  return resp.json();
}

async function restDelete(table: string, id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
}

// ===== 20 个 MCP 工具 =====

export const mcpTools: MCPTool[] = [
  // ---- Goals CRUD ----
  { name: 'list_goals', description: '获取目标列表', inputSchema: { type: 'object', properties: { status: { type: 'string' }, category: { type: 'string' }, limit: { type: 'number', default: 50 } } },
    execute: async (args) => { const data = await restGet('goals', args.status ? { status: `eq.${args.status}` } : undefined); return { success: true, data: (data || []).slice(0, args.limit || 50) }; } },
  { name: 'get_goal', description: '获取单个目标详情', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    execute: async (args) => { const data = await restGet('goals', { id: `eq.${args.id}` }); return { success: true, data: data?.[0] || null }; } },
  { name: 'create_goal', description: '创建目标', inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, type: { type: 'string', enum: ['okr', 'kpi', 'milestone'] }, priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] }, start_date: { type: 'string' }, end_date: { type: 'string' }, leader_id: { type: 'string' } } },
    execute: async (args) => { const record = { title: args.title, type: args.type || 'okr', status: 'todo', priority: args.priority || 'medium', start_date: args.start_date || null, end_date: args.end_date || null, leader_id: args.leader_id || '', key_results: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; const data = await restPost('goals', record); return { success: true, data }; } },
  { name: 'update_goal', description: '更新目标', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, title: { type: 'string' }, status: { type: 'string' }, priority: { type: 'string' }, progress: { type: 'number' } } },
    execute: async (args) => { const { id, ...updates } = args; const data = await restPatch('goals', id, updates); return { success: true, data }; } },
  { name: 'delete_goal', description: '删除目标', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    execute: async (args) => { await restDelete('goals', args.id); return { success: true }; } },

  // ---- Projects CRUD ----
  { name: 'list_projects', description: '获取项目列表', inputSchema: { type: 'object', properties: { status: { type: 'string' }, goal_id: { type: 'string' }, limit: { type: 'number', default: 50 } } },
    execute: async (args) => { const q: Record<string, string> = {}; if (args.status) q.status = `eq.${args.status}`; if (args.goal_id) q.goal_id = `eq.${args.goal_id}`; const data = await restGet('projects', q); return { success: true, data: (data || []).slice(0, args.limit || 50) }; } },
  { name: 'get_project', description: '获取单个项目详情', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    execute: async (args) => { const data = await restGet('projects', { id: `eq.${args.id}` }); return { success: true, data: data?.[0] || null }; } },
  { name: 'create_project', description: '创建项目', inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, goal_id: { type: 'string' }, priority: { type: 'string' }, leader_id: { type: 'string' }, start_date: { type: 'string' }, end_date: { type: 'string' } } },
    execute: async (args) => { const record = { title: args.title, goal_id: args.goal_id || null, status: 'todo', priority: args.priority || 'medium', leader_id: args.leader_id || '', start_date: args.start_date || '', end_date: args.end_date || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; const data = await restPost('projects', record); return { success: true, data }; } },
  { name: 'update_project', description: '更新项目', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, title: { type: 'string' }, status: { type: 'string' }, priority: { type: 'string' } } },
    execute: async (args) => { const { id, ...updates } = args; const data = await restPatch('projects', id, updates); return { success: true, data }; } },

  // ---- Tasks CRUD ----
  { name: 'list_tasks', description: '获取任务列表', inputSchema: { type: 'object', properties: { status: { type: 'string' }, project_id: { type: 'string' }, leader_id: { type: 'string' }, limit: { type: 'number', default: 50 } } },
    execute: async (args) => { const q: Record<string, string> = {}; if (args.status) q.status = `eq.${args.status}`; if (args.project_id) q.project_id = `eq.${args.project_id}`; if (args.leader_id) q.leader_id = `eq.${args.leader_id}`; const data = await restGet('tasks', q); return { success: true, data: (data || []).slice(0, args.limit || 50) }; } },
  { name: 'get_task', description: '获取单个任务详情', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    execute: async (args) => { const data = await restGet('tasks', { id: `eq.${args.id}` }); return { success: true, data: data?.[0] || null }; } },
  { name: 'create_task', description: '创建任务', inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, project_id: { type: 'string' }, priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] }, leader_id: { type: 'string' }, start_date: { type: 'string' }, due_date: { type: 'string' }, blocked_by: { type: 'array', items: { type: 'string' } } } },
    execute: async (args) => { const record = { title: args.title, project_id: args.project_id || null, status: 'todo', priority: args.priority || 'medium', leader_id: args.leader_id || '', start_date: args.start_date || null, due_date: args.due_date || null, blocked_by: args.blocked_by || [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; const data = await restPost('tasks', record); return { success: true, data }; } },
  { name: 'update_task', description: '更新任务', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, title: { type: 'string' }, status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked', 'cancelled'] }, priority: { type: 'string' }, due_date: { type: 'string' }, blocked_by: { type: 'array', items: { type: 'string' } } } },
    execute: async (args) => { const { id, ...updates } = args; if (updates.status === 'done') updates.completed_at = new Date().toISOString(); const data = await restPatch('tasks', id, updates); return { success: true, data }; } },
  { name: 'delete_task', description: '删除任务', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    execute: async (args) => { await restDelete('tasks', args.id); return { success: true }; } },

  // ---- Members ----
  { name: 'list_members', description: '获取团队成员列表', inputSchema: { type: 'object', properties: { role: { type: 'string' } } },
    execute: async (args) => { const q = args.role ? { role: `eq.${args.role}`, status: 'eq.active' } : { status: 'eq.active' }; const data = await restGet('members', q); return { success: true, data: data || [] }; } },

  // ---- 智能分析 ----
  { name: 'get_critical_path', description: '计算任务集的关键路径（需要传入任务ID列表）', inputSchema: { type: 'object', required: ['task_ids'], properties: { task_ids: { type: 'array', items: { type: 'string' }, description: '任务ID列表' } } },
    execute: async (args) => { const tasks = await restGet('tasks'); const filtered = tasks.filter((t: any) => args.task_ids.includes(t.id)); const { calculateCriticalPath } = await import('@/lib/gantt/cpm'); const result = calculateCriticalPath(filtered); return { success: true, data: { criticalPath: result.criticalPath, projectDuration: result.projectDuration, criticalTaskIds: [...result.criticalTaskIds] } }; } },
  { name: 'predict_delay', description: '预测指定任务的延期风险（需要传入所有相关任务ID）', inputSchema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string', description: '要预测的任务ID' } } },
    execute: async (args) => { const tasks = await restGet('tasks'); const target = tasks.find((t: any) => t.id === args.task_id); if (!target) return { success: false, error: 'Task not found' }; const { predictDelayRisk } = await import('@/lib/delayPrediction'); const result = predictDelayRisk(target, tasks); return { success: true, data: result }; } },
  { name: 'calc_kpi_score', description: '计算目标的KPI评分', inputSchema: { type: 'object', required: ['goal_id'], properties: { goal_id: { type: 'string' } } },
    execute: async (args) => { const goals = await restGet('goals', { id: `eq.${args.goal_id}` }); const goal = goals?.[0]; if (!goal?.key_results) return { success: false, error: 'Goal or KRs not found' }; const { calcKpiGoalScore, calcDualTrack } = await import('@/lib/kpiScoring'); const kpiResult = calcKpiGoalScore(goal.key_results); const dualTrack = calcDualTrack(goal.key_results); return { success: true, data: { kpi: kpiResult, dualTrack } }; } },
  { name: 'resource_bottleneck', description: '获取团队资源瓶颈摘要', inputSchema: { type: 'object', properties: {} },
    execute: async () => { const [tasks, members] = await Promise.all([restGet('tasks'), restGet('members', { status: 'eq.active' })]); const { generateBottleneckSummary, calcMemberLoads } = await import('@/lib/resourceBottleneck'); const summary = generateBottleneckSummary(tasks, members); const loads = calcMemberLoads(tasks, members); return { success: true, data: { summary, loads: loads.map(l => ({ name: l.memberName, activeTasks: l.activeTasks, loadIndex: l.loadIndex, status: l.status })) } }; } },
  { name: 'recommend_assignee', description: '为任务推荐最优责任人', inputSchema: { type: 'object', properties: { preferred_member_ids: { type: 'array', items: { type: 'string' }, description: '候选项（可选）' } } },
    execute: async (args) => { const [tasks, members] = await Promise.all([restGet('tasks'), restGet('members', { status: 'eq.active' })]); const { recommendAssignee } = await import('@/lib/resourceBottleneck'); const result = recommendAssignee(tasks, members, args.preferred_member_ids); return { success: true, data: result }; } },
];

// ===== MCP 调用入口（带权限校验） =====

export async function callMCPTool(
  toolName: string,
  args: Record<string, any>,
  tokenValue?: string,
): Promise<MCPToolResult> {
  const tool = mcpTools.find(t => t.name === toolName);
  if (!tool) return { success: false, error: `Unknown tool: ${toolName}` };

  // 权限校验（复用 api.ts 的统一校验逻辑）
  if (tokenValue) {
    const { valid, missing } = validateToolAccess(tokenValue, toolName);
    if (!valid) return { success: false, error: `Permission denied. Missing: ${missing.join(', ')}` };
  }

  const context: MCPContext = {
    token: tokenValue ? getApiTokens().find(t => t.token === tokenValue) : undefined,
    baseUrl: `${SUPABASE_URL}/rest/v1`,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
  };

  try {
    return await tool.execute(args, context);
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** 获取工具列表（供 MCP 协议注册） */
export function getMCPToolList(): Array<{ name: string; description: string; inputSchema: Record<string, any> }> {
  return mcpTools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}

/** 生成 OpenAPI 3.1.0 工具清单（供 MCP Discovery 端点使用） */
export function generateToolManifest(): {
  openapi: '3.1.0';
  info: { title: string; version: string };
  paths: Record<string, Record<string, {
    operationId: string;
    summary: string;
    requestBody?: { content: { 'application/json': { schema: Record<string, unknown> } } };
    responses: { '200': { description: string } };
  }>>;
} {
  const paths: Record<string, Record<string, {
    operationId: string;
    summary: string;
    requestBody?: { content: { 'application/json': { schema: Record<string, unknown> } } };
    responses: { '200': { description: string } };
  }>> = {};

  for (const tool of mcpTools) {
    const pathKey = `/tools/${tool.name}`;
    const hasProperties = tool.inputSchema.properties && Object.keys(tool.inputSchema.properties as Record<string, unknown>).length > 0;
    paths[pathKey] = {
      post: {
        operationId: tool.name,
        summary: tool.description,
        ...(hasProperties ? {
          requestBody: {
            content: {
              'application/json': {
                schema: tool.inputSchema as Record<string, unknown>,
              },
            },
          },
        } : {}),
        responses: {
          '200': { description: `Result of ${tool.name}` },
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: { title: 'TBH MCP Server', version: '1.0.0' },
    paths,
  };
}

/** 获取 MCP 工具发现信息（工具名+描述+参数 Schema） */
export function getDiscoveryInfo(): Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  required: string[];
}> {
  return mcpTools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: (t.inputSchema.properties ?? {}) as Record<string, unknown>,
    required: (t.inputSchema.required ?? []) as string[],
  }));
}
