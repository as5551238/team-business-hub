/**
 * SLA 降级组件 — Supabase不可达时显示只读模式提示
 */
import { useState, useEffect } from 'react';
import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { getSupabaseClient } from '@/supabase/client';

export function DegradedBanner() {
  const [degraded, setDegraded] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Listen for offline events
    const handleOffline = () => setDegraded(true);
    const handleOnline = () => setDegraded(false);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Check if already offline
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
    } catch {}
    setChecking(false);
  };

  if (!degraded) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[90] bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-3 text-sm">
      <CloudOff size={16} />
      <span>网络不可达，已切换至只读模式 — 数据为上次同步的缓存</span>
      <button
        onClick={handleRetry}
        disabled={checking}
        className="flex items-center gap-1 px-3 py-1 bg-white/20 rounded hover:bg-white/30 transition-colors"
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

  const handleRetry = async () => {
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
    } catch {}
    setRetrying(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Wifi size={36} className="text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">服务暂不可用</h1>
        <p className="text-gray-500 mb-6">
          数据服务暂时无法连接，系统已切换至离线模式。<br />
          您可以查看本地缓存的数据，但无法进行修改操作。
        </p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <RefreshCw size={16} className={retrying ? 'animate-spin' : ''} />
          重新连接
        </button>
        <p className="text-xs text-gray-400 mt-4">
          如持续无法连接，请联系管理员 as5551238@126.com
        </p>
      </div>
    </div>
  );
}
