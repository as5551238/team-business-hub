/**
 * REST API 开放层 — Agent友好基础
 *
 * 基于 Supabase REST + RPC 封装业务逻辑 API
 * 权限校验 + 数据校验 + 标准化响应
 *
 * E1: 核心CRUD操作（goals/projects/tasks/members）通过API可读写
 */
import { supabaseInsert, supabaseUpdate, supabaseDelete } from '@/store/supabase';

// ===== API Token 认证 =====
const API_TOKEN_KEY = 'tbh-api-tokens';

export interface ApiToken {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  permissions: string[]; // e.g. ['goals:read', 'tasks:write']
}

export function getApiTokens(): ApiToken[] {
  try {
    return JSON.parse(localStorage.getItem(API_TOKEN_KEY) || '[]');
  } catch { return []; }
}

export function saveApiTokens(tokens: ApiToken[]) {
  localStorage.setItem(API_TOKEN_KEY, JSON.stringify(tokens));
}

export function createApiToken(name: string, permissions: string[]): ApiToken {
  const token: ApiToken = {
    id: `tk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    token: `tbh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    permissions,
  };
  const tokens = getApiTokens();
  tokens.push(token);
  saveApiTokens(tokens);
  return token;
}

export function revokeApiToken(tokenId: string) {
  const tokens = getApiTokens().filter(t => t.id !== tokenId);
  saveApiTokens(tokens);
}

// ===== API 响应格式 =====
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  count?: number;
}

// ===== CRUD 操作 =====

/** 通用查询 — 通过 Supabase REST API 直接查询 */
export function getApiBaseUrl(): string {
  return 'https://atexvoyvnnuaonvrgzhn.supabase.co/rest/v1';
}

export function getApiHeaders(): Record<string, string> {
  return {
    'apikey': 'sb_publishable_WeMPVE8GNCTOqrE7OZhTIw_WXJaz2Ie',
    'Authorization': 'Bearer sb_publishable_WeMPVE8GNCTOqrE7OZhTIw_WXJaz2Ie',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

/** 通用创建 */
export async function apiCreate(table: string, record: Record<string, any>): Promise<ApiResponse> {
  try {
    if (record.title && record.title.length > 200) return { success: false, error: '标题不能超过200字符' };
    const result = await supabaseInsert(table, record);
    return { success: true, data: result };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** 通用更新 */
export async function apiUpdate(table: string, id: string, updates: Record<string, any>): Promise<ApiResponse> {
  try {
    if (updates.title && updates.title.length > 200) return { success: false, error: '标题不能超过200字符' };
    const result = await supabaseUpdate(table, id, updates);
    return { success: true, data: result };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** 通用删除 */
export async function apiDelete(table: string, id: string): Promise<ApiResponse> {
  try {
    await supabaseDelete(table, id);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ===== 权限校验中间件 =====

const TOOL_PERMISSIONS: Record<string, string[]> = {
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

/** 所有可用权限及其描述 */
export const ALL_PERMISSIONS: Array<{ value: string; label: string; group: string }> = [
  // Goals
  { value: 'goals:read', label: '目标-读取', group: '目标' },
  { value: 'goals:write', label: '目标-写入', group: '目标' },
  // Projects
  { value: 'projects:read', label: '项目-读取', group: '项目' },
  { value: 'projects:write', label: '项目-写入', group: '项目' },
  // Tasks
  { value: 'tasks:read', label: '任务-读取', group: '任务' },
  { value: 'tasks:write', label: '任务-写入', group: '任务' },
  // Members
  { value: 'members:read', label: '成员-读取', group: '成员' },
  // Analytics
  { value: 'analytics:read', label: '智能分析', group: '分析' },
  // Admin
  { value: 'admin', label: '全部权限', group: '管理' },
];

/**
 * API 请求权限校验
 * @param tokenValue API Token 字符串
 * @param requiredPermissions 需要的权限列表
 * @returns 校验结果
 */
export function validateApiRequest(
  tokenValue: string,
  requiredPermissions: string[],
): { valid: boolean; token?: ApiToken; missing: string[] } {
  const tokens = getApiTokens();
  const token = tokens.find(t => t.token === tokenValue);
  if (!token) return { valid: false, missing: requiredPermissions };

  // admin 权限 = 全部通过
  if (token.permissions.includes('admin')) return { valid: true, token, missing: [] };

  const missing = requiredPermissions.filter(p => !token.permissions.includes(p));
  return { valid: missing.length === 0, token, missing };
}

/**
 * 按操作类型校验权限
 * 根据 tool name 自动映射所需权限
 */
export function validateToolAccess(
  tokenValue: string,
  toolName: string,
): { valid: boolean; token?: ApiToken; missing: string[] } {
  const required = TOOL_PERMISSIONS[toolName];
  if (!required) return { valid: false, missing: [`Unknown tool: ${toolName}`] };
  return validateApiRequest(tokenValue, required);
}

// ===== 业务 API =====

/** Goals API */
export const goalsApi = {
  create: (record: any) => apiCreate('goals', record),
  update: (id: string, updates: any) => apiUpdate('goals', id, updates),
  delete: (id: string) => apiDelete('goals', id),
};

/** Projects API */
export const projectsApi = {
  create: (record: any) => apiCreate('projects', record),
  update: (id: string, updates: any) => apiUpdate('projects', id, updates),
  delete: (id: string) => apiDelete('projects', id),
};

/** Tasks API */
export const tasksApi = {
  create: (record: any) => apiCreate('tasks', record),
  update: (id: string, updates: any) => apiUpdate('tasks', id, updates),
  delete: (id: string) => apiDelete('tasks', id),
};

// ===== API 文档端点 =====

export interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  params?: string[];
}

export function getApiEndpoints(): ApiEndpoint[] {
  return [
    { method: 'GET', path: '/api/goals', description: '获取目标列表', params: ['status', 'category', 'leader_id'] },
    { method: 'GET', path: '/api/goals/:id', description: '获取单个目标' },
    { method: 'POST', path: '/api/goals', description: '创建目标', params: ['title', 'type', 'priority', 'start_date', 'end_date'] },
    { method: 'PATCH', path: '/api/goals/:id', description: '更新目标' },
    { method: 'DELETE', path: '/api/goals/:id', description: '删除目标' },
    { method: 'GET', path: '/api/projects', description: '获取项目列表', params: ['status', 'goal_id'] },
    { method: 'GET', path: '/api/projects/:id', description: '获取单个项目' },
    { method: 'POST', path: '/api/projects', description: '创建项目' },
    { method: 'PATCH', path: '/api/projects/:id', description: '更新项目' },
    { method: 'DELETE', path: '/api/projects/:id', description: '删除项目' },
    { method: 'GET', path: '/api/tasks', description: '获取任务列表', params: ['status', 'project_id', 'leader_id'] },
    { method: 'GET', path: '/api/tasks/:id', description: '获取单个任务' },
    { method: 'POST', path: '/api/tasks', description: '创建任务' },
    { method: 'PATCH', path: '/api/tasks/:id', description: '更新任务' },
    { method: 'DELETE', path: '/api/tasks/:id', description: '删除任务' },
    { method: 'GET', path: '/api/members', description: '获取成员列表' },
    { method: 'GET', path: '/api/members/:id', description: '获取单个成员' },
  ];
}
