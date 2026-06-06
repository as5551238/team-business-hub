/**
 * 全局加载状态组件 — R8 App Store Readiness
 * 统一的加载、骨架屏、Spinner 组件，品牌视觉一致
 */
import { cn } from '@/lib/utils';

/** 品牌 Spinner — 用于按钮内或小型加载态 */
export function Spinner({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = { sm: 'h-3.5 w-3.5', md: 'h-5 w-5', lg: 'h-8 w-8' };
  return (
    <svg className={cn('animate-spin text-primary', sizeMap[size], className)} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

/** 全页加载 — 品牌 Logo + Spinner */
export function PageLoader({ message }: { message?: string }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-primary to-blue-600 flex items-center justify-center shadow-lg">
          <span className="text-white text-2xl font-bold">T</span>
        </div>
        <div className="absolute -bottom-1 -right-1">
          <Spinner size="sm" className="text-primary" />
        </div>
      </div>
      {message && <p className="text-sm text-muted-foreground animate-pulse">{message}</p>}
    </div>
  );
}

/** 内联加载 — 用于卡片/面板内部 */
export function InlineLoader({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
            <div className="h-2 bg-muted rounded animate-pulse w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 骨架卡片 — 用于列表加载 */
export function SkeletonCard() {
  return (
    <div className="border rounded-xl p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded bg-muted" />
        <div className="h-4 bg-muted rounded w-2/3" />
      </div>
      <div className="space-y-2">
        <div className="h-2 bg-muted rounded w-full" />
        <div className="h-2 bg-muted rounded w-4/5" />
      </div>
      <div className="flex gap-2">
        <div className="h-6 w-16 rounded-full bg-muted" />
        <div className="h-6 w-16 rounded-full bg-muted" />
      </div>
    </div>
  );
}
