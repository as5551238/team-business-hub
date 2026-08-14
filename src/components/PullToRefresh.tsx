/**
 * PullToRefresh — 轻量下拉刷新组件
 * 支持 iOS Safari / 安卓 Chrome / 鸿蒙浏览器
 * 使用 touch 事件实现，零依赖
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  threshold?: number; // pull distance to trigger refresh (default: 60px)
}

export function PullToRefresh({ onRefresh, children, threshold = 60 }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Only trigger if scrolled to top
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    touchStartRef.current = e.touches[0].clientY;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartRef.current === null || refreshing) return;
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) { touchStartRef.current = null; return; }

    const dy = e.touches[0].clientY - touchStartRef.current;
    if (dy > 0) {
      // Prevent default scroll during pull
      const distance = Math.min(dy * 0.5, threshold * 2);
      setPullDistance(distance);
      setPulling(distance >= threshold);
    }
  }, [refreshing, threshold]);

  const onTouchEnd = useCallback(async () => {
    if (pulling && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } catch {}
      setRefreshing(false);
    }
    setPullDistance(0);
    setPulling(false);
    touchStartRef.current = null;
  }, [pulling, refreshing, onRefresh]);

  const indicatorHeight = Math.min(pullDistance, 50);

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull indicator */}
      {pullDistance > 0 && (
        <div
          className="flex items-center justify-center text-muted-foreground transition-opacity"
          style={{ height: indicatorHeight, opacity: pullDistance > 10 ? 1 : 0 }}
        >
          {refreshing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : pulling ? (
            <span className="text-xs">释放刷新</span>
          ) : (
            <span className="text-xs">下拉刷新</span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
