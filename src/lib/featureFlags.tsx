/**
 * Feature Flag 系统 — 基于 Supabase feature_flags 表 + React Context
 * 按组织/团队灰度控制功能开关，无需发版
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getSupabaseClient } from '@/supabase/client';

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  teamIds?: string[]; // 空=全局开启, 非空=仅指定团队
  description?: string;
}

interface FeatureFlagContextType {
  flags: Record<string, FeatureFlag>;
  isEnabled: (key: string) => boolean;
  loading: boolean;
}

const FeatureFlagContext = createContext<FeatureFlagContextType>({
  flags: {},
  isEnabled: () => false,
  loading: true,
});

// Default flags — fallback when Supabase is unavailable
const DEFAULT_FLAGS: Record<string, FeatureFlag> = {
  'pwa_install_prompt': { key: 'pwa_install_prompt', enabled: true, description: 'PWA安装提示' },
  'ai_push_events': { key: 'ai_push_events', enabled: false, description: 'AI主动推送事件' },
  'github_integration': { key: 'github_integration', enabled: false, description: 'GitHub集成' },
  'okr_approval_flow': { key: 'okr_approval_flow', enabled: true, description: 'OKR审批流' },
  'comment_to_task': { key: 'comment_to_task', enabled: true, description: '评论转任务' },
  'retro_tracking': { key: 'retro_tracking', enabled: true, description: '复盘跟踪' },
  'goal_change_cascade': { key: 'goal_change_cascade', enabled: true, description: '目标变更联动' },
  'my_today_view': { key: 'my_today_view', enabled: true, description: '我的今日视图' },
  'sentry_error_tracking': { key: 'sentry_error_tracking', enabled: false, description: 'Sentry错误追踪' },
};

export function FeatureFlagProvider({ children, teamId }: { children: ReactNode; teamId?: string | null }) {
  const [flags, setFlags] = useState<Record<string, FeatureFlag>>(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) { setLoading(false); return; }

    // P3#25 fix: add AbortController for stale fetch protection
    let cancelled = false;
    sb.from('feature_flags').select('*')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && Array.isArray(data)) {
          const dbFlags: Record<string, FeatureFlag> = {};
          for (const row of data) {
            dbFlags[row.key] = {
              key: row.key,
              enabled: row.enabled,
              teamIds: row.team_ids || [],
              description: row.description || '',
            };
          }
          setFlags(prev => ({ ...prev, ...dbFlags }));
        }
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teamId]);

  const isEnabled = useCallback((key: string): boolean => {
    const flag = flags[key];
    if (!flag) return false;
    if (!flag.enabled) return false;
    // If teamIds is empty, flag is globally enabled
    if (!flag.teamIds || flag.teamIds.length === 0) return true;
    // Otherwise, only enabled for specified teams
    return !!teamId && flag.teamIds.includes(teamId);
  }, [flags, teamId]);

  return (
    <FeatureFlagContext.Provider value={{ flags, isEnabled, loading }}>
      {children}
    </FeatureFlagContext.Provider>
  );
}
