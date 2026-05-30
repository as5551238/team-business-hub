#!/usr/bin/env node
/**
 * TBH MCP Server — 团队业务中台 Agent 可编程接口
 *
 * 标准 MCP 协议 (JSON-RPC over stdio)
 * 支持 Claude Desktop / Cursor / 任何 MCP 兼容客户端
 *
 * 配置方式 (claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "tbh": {
 *       "command": "node",
 *       "args": ["/path/to/team-business-hub/mcp-server.mjs"],
 *       "env": { "TBH_API_TOKEN": "tbh_xxx" }
 *     }
 *   }
 * }
 *
 * 也支持 HTTP SSE 模式:
 *   node mcp-server.mjs --http --port 3100
 */

import { createServer } from 'http';
import { randomUUID } from 'crypto';

// ===== Supabase REST 配置 =====

const SUPABASE_URL = 'https://atexvoyvnnuaonvrgzhn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WeMPVE8GNCTOqrE7OZhTIw_WXJaz2Ie';
const API_TOKEN = process.env.TBH_API_TOKEN || '';

// ===== HTTP helpers =====

async function restGet(table, query) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const resp = await fetch(url.toString(), {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return resp.json();
}

async function restPost(table, record) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(record),
  });
  return resp.json();
}

async function restPatch(table, id, updates) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
  return resp.json();
}

async function restDelete(table, id) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
}

// ===== 权限系统 =====

// Permissions source: also defined in src/lib/api.ts (authoritative) and src/lib/mcpServer.ts
const TOOL_PERMISSIONS = {
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

// Token 配置: 环境变量 TBH_API_TOKEN 或 ~/.tbh-tokens.json
async function loadTokenConfig() {
  if (API_TOKEN) {
    // 简单 token 模式: 环境变量中的 token 默认拥有全部权限
    return { token: API_TOKEN, permissions: ['admin'] };
  }
  // 读取配置文件
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const cfgPath = path.join(process.env.HOME || '.', '.tbh-tokens.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      return cfg;
    }
  } catch {}
  return null;
}

function checkPermission(toolName, tokenPerms) {
  const required = TOOL_PERMISSIONS[toolName] || [];
  const missing = required.filter(p => !tokenPerms.includes(p) && !tokenPerms.includes('admin'));
  return { allowed: missing.length === 0, missing };
}

// ===== CPM 算法 (内嵌，无需 import) =====

const DAY_MS = 86400000;

function parseDate(v) {
  if (!v) return 0;
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function calculateCriticalPath(tasks) {
  if (!tasks || tasks.length === 0) return { criticalPath: [], criticalTaskIds: new Set(), projectDuration: 0, taskMetrics: new Map() };

  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const metrics = new Map();
  const inDeg = new Map();
  const successors = new Map();

  for (const t of tasks) {
    inDeg.set(t.id, 0);
    successors.set(t.id, []);
    metrics.set(t.id, { es: 0, ef: 0, ls: Infinity, lf: Infinity, slack: 0, duration: 0 });
  }

  // 计算工期
  for (const t of tasks) {
    const start = parseDate(t.start_date);
    const end = parseDate(t.due_date || t.end_date);
    const dur = end > start ? Math.ceil((end - start) / DAY_MS) : 1;
    metrics.get(t.id).duration = dur;
  }

  // 构建依赖图
  for (const t of tasks) {
    const deps = Array.isArray(t.blocked_by) ? t.blocked_by : (t.blocked_by ? String(t.blocked_by).split(',') : []);
    for (const depId of deps) {
      if (taskMap.has(depId)) {
        inDeg.set(t.id, (inDeg.get(t.id) || 0) + 1);
        successors.get(depId).push(t.id);
      }
    }
  }

  // 正向 pass (ES/EF)
  const queue = [];
  for (const [id, deg] of inDeg) { if (deg === 0) queue.push(id); }
  const sorted = [];
  while (queue.length > 0) {
    const id = queue.shift();
    sorted.push(id);
    const m = metrics.get(id);
    m.ef = m.es + m.duration;
    for (const sid of successors.get(id)) {
      const sm = metrics.get(sid);
      sm.es = Math.max(sm.es, m.ef);
      inDeg.set(sid, inDeg.get(sid) - 1);
      if (inDeg.get(sid) === 0) queue.push(sid);
    }
  }

  // 项目工期
  let projectDuration = 0;
  for (const [, m] of metrics) projectDuration = Math.max(projectDuration, m.ef);

  // 逆向 pass (LS/LF/Slack)
  for (let i = sorted.length - 1; i >= 0; i--) {
    const id = sorted[i];
    const m = metrics.get(id);
    const succs = successors.get(id);
    if (succs.length === 0) {
      m.lf = projectDuration;
    } else {
      let minLs = Infinity;
      for (const sid of succs) minLs = Math.min(minLs, metrics.get(sid).ls);
      m.lf = minLs;
    }
    m.ls = m.lf - m.duration;
    m.slack = m.ls - m.es;
    // 环检测: NaN 表示不可达
    if (isNaN(m.slack)) m.slack = NaN;
  }

  // 关键路径
  const criticalTaskIds = new Set();
  for (const [id, m] of metrics) {
    if (m.slack === 0) criticalTaskIds.add(id);
  }

  const criticalPath = sorted.filter(id => criticalTaskIds.has(id));

  return { criticalPath, criticalTaskIds, projectDuration, taskMetrics: metrics };
}

// ===== 延期预测 (内嵌) =====

function predictDelayRisk(task, allTasks) {
  const completed = allTasks.filter(t => t.status === 'done' && t.completed_at && t.due_date);
  if (completed.length < 3) return { risk: 'unknown', predictedOverdueDays: 0, confidence: 'low', sampleSize: completed.length };

  let totalRatio = 0;
  let count = 0;
  for (const t of completed) {
    const planned = parseDate(t.due_date) - parseDate(t.start_date || t.created_at);
    const actual = parseDate(t.completed_at) - parseDate(t.start_date || t.created_at);
    if (planned > 0) { totalRatio += actual / planned; count++; }
  }
  if (count === 0) return { risk: 'unknown', predictedOverdueDays: 0, confidence: 'low', sampleSize: completed.length };

  const avgRatio = totalRatio / count;
  const remaining = parseDate(task.due_date) - Date.now();
  const plannedRemaining = parseDate(task.due_date) - parseDate(task.start_date || task.created_at);
  if (plannedRemaining <= 0) return { risk: 'none', predictedOverdueDays: 0, confidence: 'low', sampleSize: completed.length };

  const predictedActual = plannedRemaining * avgRatio;
  const overdue = Math.max(0, Math.round((predictedActual - plannedRemaining) / DAY_MS));

  const risk = overdue === 0 ? 'none' : overdue <= 3 ? 'low' : overdue <= 7 ? 'medium' : 'high';
  return { risk, predictedOverdueDays: overdue, confidence: count >= 10 ? 'high' : 'medium', sampleSize: count, avgCompletionRatio: Math.round(avgRatio * 100) / 100 };
}

// ===== KPI 评分 (内嵌) =====

function calcKpiScore(keyResults) {
  const kpiKrs = (keyResults || []).filter(kr => kr.track === 'kpi' || kr.track === 'both');
  if (kpiKrs.length === 0) return { weightedScore: 0, status: 'red', counts: { green: 0, yellow: 0, red: 0 } };

  let totalWeight = 0;
  let weightedSum = 0;
  const counts = { green: 0, yellow: 0, red: 0 };

  for (const kr of kpiKrs) {
    const weight = kr.weight || 1;
    const baseline = kr.kpiBaseline ?? kr.currentValue ?? 0;
    const target = kr.kpiTarget ?? kr.targetValue ?? 100;
    const current = kr.currentValue ?? 0;
    const range = target - baseline;
    const pct = range !== 0 ? ((current - baseline) / range) * 100 : 0;
    const clamped = Math.max(0, Math.min(100, pct));

    const status = clamped >= 80 ? 'green' : clamped >= 60 ? 'yellow' : 'red';
    counts[status]++;
    totalWeight += weight;
    weightedSum += clamped * weight;
  }

  const weightedScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  const status = weightedScore >= 80 ? 'green' : weightedScore >= 60 ? 'yellow' : 'red';
  return { weightedScore, status, counts };
}

// ===== 资源瓶颈 (内嵌) =====

function calcMemberLoads(tasks, members) {
  const activeMembers = (members || []).filter(m => m.status === 'active');
  return activeMembers.map(member => {
    const memberTasks = (tasks || []).filter(t => t.leader_id === member.id && t.status !== 'done' && t.status !== 'cancelled');
    const overdue = memberTasks.filter(t => t.due_date && new Date(t.due_date) < new Date());
    const upcoming = memberTasks.filter(t => t.due_date && new Date(t.due_date) < new Date(Date.now() + 7 * DAY_MS));
    const loadIndex = memberTasks.length * 10 + overdue.length * 15 + upcoming.length * 10;
    const status = loadIndex >= 80 ? 'critical' : loadIndex >= 50 ? 'overloaded' : loadIndex >= 25 ? 'balanced' : 'available';
    return { memberId: member.id, memberName: member.name, activeTasks: memberTasks.length, overdueCount: overdue.length, loadIndex, status };
  });
}

// ===== 20 个 MCP 工具定义 =====

const tools = [
  // ---- Goals CRUD ----
  { name: 'list_goals', description: '获取目标列表。可按状态、类型筛选。', inputSchema: { type: 'object', properties: { status: { type: 'string', description: '目标状态: todo/in_progress/done/blocked/cancelled' }, type: { type: 'string', description: '目标类型: okr/kpi/milestone' }, limit: { type: 'number', default: 50 } } } },
  { name: 'get_goal', description: '获取单个目标详情，含关键结果', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  { name: 'create_goal', description: '创建新目标', inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, type: { type: 'string', enum: ['okr', 'kpi', 'milestone'] }, priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] }, start_date: { type: 'string', description: 'ISO date' }, end_date: { type: 'string', description: 'ISO date' }, leader_id: { type: 'string' } } } },
  { name: 'update_goal', description: '更新目标属性', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, title: { type: 'string' }, status: { type: 'string' }, priority: { type: 'string' }, progress: { type: 'number' } } } },
  { name: 'delete_goal', description: '删除目标', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },

  // ---- Projects CRUD ----
  { name: 'list_projects', description: '获取项目列表。可按状态、目标ID筛选。', inputSchema: { type: 'object', properties: { status: { type: 'string' }, goal_id: { type: 'string' }, limit: { type: 'number', default: 50 } } } },
  { name: 'get_project', description: '获取单个项目详情', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  { name: 'create_project', description: '创建新项目', inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, goal_id: { type: 'string' }, priority: { type: 'string' }, leader_id: { type: 'string' }, start_date: { type: 'string' }, end_date: { type: 'string' } } } },
  { name: 'update_project', description: '更新项目属性', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, title: { type: 'string' }, status: { type: 'string' }, priority: { type: 'string' } } } },

  // ---- Tasks CRUD ----
  { name: 'list_tasks', description: '获取任务列表。可按状态、项目、负责人筛选。', inputSchema: { type: 'object', properties: { status: { type: 'string' }, project_id: { type: 'string' }, leader_id: { type: 'string' }, limit: { type: 'number', default: 50 } } } },
  { name: 'get_task', description: '获取单个任务详情', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  { name: 'create_task', description: '创建新任务', inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, project_id: { type: 'string' }, priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'] }, leader_id: { type: 'string' }, start_date: { type: 'string' }, due_date: { type: 'string' }, blocked_by: { type: 'array', items: { type: 'string' } } } } },
  { name: 'update_task', description: '更新任务属性（状态、优先级、截止日等）', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, title: { type: 'string' }, status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked', 'cancelled'] }, priority: { type: 'string' }, due_date: { type: 'string' }, blocked_by: { type: 'array', items: { type: 'string' } } } } },
  { name: 'delete_task', description: '删除任务', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },

  // ---- Members ----
  { name: 'list_members', description: '获取团队成员列表', inputSchema: { type: 'object', properties: { role: { type: 'string', description: 'admin/manager/leader/member' } } } },

  // ---- 智能分析 ----
  { name: 'get_critical_path', description: '计算指定项目任务集的关键路径(CPM)，返回关键链、项目工期、各任务浮动时间', inputSchema: { type: 'object', required: ['project_id'], properties: { project_id: { type: 'string', description: '项目ID，自动获取其下所有任务计算' } } } },
  { name: 'predict_delay', description: '预测指定任务的延期风险，基于历史完成率偏差推算', inputSchema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string', description: '要预测的任务ID' } } } },
  { name: 'calc_kpi_score', description: '计算目标的KPI评分，含双轨汇总(OKR+KPI)', inputSchema: { type: 'object', required: ['goal_id'], properties: { goal_id: { type: 'string' } } } },
  { name: 'resource_bottleneck', description: '获取团队资源瓶颈摘要：各成员负载、超载状态、瓶颈节点', inputSchema: { type: 'object', properties: {} } },
  { name: 'recommend_assignee', description: '为任务推荐最优责任人，基于负载均衡算法', inputSchema: { type: 'object', properties: { preferred_member_ids: { type: 'array', items: { type: 'string' }, description: '候选人ID列表(可选)' } } } },
];

// ===== 工具执行 =====

async function executeTool(name, args) {
  switch (name) {
    // Goals
    case 'list_goals': {
      const q = { order: 'created_at.desc', limit: String(args.limit || 50) };
      if (args.status) q.status = `eq.${args.status}`;
      if (args.type) q.type = `eq.${args.type}`;
      const data = await restGet('goals', q);
      return (data || []).map(g => ({ id: g.id, title: g.title, type: g.type, status: g.status, priority: g.priority, progress: g.progress, leader_id: g.leader_id, start_date: g.start_date, end_date: g.end_date }));
    }
    case 'get_goal': {
      const data = await restGet('goals', { id: `eq.${args.id}` });
      return data?.[0] || null;
    }
    case 'create_goal': {
      const record = { title: args.title, type: args.type || 'okr', status: 'todo', priority: args.priority || 'medium', start_date: args.start_date || null, end_date: args.end_date || null, leader_id: args.leader_id || '', key_results: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const data = await restPost('goals', record);
      return data?.[0] || data;
    }
    case 'update_goal': {
      const { id, ...updates } = args;
      const data = await restPatch('goals', id, updates);
      return data?.[0] || data;
    }
    case 'delete_goal': {
      await restDelete('goals', args.id);
      return { deleted: true };
    }

    // Projects
    case 'list_projects': {
      const q = { order: 'created_at.desc', limit: String(args.limit || 50) };
      if (args.status) q.status = `eq.${args.status}`;
      if (args.goal_id) q.goal_id = `eq.${args.goal_id}`;
      const data = await restGet('projects', q);
      return (data || []).map(p => ({ id: p.id, title: p.title, status: p.status, priority: p.priority, leader_id: p.leader_id, goal_id: p.goal_id }));
    }
    case 'get_project': {
      const data = await restGet('projects', { id: `eq.${args.id}` });
      return data?.[0] || null;
    }
    case 'create_project': {
      const record = { title: args.title, goal_id: args.goal_id || null, status: 'todo', priority: args.priority || 'medium', leader_id: args.leader_id || '', start_date: args.start_date || '', end_date: args.end_date || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const data = await restPost('projects', record);
      return data?.[0] || data;
    }
    case 'update_project': {
      const { id, ...updates } = args;
      const data = await restPatch('projects', id, updates);
      return data?.[0] || data;
    }

    // Tasks
    case 'list_tasks': {
      const q = { order: 'created_at.desc', limit: String(args.limit || 50) };
      if (args.status) q.status = `eq.${args.status}`;
      if (args.project_id) q.project_id = `eq.${args.project_id}`;
      if (args.leader_id) q.leader_id = `eq.${args.leader_id}`;
      const data = await restGet('tasks', q);
      return (data || []).map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, leader_id: t.leader_id, project_id: t.project_id, due_date: t.due_date }));
    }
    case 'get_task': {
      const data = await restGet('tasks', { id: `eq.${args.id}` });
      return data?.[0] || null;
    }
    case 'create_task': {
      const record = { title: args.title, project_id: args.project_id || null, status: 'todo', priority: args.priority || 'medium', leader_id: args.leader_id || '', start_date: args.start_date || null, due_date: args.due_date || null, blocked_by: args.blocked_by || [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const data = await restPost('tasks', record);
      return data?.[0] || data;
    }
    case 'update_task': {
      const { id, ...updates } = args;
      if (updates.status === 'done') updates.completed_at = new Date().toISOString();
      const data = await restPatch('tasks', id, updates);
      return data?.[0] || data;
    }
    case 'delete_task': {
      await restDelete('tasks', args.id);
      return { deleted: true };
    }

    // Members
    case 'list_members': {
      const q = { status: 'eq.active', order: 'name.asc' };
      if (args.role) q.role = `eq.${args.role}`;
      const data = await restGet('members', q);
      return (data || []).map(m => ({ id: m.id, name: m.name, role: m.role, department: m.department }));
    }

    // 智能分析
    case 'get_critical_path': {
      const tasks = await restGet('tasks', { project_id: `eq.${args.project_id}` });
      if (!tasks || tasks.length === 0) return { error: 'No tasks found for project' };
      const result = calculateCriticalPath(tasks);
      const metricsObj = {};
      for (const [id, m] of result.taskMetrics) {
        metricsObj[id] = { es: m.es, ef: m.ef, ls: m.ls, lf: m.lf, slack: m.slack, duration: m.duration };
      }
      return { criticalPath: result.criticalPath, criticalTaskIds: [...result.criticalTaskIds], projectDuration: result.projectDuration, taskMetrics: metricsObj, totalTasks: tasks.length };
    }
    case 'predict_delay': {
      const tasks = await restGet('tasks', args.project_id ? { project_id: 'eq.' + args.project_id } : undefined);
      const target = tasks.find(t => t.id === args.task_id);
      if (!target) return { error: 'Task not found' };
      return predictDelayRisk(target, tasks);
    }
    case 'calc_kpi_score': {
      const goals = await restGet('goals', { id: `eq.${args.goal_id}` });
      const goal = goals?.[0];
      if (!goal?.key_results) return { error: 'Goal or KRs not found' };
      const kpiResult = calcKpiScore(goal.key_results);
      return { goalTitle: goal.title, kpi: kpiResult };
    }
    case 'resource_bottleneck': {
      const [tasks, members] = await Promise.all([restGet('tasks'), restGet('members', { status: 'eq.active' })]);
      const loads = calcMemberLoads(tasks, members);
      const critical = loads.filter(l => l.status === 'critical');
      const overloaded = loads.filter(l => l.status === 'overloaded');
      return { summary: { totalMembers: loads.length, critical: critical.length, overloaded: overloaded.length, available: loads.filter(l => l.status === 'available').length }, loads, bottlenecks: [...critical, ...overloaded] };
    }
    case 'recommend_assignee': {
      const [tasks, members] = await Promise.all([restGet('tasks'), restGet('members', { status: 'eq.active' })]);
      const loads = calcMemberLoads(tasks, members);
      const candidates = args.preferred_member_ids?.length
        ? loads.filter(l => args.preferred_member_ids.includes(l.memberId))
        : loads;
      const sorted = candidates.sort((a, b) => a.loadIndex - b.loadIndex);
      const recommended = sorted[0];
      return recommended ? { memberId: recommended.memberId, memberName: recommended.memberName, loadIndex: recommended.loadIndex, status: recommended.status, activeTasks: recommended.activeTasks } : { error: 'No available members' };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ===== MCP 协议处理 =====

function createMCPResponse(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function createMCPError(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleMCPRequest(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      return createMCPResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'tbh-mcp-server', version: '1.0.0' },
      });

    case 'notifications/initialized':
      // No response needed
      return null;

    case 'tools/list':
      return createMCPResponse(id, { tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });

    case 'tools/call': {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      // 权限校验 — 无 token 时拒绝所有调用
      const tokenConfig = await loadTokenConfig();
      if (!tokenConfig) {
        return createMCPResponse(id, { content: [{ type: 'text', text: 'Authentication required: no API token configured. Set TBH_API_TOKEN env var or create ~/.tbh-tokens.json' }], isError: true });
      }
      const { allowed, missing } = checkPermission(toolName, tokenConfig.permissions);
      if (!allowed) {
        return createMCPResponse(id, { content: [{ type: 'text', text: `Permission denied. Missing: ${missing.join(', ')}` }], isError: true });
      }

      try {
        const result = await executeTool(toolName, toolArgs);
        return createMCPResponse(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        return createMCPResponse(id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
      }
    }

    case 'ping':
      return createMCPResponse(id, {});

    default:
      return createMCPError(id, -32601, `Method not found: ${method}`);
  }
}

// ===== stdio 传输 =====

async function runStdio() {
  let buf = Buffer.alloc(0);
  process.stdin.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      const headerEnd = buf.indexOf("

");
      if (headerEnd === -1) break;
      const header = buf.slice(0, headerEnd).toString();
      const clMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!clMatch) { buf = buf.slice(headerEnd + 4); continue; }
      const len = parseInt(clMatch[1]);
      const msgStart = headerEnd + 4;
      if (buf.length < msgStart + len) break;
      const msgStr = buf.slice(msgStart, msgStart + len).toString();
      buf = buf.slice(msgStart + len);
      try {
        const msg = JSON.parse(msgStr);
        (async () => { const r = await handleMCPRequest(msg); if (r) { const d = r.toString(); process.stdout.write("Content-Length: " + Buffer.byteLength(d) + "

" + d); } })();
      } catch {}
    }
  });
  process.stdin.on("end", () => process.exit(0));
  process.stderr.write("TBH MCP Server running on stdio\n");
}

// ===== HTTP SSE 传输 =====

async function runHTTP(port) {
  const sessions = new Map();

  const server = createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // SSE endpoint
    if (req.url === '/sse' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      const sessionId = randomUUID();
      sessions.set(sessionId, { res, timer: setTimeout(() => { res.end(); sessions.delete(sessionId); }, 300000) });
      res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);
      req.on('close', () => { clearTimeout(sessions.get(sessionId)?.timer); sessions.delete(sessionId); });
      return;
    }

    // Message endpoint
    if (req.url?.startsWith('/messages') && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const msg = JSON.parse(body);
          const response = await handleMCPRequest(msg);
          const sessionId = new URL(req.url, 'http://localhost').searchParams.get('sessionId');
          const session = sessions.get(sessionId);
          if (session && response) {
            session.res.write(`event: message\ndata: ${response}\n\n`);
          }
          res.writeHead(202);
          res.end();
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // A2A Agent Discovery 端点 (Google A2A 规范)
    if (req.url === '/.well-known/agent.json' && req.method === 'GET') {
      const host = req.headers.host || `localhost:${port}`;
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(generateAgentCard(`${protocol}://${host}`), null, 2));
      return;
    }

    // A2A 协议翻译端点
    if (req.url === '/a2a' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const a2aMsg = JSON.parse(body);
          const { action, args, agentId } = a2aMsg;
          const mcpTool = A2A_TO_MCP[action];

          // 权限校验
          const tokenConfig = await loadTokenConfig();
          if (!tokenConfig) { res.writeHead(401); res.end(JSON.stringify({ error: 'Authentication required' })); return; }
          if (mcpTool) {
            const { allowed, missing } = checkPermission(mcpTool, tokenConfig.permissions);
            if (!allowed) {
              await writeAuditLog({ agentId: agentId || 'unknown', toolName: action, result: 'denied', error: `Missing: ${missing.join(',')}`, protocol: 'a2a' });
              res.writeHead(403); res.end(JSON.stringify({ error: `Permission denied. Missing: ${missing.join(', ')}` })); return;
            }
          }

          const startMs = Date.now();
          const result = mcpTool ? await executeTool(mcpTool, args || {}) : { error: `Unknown A2A action: ${action}` };
          const durationMs = Date.now() - startMs;

          await writeAuditLog({ agentId: agentId || 'unknown', toolName: mcpTool || action, result: result.error ? 'error' : 'success', protocol: 'a2a', durationMs });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: !result.error, data: result, protocol: 'a2a' }));
        } catch (e) {
          res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // 审计日志端点
    if (req.url === '/audit' && req.method === 'GET') {
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const logPath = path.join(process.env.HOME || '.', '.tbh-agent-audit.jsonl');
        if (!fs.existsSync(logPath)) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ logs: [], total: 0 })); return; }
        const content = fs.readFileSync(logPath, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean).slice(-100);
        const logs = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ logs, total: logs.length }));
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // Health check
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', server: 'tbh-mcp-server', version: '1.0.0', tools: tools.length, protocols: ['mcp', 'a2a', 'rest'] }));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, () => {
    process.stderr.write(`TBH MCP Server running on HTTP port ${port}\n`);
    process.stderr.write(`SSE endpoint: http://localhost:${port}/sse\n`);
    process.stderr.write(`Health check: http://localhost:${port}/health\n`);
  });
}

// ===== A2A Agent Discovery (Google A2A 规范) =====

function generateAgentCard(baseUrl) {
  return {
    name: 'team-business-hub',
    version: '1.0.0',
    description: '团队业务中台 — 目标管理(OKR+KPI双轨)、任务闭环、项目协同、智能预测。支持MCP/A2A双协议。',
    url: baseUrl,
    capabilities: [
      { id: 'goals', name: '目标管理', description: 'OKR+KPI双轨CRUD、进度追踪、双轨汇总', protocol: 'mcp' },
      { id: 'tasks', name: '任务管理', description: '任务CRUD、状态流转、依赖、KR联动', protocol: 'mcp' },
      { id: 'projects', name: '项目管理', description: '项目CRUD、甘特图、分组进度', protocol: 'mcp' },
      { id: 'analytics', name: '智能分析', description: 'CPM、延期预测(自学习)、KPI评分、资源瓶颈', protocol: 'mcp' },
      { id: 'prediction', name: '预测引擎', description: '四维预测: 延期+资源+OKR达成+风险前置', protocol: 'a2a' },
      { id: 'collaboration', name: '协作通知', description: '推送通知、评论、状态变更', protocol: 'rest' },
    ],
    authentication: { type: 'bearer-token', description: 'API Token via Authorization header or TBH_API_TOKEN env' },
    provider: { name: 'Team Business Hub', url: baseUrl },
  };
}

// ===== A2A ↔ MCP 协议翻译 =====

const A2A_TO_MCP = {
  'goals.list': 'list_goals', 'goals.get': 'get_goal', 'goals.create': 'create_goal', 'goals.update': 'update_goal', 'goals.delete': 'delete_goal',
  'tasks.list': 'list_tasks', 'tasks.get': 'get_task', 'tasks.create': 'create_task', 'tasks.update': 'update_task', 'tasks.delete': 'delete_task',
  'projects.list': 'list_projects', 'projects.get': 'get_project', 'projects.create': 'create_project', 'projects.update': 'update_project',
  'analytics.critical_path': 'get_critical_path', 'analytics.predict_delay': 'predict_delay', 'analytics.kpi_score': 'calc_kpi_score',
  'analytics.resource_bottleneck': 'resource_bottleneck', 'analytics.recommend_assignee': 'recommend_assignee',
  'prediction.delay': 'predict_delay', 'prediction.resource': 'resource_bottleneck', 'prediction.okr': 'calc_kpi_score', 'prediction.risk': 'predict_delay',
};

// ===== Agent 审计日志 =====

const AUDIT_LOG_FILE = () => {
  const path = await import('node:path');
  return path.join(process.env.HOME || '.', '.tbh-agent-audit.jsonl');
};

async function writeAuditLog(entry) {
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const logPath = path.join(process.env.HOME || '.', '.tbh-agent-audit.jsonl');
    const line = JSON.stringify({ ...entry, id: `audit_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, timestamp: new Date().toISOString() }) + '\n';
    fs.appendFileSync(logPath, line);
  } catch {}
}

// ===== 启动 =====

const args = process.argv.slice(2);
const httpMode = args.includes('--http');
const portIdx = args.indexOf('--port');
const port = portIdx >= 0 ? parseInt(args[portIdx + 1]) : 3100;

if (httpMode) {
  runHTTP(port);
} else {
  runStdio();
}
