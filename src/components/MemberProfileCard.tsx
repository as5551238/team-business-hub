import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { BarChart3, TrendingUp, AlertTriangle, Zap, Target, Brain, User } from 'lucide-react';

interface ProfileData {
  efficiency: number;
  collaboration: number;
  proactivity: number;
  stability: number;
  goalAlignment: number;
  aiAdoption: number;
  tags: string[];
  stats: { totalTasks: number; completedTasks: number; onTimeTasks: number; comments: number; selfCreated: number; activeDays: number };
}

const DIMENSIONS = [
  { key: 'efficiency', label: '效率', icon: Zap, color: '#3B82F6' },
  { key: 'collaboration', label: '协作', icon: BarChart3, color: '#10B981' },
  { key: 'proactivity', label: '主动性', icon: TrendingUp, color: '#F59E0B' },
  { key: 'stability', label: '稳定性', icon: User, color: '#8B5CF6' },
  { key: 'goalAlignment', label: '目标聚焦', icon: Target, color: '#EC4899' },
  { key: 'aiAdoption', label: 'AI采纳', icon: Brain, color: '#06B6D4' },
] as const;

// 简易雷达图（纯SVG，无依赖）
function RadarChart({ scores }: { scores: Record<string, number> }) {
  const cx = 60, cy = 60, r = 48, n = 6;
  const levels = [0.25, 0.5, 0.75, 1];
  const points = DIMENSIONS.map((d, i) => {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const val = Math.min(1, Math.max(0, (scores[d.key] || 0) / 100));
    return { x: cx + r * val * Math.cos(angle), y: cy + r * val * Math.sin(angle) };
  });

  return (
    <svg width="120" height="120" viewBox="0 0 120 120" className="flex-shrink-0">
      {levels.map((lv, li) => {
        const pts = DIMENSIONS.map((_, i) => {
          const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
          return `${cx + r * lv * Math.cos(angle)},${cy + r * lv * Math.sin(angle)}`;
        }).join(' ');
        return <polygon key={li} points={pts} fill="none" stroke="#e2e8f0" strokeWidth="0.5" />;
      })}
      {DIMENSIONS.map((d, i) => {
        const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
        return <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)} stroke="#e2e8f0" strokeWidth="0.5" />;
      })}
      {points.length > 2 && (
        <polygon
          points={points.map(p => `${p.x},${p.y}`).join(' ')}
          fill="rgba(59,130,246,0.15)"
          stroke="#3B82F6"
          strokeWidth="1.5"
        />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={DIMENSIONS[i].color} />
      ))}
    </svg>
  );
}

// 维度进度条
function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-muted-foreground flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <span className="w-6 text-right font-medium" style={{ color }}>{score}</span>
    </div>
  );
}

export default function MemberProfileCard({ memberId }: { memberId: string }) {
  const { state } = useStore();
  const member = state.members.find(m => m.id === memberId);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    const sb = (await import('@/supabase/client')).getSupabaseClient();
    if (!sb) return;
    setLoading(true);
    try {
      const { data, error } = await sb.rpc('compute_behavior_profile', {
        p_user_id: memberId,
        p_days: 30,
      });
      if (!error && data) {
        setProfile(data as ProfileData);
      }
    } catch {}
    setLoading(false);
  }, [memberId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const scores = useMemo(() => ({
    efficiency: profile?.efficiency || 0,
    collaboration: profile?.collaboration || 0,
    proactivity: profile?.proactivity || 0,
    stability: profile?.stability || 0,
    goalAlignment: profile?.goalAlignment || 0,
    aiAdoption: profile?.aiAdoption || 0,
  }), [profile]);

  if (!member) return null;

  const avgScore = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / 6);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-primary/10 text-primary">
            {member.avatar}
          </div>
          <div>
            <div className="text-sm font-medium">{member.name}</div>
            <div className="text-xs text-muted-foreground">{member.department || member.role}</div>
          </div>
        </div>
        {loading ? (
          <span className="text-xs text-muted-foreground">计算中...</span>
        ) : (
          <span className="text-xs font-semibold" style={{ color: avgScore >= 60 ? '#10B981' : avgScore >= 40 ? '#F59E0B' : '#EF4444' }}>
            综合 {avgScore}
          </span>
        )}
      </div>

      <div className="flex gap-4">
        <RadarChart scores={scores} />
        <div className="flex-1 space-y-1.5">
          {DIMENSIONS.map(d => (
            <ScoreBar key={d.key} label={d.label} score={scores[d.key]} color={d.color} />
          ))}
        </div>
      </div>

      {profile && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex flex-wrap gap-1.5">
            {profile.tags.map((tag: string) => (
              <span key={tag} className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary font-medium">
                {tag}
              </span>
            ))}
            {profile.tags.length === 0 && <span className="text-xs text-muted-foreground">数据积累中...</span>}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span>任务 {profile.stats.completedTasks}/{profile.stats.totalTasks}</span>
            <span>按时 {profile.stats.onTimeTasks}</span>
            <span>评论 {profile.stats.comments}</span>
            <span>活跃 {profile.stats.activeDays}天</span>
          </div>
        </div>
      )}
    </div>
  );
}
