/**
 * FloatingAIPanel — 全局浮动AI助手面板
 *
 * 付费级产品体验：
 * - 右下角FAB按钮，一键唤起AI助手
 * - 侧滑面板，不遮挡主内容区
 * - 键盘快捷键 Ctrl+Shift+K
 * - 响应式：桌面侧滑 / 移动端全屏
 * - 平滑动画过渡
 */
import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Sparkles, X, MessageCircle } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const AIChatAgent = lazy(() =>
  import('@/components/AIChatAgent').then(m => ({ default: m.AIChatAgent }))
);

const STORAGE_KEY = 'tbh-ai-panel-open';

export function FloatingAIPanel() {
  const [isOpen, setIsOpen] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });

  const toggle = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    try { localStorage.setItem(STORAGE_KEY, 'false'); } catch { /* ignore */ }
  }, []);

  // Keyboard shortcut: Ctrl+Shift+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  // Custom event: tbh-open-ai-chat
  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('tbh-open-ai-chat', handler);
    return () => window.removeEventListener('tbh-open-ai-chat', handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  return (
    <>
      {/* FAB trigger button */}
      {!isOpen && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggle}
              className="fixed bottom-6 right-6 z-50 md:bottom-8 md:right-8 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center group"
              aria-label="打开AI助手"
            >
              <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-400 border-2 border-background animate-pulse" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">AI 助手 (Ctrl+Shift+K)</TooltipContent>
        </Tooltip>
      )}

      {/* Slide-in panel */}
      {isOpen && (
        <>
          {/* Mobile overlay */}
          <div
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
            onClick={close}
          />
          {/* Panel */}
          <div className="fixed top-0 right-0 z-50 h-full w-full md:w-[420px] md:h-[calc(100vh-3rem)] md:top-6 md:right-6 md:rounded-xl md:shadow-2xl md:border bg-card flex flex-col animate-slide-in-right">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageCircle size={14} className="text-primary" />
                </div>
                <span className="font-semibold text-sm">AI 助手</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">RAG</span>
              </div>
              <button
                onClick={close}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                title="关闭 (Esc)"
                aria-label="关闭AI助手"
              >
                <X size={16} />
              </button>
            </div>
            {/* Chat content */}
            <div className="flex-1 overflow-hidden">
              <Suspense fallback={
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  <Sparkles size={16} className="mr-2 animate-spin" />加载AI助手...
                </div>
              }>
                <AIChatAgent />
              </Suspense>
            </div>
          </div>
        </>
      )}
    </>
  );
}
