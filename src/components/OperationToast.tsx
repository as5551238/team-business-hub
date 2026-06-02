/**
 * 操作反馈 Toast — 轻量级全局事件驱动
 * 发送: window.dispatchEvent(new CustomEvent('tbh-toast', { detail: { message: '操作成功' } }))
 * 接收: OperationToast 组件自动监听并显示
 */
import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

let toastId = 0;

export function OperationToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail?.message) return;
    const id = ++toastId;
    const type = detail.type || 'success';
    setToasts(prev => [...prev.slice(-4), { id, message: detail.message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  useEffect(() => {
    window.addEventListener('tbh-toast', addToast);
    return () => window.removeEventListener('tbh-toast', addToast);
  }, [addToast]);

  if (toasts.length === 0) return null;

  const iconMap = {
    success: <CheckCircle2 size={14} className="text-green-500" />,
    error: <AlertCircle size={14} className="text-red-500" />,
    info: <Info size={14} className="text-blue-500" />,
  };
  const bgMap = {
    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  };

  return (
    <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-lg border shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-200 ${bgMap[t.type]}`}
        >
          {iconMap[t.type]}
          <span className="text-sm font-medium">{t.message}</span>
          <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="text-muted-foreground/50 hover:text-foreground ml-1">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
