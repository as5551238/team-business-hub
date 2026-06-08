/**
 * 路由配置 — 统一管理所有路由路径、类型和导航工具
 * S2-1: 将自建 hash 路由迁移至 react-router-dom HashRouter
 */
import { useCallback, useMemo } from 'react';
import { useNavigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import type { Page } from '@/components/layout/Layout';

// ─── 导航 Hook

const PATH_TO_PAGE: Record<string, Page> = {
  '/dashboard': 'dashboard',
  '/goals': 'goals',
  '/projects': 'projects',
  '/tasks': 'tasks',
  '/insight': 'insight',
  '/knowledge': 'knowledge',
  '/admin': 'admin',
  '/privacy': 'privacy',
};

export const PAGE_TO_PATH: Record<Page, string> = {
  dashboard: '/dashboard',
  goals: '/goals',
  projects: '/projects',
  tasks: '/tasks',
  insight: '/insight',
  knowledge: '/knowledge',
  admin: '/admin',
  privacy: '/privacy',
};

/** 合法的顶层路径（用于匹配当前页面） */
const VALID_TOP_PATHS = new Set(Object.keys(PATH_TO_PAGE));

/** 从 pathname 提取当前 page key */
export function getPageFromPathname(pathname: string): Page {
  // pathname 格式: /goals, /tasks/glb_xxx, /dashboard
  const topPath = '/' + (pathname.split('/')[1] || 'dashboard');
  return PATH_TO_PAGE[topPath] || 'dashboard';
}

// ─── 导航 Hook ──────────────────────────────────────────────

/** 类型安全的应用导航 hook */
export function useAppNavigate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  /** 导航到指定页面 */
  const goToPage = useCallback((page: Page) => {
    navigate(PAGE_TO_PATH[page]);
  }, [navigate]);

  /** 导航到指定条目（打开详情面板） */
  const goToItem = useCallback((itemType: 'goal' | 'project' | 'task', itemId: string) => {
    const basePath = itemType === 'goal' ? '/goals' : itemType === 'project' ? '/projects' : '/tasks';
    navigate(`${basePath}/${itemId}`);
  }, [navigate]);

  /** 在当前页面选择条目（不改变页面，只改 URL 中的 itemId） */
  const selectItem = useCallback((itemId: string | null) => {
    const loc = window.location;
    const parts = loc.pathname.split('/');
    const basePath = '/' + (parts[1] || 'tasks');
    if (itemId) {
      navigate(`${basePath}/${itemId}`);
    } else {
      navigate(basePath);
    }
  }, [navigate]);

  /** 导航到页面并应用过滤器 */
  const goWithFilter = useCallback((page: Page, filters: Record<string, string | string[]>) => {
    const params = new URLSearchParams();
    for (const [key, val] of Object.entries(filters)) {
      if (Array.isArray(val)) {
        params.set(key, val.join(','));
      } else {
        params.set(key, val);
      }
    }
    navigate(`${PAGE_TO_PATH[page]}?${params.toString()}`);
  }, [navigate]);

  /** 设置当前页面的 search params（不跳转页面） */
  const setSearchParamsMerged = useCallback((updates: Record<string, string | string[] | undefined>) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, val] of Object.entries(updates)) {
      if (val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) {
        params.delete(key);
      } else if (Array.isArray(val)) {
        params.set(key, val.join(','));
      } else {
        params.set(key, val);
      }
    }
    navigate(`?${params.toString()}`, { replace: true });
  }, [navigate, searchParams]);

  return { goToPage, goToItem, selectItem, goWithFilter, setSearchParamsMerged };
}

// ─── 页面信息 Hook ──────────────────────────────────────────

/** 获取当前页面信息和 URL 参数 */
export function usePageInfo() {
  const location = useLocation();
  const params = useParams<{ itemId?: string }>();
  const [searchParams] = useSearchParams();

  const currentPage = useMemo(() => getPageFromPathname(location.pathname), [location.pathname]);
  const itemId = params.itemId || null;
  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    searchParams.forEach((val, key) => { f[key] = val; });
    return f;
  }, [searchParams]);

  return { currentPage, itemId, filters, searchParams, pathname: location.pathname };
}


