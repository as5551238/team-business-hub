/**
 * Microsoft Graph API Client
 *
 * 通用 Graph API 请求封装，内建：
 * - 自动 token 附加
 * - 401 自动刷新 token（oauth 模式）
 * - 指数退避重试
 * - 错误分类
 */

import { getValidToken, clearToken, loadToken, refreshAccessToken, saveToken } from './tokenManager';
import { handleError } from '@/lib/errorHandler';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export class GraphApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'GraphApiError';
  }
}

export interface GraphRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;           // e.g. '/me/calendarView'
  params?: Record<string, string>;
  body?: unknown;
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
}

export interface GraphResponse<T> {
  value: T;
  /** @nextLink for pagination */
  nextLink?: string;
}

/**
 * 执行一次 Graph API 请求
 */
export async function graphRequest<T = unknown>(options: GraphRequestOptions): Promise<T> {
  const { method = 'GET', path, params, body, maxRetries = 3 } = options;

  let url = `${GRAPH_BASE}${path}`;
  if (params && Object.keys(params).length > 0) {
    url += '?' + new URLSearchParams(params).toString();
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const token = await getValidToken();
    if (!token) {
      throw new GraphApiError(401, 'TokenExpired', 'Outlook 未连接或 Token 已过期，请在集成设置中重新输入');
    }

    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const fetchOpts: RequestInit = { method, headers };
      if (body && method !== 'GET' && method !== 'DELETE') {
        fetchOpts.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOpts);

      // 成功
      if (response.ok) {
        if (response.status === 204 || method === 'DELETE') {
          return undefined as T;
        }
        const data = await response.json();
        return data as T;
      }

      // 401 — token 过期，尝试刷新一次
      if (response.status === 401 && attempt === 0) {
        const currentToken = loadToken();
        if (currentToken) {
          const refreshed = await refreshAccessToken(currentToken);
          if (refreshed) {
            saveToken(refreshed);
            continue; // 重试
          }
        }
        // 刷新失败或 manual 模式
        clearToken();
        throw new GraphApiError(401, 'TokenExpired', 'Token 已过期，请重新输入');
      }

      // 429 — 限流，遵循 Retry-After
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
        if (attempt < maxRetries) {
          await sleep(retryAfter * 1000);
          continue;
        }
      }

      // 5xx — 服务器错误，指数退避
      if (response.status >= 500 && attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }

      // 其他错误
      const errorData = await response.json().catch(() => ({}));
      const errorCode = errorData?.error?.code || null;
      const errorMessage = errorData?.error?.message || `Graph API 请求失败 (${response.status})`;
      throw new GraphApiError(response.status, errorCode, errorMessage);

    } catch (err) {
      if (err instanceof GraphApiError) throw err;
      lastError = err as Error;
      // 网络错误，指数退避
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
    }
  }

  throw lastError || new GraphApiError(0, 'NetworkError', '网络请求失败，请检查网络连接');
}

/** 分页获取所有结果 */
export async function graphRequestAll<T = unknown>(options: GraphRequestOptions): Promise<T[]> {
  const firstPage = await graphRequest<GraphResponse<T[]>>(options);
  const results: T[] = [...(firstPage.value || [])];

  let nextLink = firstPage.nextLink || (firstPage as Record<string, unknown>)['@odata.nextLink'] as string | undefined;

  // 安全限制：最多 10 页
  let pageCount = 0;
  while (nextLink && pageCount < 10) {
    const path = nextLink.replace(GRAPH_BASE, '');
    const page = await graphRequest<GraphResponse<T[]>>({ ...options, path, params: undefined });
    results.push(...(page.value || []));
    nextLink = (page as Record<string, unknown>)['@odata.nextLink'] as string | undefined;
    pageCount++;
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
