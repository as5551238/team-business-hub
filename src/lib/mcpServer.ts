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
import { trackMCPToolCall } from '@/store/behaviorTracking';
import { getSupabaseClient } from '@/supabase/client';

// ===== 权限校验 =====

export type ToolPermission = 'goals:read' | 'goals:write' | 'projects:read' | 'projects:write' | 'tasks:read' | 'tasks:write' | 'members:read' | 'analytics:read' | 'calendar:read' | 'calendar:write' | 'push:read' | 'push:write' | 'ai:read';

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
  list_calendar_events: ['calendar:read'],
  create_calendar_event: ['calendar:write'],
  detect_schedule_conflicts: ['calendar:read'],
  list_push_notifications: ['push:read'],
  mark_push_notification_read: ['push:write'],
  generate_morning_briefing: ['ai:read'],
  generate_weekly_report: ['ai:read'],
  generate_risk_report: ['ai:read'],
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

// Read Supabase config dynamically from the initialized client or localStorage
function getSupabaseConfig(): { url: string; key: string } {
  // Try to get from the initialized Supabase client first
  try {
    const sb = getSupabaseClient();
    if (sb) {
      const url = (sb as any).supabaseUrl || (sb as any)?.config?.url || '';
      const key = (sb as any)?.supabaseKey || (sb as any)?.rest?.headers?.apikey || '';
      if (url && key) return { url, key };
    }
  } catch {}
  // Fallback to localStorage config
  try {
    const configStr = localStorage.getItem('tbh-supabase-config');
    if (configStr) {
      const config = JSON.parse(configStr);
      if (config.url && config.anonKey) return { url: config.url, key: config.anonKey };
    }
  } catch {}
  return { url: '', key: '' };
}

async function restGet(table: string, query?: Record<string, string>): Promise<any[]> {
  const { url, key } = getSupabaseConfig();
  const u = new URL(`${url}/rest/v1/${table}`);
  if (query) for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  const resp = await fetch(u.toString(), { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  return resp.json();
}

async function restPost(table: string, record: Record<string, any>): Promise<any> {
  const { url, key } = getSupabaseConfig();
  const resp = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(record),
  });
  return resp.json();
}

async function restPatch(table: string, id: string, updates: Record<string, any>): Promise<any> {
  const { url, key } = getSupabaseConfig();
  const resp = await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
  return resp.json();
}

async function restDelete(table: string, id: string): Promise<void> {
  const { url, key } = getSupabaseConfig();
  await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
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

  // ---- 日历集成（MCP Calendar Server） ----
  // 框架优先，暂用 mock 数据，后续接入 Google/Outlook Calendar API
  { name: 'list_calendar_events', description: '获取日历事件列表（当前为框架模式，返回模拟数据）', inputSchema: { type: 'object', properties: { start_date: { type: 'string', description: '开始日期 YYYY-MM-DD' }, end_date: { type: 'string', description: '结束日期 YYYY-MM-DD' }, limit: { type: 'number', default: 20 } } },
    execute: async (args) => {
      // Mock: 返回未来7天的模拟日历事件
      const today = new Date();
      const events = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        events.push({ id: `mock-cal-${i}`, title: ['团队站会', 'OKR复盘', '产品评审', '1on1沟通', '迭代规划'][i], start: `${d.toISOString().split('T')[0]}T${9 + i}:00:00`, end: `${d.toISOString().split('T')[0]}T${10 + i}:00:00`, source: 'mock', attendees: ['张三', '李四'] });
      }
      return { success: true, data: events.slice(0, args.limit || 20), _meta: { note: 'Calendar MCP in mock mode. Connect Google/Outlook API for real data.' } };
    } },
  { name: 'create_calendar_event', description: '创建日历事件（当前为框架模式，返回模拟结果）', inputSchema: { type: 'object', required: ['title', 'start'], properties: { title: { type: 'string' }, start: { type: 'string', description: '开始时间 ISO格式' }, end: { type: 'string', description: '结束时间 ISO格式' }, description: { type: 'string' }, attendees: { type: 'array', items: { type: 'string' } } } },
    execute: async (args) => {
      return { success: true, data: { id: `mock-cal-${Date.now()}`, title: args.title, start: args.start, end: args.end || '', description: args.description || '', attendees: args.attendees || [], source: 'mock' }, _meta: { note: 'Calendar MCP in mock mode.' } };
    } },
  { name: 'detect_schedule_conflicts', description: '检测日历冲突（比较任务截止日期与日历事件）', inputSchema: { type: 'object', properties: { task_ids: { type: 'array', items: { type: 'string' }, description: '要检测的任务ID列表' } } },
    execute: async (args) => {
      const tasks = await restGet('tasks');
      const targetTasks = args.task_ids ? tasks.filter((t: any) => args.task_ids.includes(t.id)) : tasks.filter((t: any) => t.status === 'in-progress' || t.status === 'todo');
      const conflicts = targetTasks.slice(0, 10).map((t: any) => ({
        taskId: t.id, taskTitle: t.title, dueDate: t.due_date, conflictType: t.due_date ? 'deadline-approaching' : 'no-deadline', severity: t.priority === 'urgent' || t.priority === 'S' ? 'high' : 'medium',
      }));
      return { success: true, data: conflicts, _meta: { note: 'Calendar MCP in mock mode. Full conflict detection requires real calendar data.' } };
    } },

  // ---- 推送通知 ----
  { name: 'list_push_notifications', description: '获取AI推送通知列表', inputSchema: { type: 'object', properties: { unread_only: { type: 'boolean', default: true }, limit: { type: 'number', default: 20 } } },
    execute: async (args) => {
      const q: Record<string, string> = { order: 'created_at.desc', limit: String(args.limit || 20) };
      if (args.unread_only) q.read = 'eq.false';
      const data = await restGet('push_notifications', q);
      return { success: true, data: data || [] };
    } },
  { name: 'mark_push_notification_read', description: '标记推送通知为已读', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    execute: async (args) => {
      await restPatch('push_notifications', args.id, { read: true });
      return { success: true };
    } },

  // ---- AI 报告 ----
  { name: 'generate_morning_briefing', description: '生成晨间聚焦简报', inputSchema: { type: 'object', properties: { use_llm: { type: 'boolean', default: false, description: '是否使用LLM增强' } } },
    execute: async (args) => {
      try {
        const { generateMorningBriefingLocal, generateMorningBriefingDeep } = await import('@/lib/ai/aiMorningBriefing');
        const store = (window as any).__TBH_STORE__ as any;
        if (!store) return { success: false, error: 'Store not available' };
        if (args.use_llm) {
          const result = await generateMorningBriefingDeep(store);
          return { success: true, data: result };
        }
        const result = generateMorningBriefingLocal(store);
        return { success: true, data: result };
      } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    } },
  { name: 'generate_weekly_report', description: '生成周报', inputSchema: { type: 'object', properties: { use_llm: { type: 'boolean', default: false, description: '是否使用LLM增强' } } },
    execute: async (args) => {
      try {
        const { generateWeeklyReportLocal, generateWeeklyReportDeep } = await import('@/lib/ai/aiWeeklyReport');
        const store = (window as any).__TBH_STORE__ as any;
        if (!store) return { success: false, error: 'Store not available' };
        if (args.use_llm) {
          const result = await generateWeeklyReportDeep(store);
          return { success: true, data: result };
        }
        const result = generateWeeklyReportLocal(store);
        return { success: true, data: result };
      } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    } },
  { name: 'generate_risk_report', description: '生成风险报告', inputSchema: { type: 'object', properties: { use_llm: { type: 'boolean', default: false, description: '是否使用LLM增强' } } },
    execute: async (args) => {
      try {
        const { generateRiskReportLocal, generateRiskReportDeep } = await import('@/lib/ai/aiRiskReport');
        const store = (window as any).__TBH_STORE__ as any;
        if (!store) return { success: false, error: 'Store not available' };
        if (args.use_llm) {
          const result = await generateRiskReportDeep(store);
          return { success: true, data: result };
        }
        const result = generateRiskReportLocal(store);
        return { success: true, data: result };
      } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    } },

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

  const sbConfig = getSupabaseConfig();
  const context: MCPContext = {
    token: tokenValue ? getApiTokens().find(t => t.token === tokenValue) : undefined,
    baseUrl: `${sbConfig.url}/rest/v1`,
    headers: { apikey: sbConfig.key, Authorization: `Bearer ${sbConfig.key}`, 'Content-Type': 'application/json' },
  };

  try {
    const start = Date.now();
    const result = await tool.execute(args, context);
    trackMCPToolCall(toolName, result.success, Date.now() - start);
    return result;
  } catch (e: unknown) {
    trackMCPToolCall(toolName, false, 0);
    return { success: false, error: e instanceof Error ? e.message : String(e) };
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
