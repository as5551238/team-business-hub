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
