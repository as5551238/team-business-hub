/**
 * Outlook Token Manager
 *
 * 管理 Microsoft Graph API 的 access_token / refresh_token。
 * 支持两种连接方式：
 *   - manual: 用户手动粘贴 access_token（从 Graph Explorer 获取）
 *   - oauth:  标准 OAuth2 授权码流程（待 IT 审批后启用）
 *
 * 设计原则：connection-method-agnostic，上层 graphClient 不关心 token 来源。
 */

import type { OutlookTokenData } from '@/types';
import { handleError } from '@/lib/errorHandler';

const TOKEN_STORAGE_KEY = 'tbh-outlook-token';

// ===== 读取 =====

export function loadToken(): OutlookTokenData | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as OutlookTokenData;
    if (!data.accessToken || !data.expiresAt) return null;
    return data;
  } catch (e) {
    handleError(e, { module: 'outlook/tokenManager', operation: 'LOAD', severity: 'debug' });
    return null;
  }
}

/** DB-first async load: query oauth_tokens, fallback to localStorage cache */
export async function loadTokenFromDB(teamId: string, memberId: string): Promise<OutlookTokenData | null> {
  try {
    const { getSupabaseClient } = await import('@/supabase/client');
    const sb = getSupabaseClient();
    if (!sb) return loadToken();
    const { data, error } = await sb.from('oauth_tokens').select('*').eq('team_id', teamId).eq('member_id', memberId).eq('provider', 'outlook').single();
    if (!error && data) {
      const tokenData: OutlookTokenData = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || undefined,
        expiresAt: data.expires_at || '',
        connectedEmail: data.connected_email || undefined,
        connectionMethod: 'oauth',
      };
      // Cache to localStorage for sync reads
      try { localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokenData)); } catch (e) { /* ignore */ }
      return tokenData;
    }
  } catch (e) { handleError(e, { module: 'outlook/tokenManager', operation: 'LOAD_DB', severity: 'debug' }); }
  return loadToken();
}

// ===== 保存 =====

export function saveToken(token: OutlookTokenData): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
  } catch (e) {
    handleError(e, { module: 'outlook/tokenManager', operation: 'SAVE', severity: 'warning' });
  }
  // Async write to DB
  saveTokenToDB(token);
}

async function saveTokenToDB(token: OutlookTokenData): Promise<void> {
  try {
    const { getSupabaseClient } = await import('@/supabase/client');
    const { getCurrentTeamId } = await import('@/store/supabase');
    const sb = getSupabaseClient();
    if (!sb) return;
    const teamId = getCurrentTeamId();
    const userId = localStorage.getItem('tbh-current-user');
    if (!teamId || !userId) return;
    await sb.from('oauth_tokens').upsert({
      team_id: teamId,
      member_id: userId,
      provider: 'outlook',
      access_token: token.accessToken,
      refresh_token: token.refreshToken || null,
      expires_at: token.expiresAt || null,
      connected_email: token.connectedEmail || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'team_id,member_id,provider' });
  } catch (e) { handleError(e, { module: 'outlook/tokenManager', operation: 'SAVE_DB', severity: 'debug' }); }
}

// ===== 删除 =====

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (e) {
    handleError(e, { module: 'outlook/tokenManager', operation: 'CLEAR', severity: 'debug' });
  }
  // Async delete from DB
  clearTokenFromDB();
}

async function clearTokenFromDB(): Promise<void> {
  try {
    const { getSupabaseClient } = await import('@/supabase/client');
    const { getCurrentTeamId } = await import('@/store/supabase');
    const sb = getSupabaseClient();
    if (!sb) return;
    const teamId = getCurrentTeamId();
    const userId = localStorage.getItem('tbh-current-user');
    if (!teamId || !userId) return;
    await sb.from('oauth_tokens').delete().eq('team_id', teamId).eq('member_id', userId).eq('provider', 'outlook');
  } catch (e) { handleError(e, { module: 'outlook/tokenManager', operation: 'CLEAR_DB', severity: 'debug' }); }
}

// ===== 过期检测 =====

/** 提前 5 分钟视为过期，给刷新留出时间 */
function isTokenExpired(token: OutlookTokenData | null): boolean {
  if (!token) return true;
  const expiresAt = new Date(token.expiresAt).getTime();
  const buffer = 5 * 60 * 1000; // 5 min
  return Date.now() >= expiresAt - buffer;
}

// ===== 手动 Token 输入 =====

export interface ManualTokenInput {
  accessToken: string;
  /** 手动输入模式下，用户自行设定过期时间，默认 1 小时 */
  expiresInSeconds?: number;
  /** 用户邮箱，仅用于 UI 展示 */
  email?: string;
}

export function connectManualToken(input: ManualTokenInput): OutlookTokenData {
  const expiresInSeconds = input.expiresInSeconds || 3600;
  const now = Date.now();
  const token: OutlookTokenData = {
    provider: 'microsoft',
    connectionMethod: 'manual',
    accessToken: input.accessToken.trim(),
    refreshToken: null,
    expiresAt: new Date(now + expiresInSeconds * 1000).toISOString(),
    scope: 'Calendars.Read Mail.Read',
    providerAccountId: null,
    connectedEmail: input.email?.trim() || null,
  };
  saveToken(token);
  return token;
}

// ===== Token 刷新（OAuth 模式预留）=====

/**
 * 使用 refresh_token 刷新 access_token。
 * 手动输入模式下无 refresh_token，此函数直接返回 null。
 * OAuth 模式启用后，此函数调用 Microsoft token endpoint。
 */
export async function refreshAccessToken(token: OutlookTokenData): Promise<OutlookTokenData | null> {
  if (token.connectionMethod === 'manual') {
    // 手动 token 不支持自动刷新，用户需重新粘贴
    return null;
  }

  // OAuth 模式：待 IT 审批后启用
  // TODO(OAUTH): 实现参考 Microsoft token endpoint API v2.0
  // 需 OUTLOOK_CLIENT_ID + refresh_token → access_token 刷新流程
  // 搜索此 TODO 获取详细实现模板

  return null;
}

// ===== 获取可用 Token（自动刷新）=====

/**
 * 获取有效的 access_token。如果 token 过期：
 * - manual 模式：返回 null（需用户重新输入）
 * - oauth 模式：自动刷新
 */
export async function getValidToken(): Promise<string | null> {
  const token = loadToken();
  if (!token) return null;
  if (!isTokenExpired(token)) return token.accessToken;

  const refreshed = await refreshAccessToken(token);
  if (refreshed) return refreshed.accessToken;

  return null;
}

// ===== 连接状态查询 =====

export interface OutlookConnectionStatus {
  connected: boolean;
  connectionMethod: 'manual' | 'oauth' | null;
  connectedEmail: string | null;
  expiresAt: string | null;
  isExpired: boolean;
}

export function getConnectionStatus(): OutlookConnectionStatus {
  const token = loadToken();
  if (!token) {
    return { connected: false, connectionMethod: null, connectedEmail: null, expiresAt: null, isExpired: true };
  }
  const expired = isTokenExpired(token);
  return {
    connected: !expired,
    connectionMethod: token.connectionMethod,
    connectedEmail: token.connectedEmail,
    expiresAt: token.expiresAt,
    isExpired: expired,
  };
}
