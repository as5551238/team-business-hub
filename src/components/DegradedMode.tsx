/**
 * SLA 降级组件 — Supabase不可达时显示只读模式提示
 * R8升级：品牌视觉统一 + 离线页面美化 + 自动重连倒计时
 */
import { useState, useEffect, useCallback } from 'react';
import { CloudOff, RefreshCw, Wifi, Zap } from 'lucide-react';
import { getSupabaseClient } from '@/supabase/client';
import { handleError } from '@/lib/errorHandler';

export function DegradedBanner() {
  const [degraded, setDegraded] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const handleOffline = () => setDegraded(true);
    const handleOnline = () => setDegraded(false);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    if (!navigator.onLine) setDegraded(true);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const handleRetry = async () => {
    setChecking(true);
    try {
      const sb = getSupabaseClient();
      if (sb) {
        const { error } = await sb.from('goals').select('id').limit(1);
        if (!error) {
          setDegraded(false);
          window.location.reload();
        }
      }
    } catch (e) { handleError(e, { module: 'DegradedMode', operation: 'RETRY_BANNER', severity: 'warn' }); }
    setChecking(false);
  };

  if (!degraded) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[90] bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2.5 flex items-center justify-center gap-3 text-sm shadow-md">
      <CloudOff size={16} className="shrink-0" />
      <span>网络不可达，已切换至离线模式 — 数据为缓存快照</span>
      <button
        onClick={handleRetry}
        disabled={checking}
        className="flex items-center gap-1 px-3 py-1 bg-white/20 rounded-lg hover:bg-white/30 transition-colors text-xs font-medium"
      >
        <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
        重试
      </button>
    </div>
  );
}

/** Supabase完全不可用时的全屏降级页面 */
export function DegradedPage() {
  const [retrying, setRetrying] = useState(false);
  const [countdown, setCountdown] = useState(30);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      const sb = getSupabaseClient();
      if (sb) {
        const { error } = await sb.from('goals').select('id').limit(1);
        if (!error) {
          window.location.reload();
          return;
        }
      }
    } catch (e) { handleError(e, { module: 'DegradedMode', operation: 'RETRY_PAGE', severity: 'warn' }); }
    setRetrying(false);
  }, []);

  // Auto-retry countdown
  useEffect(() => {
    if (countdown <= 0) {
      handleRetry();
      setCountdown(30);
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, handleRetry]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Brand icon */}
        <div className="relative mx-auto mb-8">
          <div className="w-24 h-24 bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <Wifi size={40} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
            <CloudOff size={12} className="text-white" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-3">服务暂不可用</h1>
        <p className="text-muted-foreground mb-6 leading-relaxed">
          数据服务暂时无法连接，系统已切换至离线模式。<br />
          您可以查看本地缓存的数据，但无法进行修改操作。
        </p>

        <button
          onClick={handleRetry}
          disabled={retrying}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary to-blue-600 text-white rounded-xl hover:opacity-90 transition-opacity shadow-lg font-medium"
        >
          <RefreshCw size={16} className={retrying ? 'animate-spin' : ''} />
          重新连接
        </button>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Zap size={12} />
          <span>自动重试倒计时: {countdown}s</span>
        </div>

        <p className="text-xs text-muted-foreground/60 mt-6">
          如持续无法连接，请联系管理员 as5551238@126.com
        </p>
      </div>
    </div>
  );
}
