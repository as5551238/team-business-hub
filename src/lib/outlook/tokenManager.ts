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

// ===== 保存 =====

export function saveToken(token: OutlookTokenData): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
  } catch (e) {
    handleError(e, { module: 'outlook/tokenManager', operation: 'SAVE', severity: 'warning' });
  }
}

// ===== 删除 =====

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (e) {
    handleError(e, { module: 'outlook/tokenManager', operation: 'CLEAR', severity: 'debug' });
  }
}

// ===== 过期检测 =====

/** 提前 5 分钟视为过期，给刷新留出时间 */
export function isTokenExpired(token: OutlookTokenData | null): boolean {
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

  // OAuth 模式：调用 Microsoft token endpoint
  // 预留实现，等 IT 审批 OAuth 后启用
  // const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  //   body: new URLSearchParams({
  //     client_id: OUTLOOK_CLIENT_ID,
  //     grant_type: 'refresh_token',
  //     refresh_token: token.refreshToken,
  //     scope: 'Calendars.ReadWrite Mail.Read offline_access',
  //   }),
  // });
  // if (!response.ok) return null;
  // const data = await response.json();
  // const newToken: OutlookTokenData = { ... };
  // saveToken(newToken);
  // return newToken;

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
