/**
 * useDetailFromUrl — 从 URL itemId 参数驱动详情面板
 * 替代 tbh-open-detail DOM 事件
 */
import { useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

interface UseDetailFromUrlOptions {
  itemType: 'goal' | 'project' | 'task';
  basePath: '/goals' | '/projects' | '/tasks';
}

export function useDetailFromUrl(options: UseDetailFromUrlOptions) {
  const { itemType, basePath } = options;
  const params = useParams<{ itemId?: string }>();
  const navigate = useNavigate();
  const itemId = params.itemId || null;

  const detailItem = itemId ? { type: itemType, id: itemId } : null;
  const closeDetail = useCallback(() => {
    navigate(basePath, { replace: true });
  }, [navigate, basePath]);
  const openDetail = useCallback((id: string) => {
    navigate(`${basePath}/${id}`);
  }, [navigate, basePath]);

  return { detailItem, openDetail, closeDetail };
}

/**
 * useFiltersFromUrl — 从 URL search params 读取过滤器
 * 替代 tbh-nav-filter DOM 事件
 */
import { useSearchParams } from 'react-router-dom';

export function useFiltersFromUrl() {
  const [searchParams] = useSearchParams();

  const statuses = searchParams.get('statuses') ? new Set(searchParams.get('statuses')!.split(',')) : undefined;
  const timeFilter = searchParams.get('timeFilter') || undefined;
  const persons = searchParams.get('persons') ? searchParams.get('persons')!.split(',') : undefined;

  return { statuses, timeFilter, persons };
}
