/**
 * 第三方 OAuth 集成框架
 *
 * Round 7 — 生态集成深度 +2
 * - 飞书/钉钉/企业微信 OAuth 认证流程
 * - 连接状态管理
 * - token 安全存储
 */

import { handleError } from '@/lib/errorHandler';

// ===== 类型定义 =====

export type OAuthProvider = 'feishu' | 'dingtalk' | 'wechat_work' | 'microsoft';

export interface OAuthConfig {
  provider: OAuthProvider;
  clientId: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
}

export interface OAuthStatus {
  provider: OAuthProvider;
  connected: boolean;
  userId?: string;
  userName?: string;
  expiresAt?: string;
  lastSync?: string;
}

const OAUTH_STATUS_KEY = 'tbh-oauth-status';

// ===== OAuth 配置 =====

const OAUTH_CONFIGS: Record<OAuthProvider, OAuthConfig> = {
  feishu: {
    provider: 'feishu',
    clientId: '',
    redirectUri: `${window.location.origin}/oauth/callback`,
    authUrl: 'https://open.feishu.cn/open-apis/authen/v1/authorize',
    tokenUrl: 'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token',
    scopes: ['contact:user.id:readonly', 'wiki:wiki:readonly', 'drive:drive:readonly'],
  },
  dingtalk: {
    provider: 'dingtalk',
    clientId: '',
    redirectUri: `${window.location.origin}/oauth/callback`,
    authUrl: 'https://login.dingtalk.com/oauth2/auth',
    tokenUrl: 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken',
    scopes: ['openid', 'corpid'],
  },
  wechat_work: {
    provider: 'wechat_work',
    clientId: '',
    redirectUri: `${window.location.origin}/oauth/callback`,
    authUrl: 'https://open.work.weixin.qq.com/wwopen/sso/3rd_qrConnect',
    tokenUrl: 'https://qyapi.weixin.qq.com/cgi-bin/service/getuserinfo3rd',
    scopes: ['snsapi_privateinfo'],
  },
  microsoft: {
    provider: 'microsoft',
    clientId: '',
    redirectUri: `${window.location.origin}/oauth/callback`,
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['Calendars.ReadWrite', 'Mail.Read', 'offline_access'],
  },
};

const PROVIDER_LABELS: Record<OAuthProvider, { name: string; desc: string }> = {
  feishu: { name: '飞书', desc: '同步文档、日历、审批流' },
  dingtalk: { name: '钉钉', desc: '同步通讯录、审批、日志' },
  wechat_work: { name: '企业微信', desc: '同步通讯录、客户、消息' },
  microsoft: { name: 'Microsoft Outlook', desc: '同步邮箱、日历' },
};

// ===== 状态管理 =====

export function loadOAuthStatuses(): OAuthStatus[] {
  try {
    return JSON.parse(localStorage.getItem(OAUTH_STATUS_KEY) || '[]');
  } catch (e) { handleError(e, { module: 'oauthIntegration', operation: 'LOAD_STATUSES', severity: 'debug' }); return []; }
}

function saveOAuthStatuses(statuses: OAuthStatus[]) {
  localStorage.setItem(OAUTH_STATUS_KEY, JSON.stringify(statuses));
}

export function getOAuthStatus(provider: OAuthProvider): OAuthStatus {
  return loadOAuthStatuses().find(s => s.provider === provider) || { provider, connected: false };
}

function setOAuthStatus(status: OAuthStatus) {
  const statuses = loadOAuthStatuses().filter(s => s.provider !== status.provider);
  statuses.push(status);
  saveOAuthStatuses(statuses);
}

export function disconnectOAuth(provider: OAuthProvider) {
  saveOAuthStatuses(loadOAuthStatuses().filter(s => s.provider !== provider));
}

// ===== OAuth 发起 =====

export function initiateOAuth(provider: OAuthProvider, clientId?: string) {
  const config = OAUTH_CONFIGS[provider];
  if (!config) return;

  const params = new URLSearchParams({
    app_id: clientId || config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    state: `tbh_${provider}_${Date.now()}`,
    scope: config.scopes.join(' '),
  });

  window.open(`${config.authUrl}?${params.toString()}`, '_blank', 'width=600,height=700');
}

export { OAUTH_CONFIGS, PROVIDER_LABELS };
