/**
 * REST API 开放层 — Agent友好基础
 *
 * 基于 Supabase REST + RPC 封装业务逻辑 API
 * 权限校验 + 数据校验 + 标准化响应
 *
 * E1: 核心CRUD操作（goals/projects/tasks/members）通过API可读写
 */
import { supabaseInsert, supabaseUpdate, supabaseDelete } from '@/store/supabase';
import { handleError } from '@/lib/errorHandler';

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
  } catch (e) { handleError(e, { module: 'api', operation: 'LOAD_TOKENS', severity: 'debug' }); return []; }
}

/** DB-first async load: query api_tokens, cache to localStorage */
export async function getApiTokensFromDB(teamId: string): Promise<ApiToken[]> {
  try {
    const { getSupabaseClient } = await import('@/supabase/client');
    const sb = getSupabaseClient();
    if (!sb) return getApiTokens();
    const { data, error } = await sb.from('api_tokens').select('*').eq('team_id', teamId).order('created_at', { ascending: false });
    if (!error && data) {
      const tokens: ApiToken[] = data.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: r.name as string,
        token: r.token_prefix as string + '...', // DB stores hash, show prefix only
        createdAt: r.created_at as string,
        permissions: (r.permissions as string[]) || [],
      }));
      try { localStorage.setItem(API_TOKEN_KEY, JSON.stringify(tokens)); } catch (e) { /* ignore */ }
      return tokens;
    }
  } catch (e) { handleError(e, { module: 'api', operation: 'LOAD_TOKENS_DB', severity: 'debug' }); }
  return getApiTokens();
}

function saveApiTokens(tokens: ApiToken[]) {
  try { localStorage.setItem(API_TOKEN_KEY, JSON.stringify(tokens)); } catch (e) { handleError(e, { module: 'api', operation: 'SAVE_TOKENS', severity: 'debug' }); }
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
  // Async write to DB (store hash + prefix, NOT the raw token)
  saveApiTokenToDB(token);
  return token;
}

async function saveApiTokenToDB(token: ApiToken): Promise<void> {
  try {
    const { getSupabaseClient } = await import('@/supabase/client');
    const { getCurrentTeamId } = await import('@/store/supabase');
    const sb = getSupabaseClient();
    if (!sb) return;
    const teamId = getCurrentTeamId();
    if (!teamId) return;
    const userId = localStorage.getItem('tbh-current-user');
    // Store token_hash (simple hash for demo — production should use bcrypt)
    const tokenHash = await simpleHash(token.token);
    await sb.from('api_tokens').insert({
      id: token.id,
      team_id: teamId,
      name: token.name,
      token_hash: tokenHash,
      token_prefix: token.token.slice(0, 8),
      permissions: token.permissions,
      created_by: userId || null,
    });
  } catch (e) { handleError(e, { module: 'api', operation: 'SAVE_TOKEN_DB', severity: 'debug' }); }
}

async function simpleHash(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function revokeApiToken(tokenId: string) {
  const tokens = getApiTokens().filter(t => t.id !== tokenId);
  saveApiTokens(tokens);
  // Async delete from DB
  revokeApiTokenFromDB(tokenId);
}

async function revokeApiTokenFromDB(tokenId: string): Promise<void> {
  try {
    const { getSupabaseClient } = await import('@/supabase/client');
    const sb = getSupabaseClient();
    if (!sb) return;
    await sb.from('api_tokens').delete().eq('id', tokenId);
  } catch (e) { handleError(e, { module: 'api', operation: 'REVOKE_TOKEN_DB', severity: 'debug' }); }
}

// ===== API 响应格式 =====
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  count?: number;
}

// ===== CRUD 操作 =====

/** 通用创建 */
export async function apiCreate(table: string, record: Record<string, unknown>): Promise<ApiResponse> {
  try {
    if (record.title && record.title.length > 200) return { success: false, error: '标题不能超过200字符' };
    const result = await supabaseInsert(table, record);
    return { success: true, data: result };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 通用更新 */
export async function apiUpdate(table: string, id: string, updates: Record<string, unknown>): Promise<ApiResponse> {
  try {
    if (updates.title && updates.title.length > 200) return { success: false, error: '标题不能超过200字符' };
    const result = await supabaseUpdate(table, id, updates);
    return { success: true, data: result };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 通用删除 */
export async function apiDelete(table: string, id: string): Promise<ApiResponse> {
  try {
    await supabaseDelete(table, id);
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
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
function validateApiRequest(
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



