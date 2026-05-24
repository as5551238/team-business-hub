import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * 虚拟滚动 hook：计算可见范围，只渲染视口内的行
 * 适用于固定行高的列表和表格视图
 * - rAF 节流滚动事件，避免每像素触发 setState
 * - ResizeObserver 监听容器高度变化，支持条件挂载延迟重试
 */
interface VirtualScrollOptions {
  itemCount: number;
  rowHeight: number;
  overscan?: number;
}

export function useVirtualScroll(opts: VirtualScrollOptions) {
  const { itemCount, rowHeight, overscan = 5 } = opts;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const rafRef = useRef(0);

  // ResizeObserver with retry for conditionally-attached refs
  useEffect(() => {
    let ro: ResizeObserver | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function setup(el: HTMLDivElement) {
      setViewportHeight(el.clientHeight);
      ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          setViewportHeight(entry.contentRect.height);
        }
      });
      ro.observe(el);
    }

    const el = scrollRef.current;
    if (el) {
      setup(el);
    } else {
      // Ref not attached yet — retry after a micro-delay
      retryTimer = setTimeout(() => {
        const el2 = scrollRef.current;
        if (el2) setup(el2);
      }, 50);
    }

    return () => {
      if (ro) ro.disconnect();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  // rAF-throttled scroll handler
  const onScroll = useCallback(() => {
    if (rafRef.current) return; // already scheduled
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
    });
  }, []);

  // Clean up pending rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const totalHeight = itemCount * rowHeight;
  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIdx = Math.min(itemCount, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);

  return { scrollRef, startIdx, endIdx, totalHeight, onScroll };
}
