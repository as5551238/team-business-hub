// E1: 行为分析仪表盘 — DAU/MAU/留存/事件分布
// 数据源: behavior_events 表 (Supabase)

import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { getSupabaseClient } from '@/supabase/client';
import { Users, TrendingUp, Activity, Eye, Calendar, BarChart3, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface DailyCount { date: string; count: number }
interface RetentionPoint { day: number; rate: number }

interface AnalyticsData {
  dau: number;
  mau: number;
  dauTrend: 'up' | 'down' | 'flat';
  mauTrend: 'up' | 'down' | 'flat';
  dauChange: number;
  mauChange: number;
  dailyActive: DailyCount[];
  retention: RetentionPoint[];
  eventDistribution: { eventType: string; count: number }[];
  topUsers: { userId: string; name: string; eventCount: number }[];
  totalEvents: number;
  avgEventsPerUser: number;
}

const EMPTY_DATA: AnalyticsData = {
  dau: 0, mau: 0, dauTrend: 'flat', mauTrend: 'flat', dauChange: 0, mauChange: 0,
  dailyActive: [], retention: [], eventDistribution: [], topUsers: [],
  totalEvents: 0, avgEventsPerUser: 0,
};

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <ArrowUpRight size={14} className="text-green-500" />;
  if (trend === 'down') return <ArrowDownRight size={14} className="text-red-500" />;
  return <Minus size={14} className="text-gray-400" />;
}

function StatCard({ label, value, trend, change, icon: Icon, color }: {
  label: string; value: string | number; trend: 'up' | 'down' | 'flat'; change: number;
  icon: typeof Users; color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Icon size={14} style={{ color }} />
        <span>{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold">{value}</span>
        <div className="flex items-center gap-0.5 text-xs mb-1">
          <TrendIcon trend={trend} />
          <span className={trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-400'}>
            {Math.abs(change).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function MiniBarChart({ data, maxHeight = 60 }: { data: DailyCount[]; maxHeight?: number }) {
  if (data.length === 0) return <div className="text-xs text-muted-foreground py-4 text-center">暂无数据</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-0.5 overflow-x-auto" style={{ height: maxHeight + 20 }}>
      {data.map(d => {
        const h = Math.max(2, (d.count / max) * maxHeight);
        return (
          <div key={d.date} className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 8 }}>
            <div className="bg-primary/60 rounded-t-sm hover:bg-primary transition-colors cursor-default"
              style={{ height: h, width: 6 }} title={`${d.date}: ${d.count}`} />
            {data.length <= 14 && <span className="text-[8px] text-muted-foreground mt-0.5">{d.date.slice(8)}</span>}
          </div>
        );
      })}
    </div>
  );
}

function RetentionChart({ data }: { data: RetentionPoint[] }) {
  if (data.length === 0) return <div className="text-xs text-muted-foreground py-4 text-center">暂无留存数据</div>;
  return (
    <div className="flex items-end gap-2">
      {data.map(r => {
        const h = Math.max(2, r.rate * 60);
        const color = r.rate > 0.5 ? '#22c55e' : r.rate > 0.3 ? '#eab308' : '#ef4444';
        return (
          <div key={r.day} className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-medium" style={{ color }}>{(r.rate * 100).toFixed(0)}%</span>
            <div className="rounded-t-sm" style={{ height: h, width: 28, backgroundColor: color, opacity: 0.7 }} />
            <span className="text-[10px] text-muted-foreground">D{r.day}</span>
          </div>
        );
      })}
    </div>
  );
}

export function AnalyticsTab() {
  const { state } = useStore();
  const [data, setData] = useState<AnalyticsData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<7 | 14 | 30>(14);

  useEffect(() => {
    loadAnalytics();
  }, [period]);

  async function loadAnalytics() {
    setLoading(true);
    const sb = getSupabaseClient();
    if (!sb) { setLoading(false); return; }

    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0];
      const periodStart = new Date(now.getTime() - period * 86400000).toISOString().split('T')[0];
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const prevMonthEnd = monthStart;

      // DAU: distinct users today
      const { data: todayUsers } = await sb
        .from('behavior_events')
        .select('user_id', { count: 'exact', head: false })
        .gte('created_at', today);

      const { data: yesterdayUsers } = await sb
        .from('behavior_events')
        .select('user_id', { count: 'exact', head: false })
        .gte('created_at', yesterday)
        .lt('created_at', today);

      const dauSet = new Set((todayUsers || []).map(u => u.user_id).filter(Boolean));
      const yesterdaySet = new Set((yesterdayUsers || []).map(u => u.user_id).filter(Boolean));
      const dau = dauSet.size;
      const prevDau = yesterdaySet.size;
      const dauChange = prevDau > 0 ? ((dau - prevDau) / prevDau) * 100 : 0;

      // MAU: distinct users this month
      const { data: monthUsers } = await sb
        .from('behavior_events')
        .select('user_id')
        .gte('created_at', monthStart);

      const { data: prevMonthUsers } = await sb
        .from('behavior_events')
        .select('user_id')
        .gte('created_at', prevMonthStart)
        .lt('created_at', prevMonthEnd);

      const mauSet = new Set((monthUsers || []).map(u => u.user_id).filter(Boolean));
      const prevMauSet = new Set((prevMonthUsers || []).map(u => u.user_id).filter(Boolean));
      const mau = mauSet.size;
      const prevMau = prevMauSet.size;
      const mauChange = prevMau > 0 ? ((mau - prevMau) / prevMau) * 100 : 0;

      // Daily active users over period
      const { data: dailyData } = await sb
        .from('behavior_events')
        .select('created_at, user_id')
        .gte('created_at', periodStart);

      const dailyMap = new Map<string, Set<string>>();
      (dailyData || []).forEach(e => {
        const date = (e.created_at as string).split('T')[0];
        if (!dailyMap.has(date)) dailyMap.set(date, new Set());
        if (e.user_id) dailyMap.get(date)!.add(e.user_id);
      });
      const dailyActive: DailyCount[] = Array.from(dailyMap.entries())
        .map(([date, users]) => ({ date, count: users.size }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Retention: D1/D3/D7/D14/D30
      const { data: cohortData } = await sb
        .from('behavior_events')
        .select('user_id, created_at')
        .gte('created_at', new Date(now.getTime() - 31 * 86400000).toISOString().split('T')[0]);
      
      const retention: RetentionPoint[] = [];
      const firstSeen = new Map<string, string>();
      (cohortData || []).forEach(e => {
        if (!e.user_id) return;
        const date = (e.created_at as string).split('T')[0];
        if (!firstSeen.has(e.user_id)) firstSeen.set(e.user_id, date);
        else {
          const existing = firstSeen.get(e.user_id)!;
          if (date < existing) firstSeen.set(e.user_id, date);
        }
      });

      for (const day of [1, 3, 7, 14, 30]) {
        const cohortDate = new Date(now.getTime() - day * 86400000).toISOString().split('T')[0];
        const cohortUsers = Array.from(firstSeen.entries()).filter(([, d]) => d === cohortDate);
        if (cohortUsers.length === 0) { retention.push({ day, rate: 0 }); continue; }
        const returned = cohortUsers.filter(([uid]) => {
          return (cohortData || []).some(e => e.user_id === uid && (e.created_at as string).split('T')[0] > cohortDate);
        }).length;
        retention.push({ day, rate: returned / cohortUsers.length });
      }

      // Event distribution
      const { count: totalEvents } = await sb
        .from('behavior_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', monthStart);

      const { data: eventDistData } = await sb
        .from('behavior_events')
        .select('event_type')
        .gte('created_at', monthStart);

      const eventMap = new Map<string, number>();
      (eventDistData || []).forEach(e => {
        eventMap.set(e.event_type, (eventMap.get(e.event_type) || 0) + 1);
      });
      const eventDistribution = Array.from(eventMap.entries())
        .map(([eventType, count]) => ({ eventType, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Top users
      const { data: topUserData } = await sb
        .from('behavior_events')
        .select('user_id')
        .gte('created_at', monthStart);

      const userCountMap = new Map<string, number>();
      (topUserData || []).forEach(e => {
        if (e.user_id) userCountMap.set(e.user_id, (userCountMap.get(e.user_id) || 0) + 1);
      });
      const topUsers = Array.from(userCountMap.entries())
        .map(([userId, eventCount]) => {
          const member = state.members.find(m => m.id === userId);
          return { userId, name: member?.name || member?.nickname || userId.slice(0, 8), eventCount };
        })
        .sort((a, b) => b.eventCount - a.eventCount)
        .slice(0, 10);

      setData({
        dau, mau,
        dauTrend: dauChange > 5 ? 'up' : dauChange < -5 ? 'down' : 'flat',
        mauTrend: mauChange > 5 ? 'up' : mauChange < -5 ? 'down' : 'flat',
        dauChange, mauChange,
        dailyActive, retention, eventDistribution, topUsers,
        totalEvents: totalEvents || 0,
        avgEventsPerUser: mauSet.size > 0 ? Math.round((totalEvents || 0) / mauSet.size) : 0,
      });
    } catch (e) {
      console.error('[Analytics] Load failed:', e);
    } finally {
      setLoading(false);
    }
  }

  const eventTypeLabels = useMemo(() => ({
    'task.created': '创建任务', 'task.completed': '完成任务', 'task.overdue': '任务逾期',
    'task.reassigned': '任务转交', 'task.deleted': '删除任务',
    'goal.created': '创建目标', 'goal.completed': '完成目标', 'goal.progress_updated': '目标进度更新',
    'kr.score_updated': 'KR更新', 'comment.created': '发表评论', 'subtask.toggled': '子任务切换',
    'notification.read': '通知已读', 'member.joined': '成员加入',
    'ai.suggestion.accepted': 'AI建议采纳', 'ai.suggestion.rejected': 'AI建议忽略',
    'industry.selected': '行业选择', 'prediction.viewed': '查看预测',
  }), []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity size={16} className="animate-pulse" />
          <span>加载分析数据...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        <Calendar size={14} className="text-muted-foreground" />
        {[7, 14, 30].map(p => (
          <button key={p} onClick={() => setPeriod(p as 7 | 14 | 30)}
            className={`px-3 py-1 text-xs rounded-lg transition-colors ${period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
            {p}天
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="今日活跃(DAU)" value={data.dau} trend={data.dauTrend} change={data.dauChange} icon={Users} color="#3b82f6" />
        <StatCard label="月活跃(MAU)" value={data.mau} trend={data.mauTrend} change={data.mauChange} icon={TrendingUp} color="#22c55e" />
        <StatCard label="本月总事件" value={data.totalEvents} trend="flat" change={0} icon={Activity} color="#f59e0b" />
        <StatCard label="人均事件数" value={data.avgEventsPerUser} trend="flat" change={0} icon={Eye} color="#8b5cf6" />
      </div>

      {/* Daily active chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <BarChart3 size={14} className="text-primary" />
          每日活跃用户
        </h3>
        <MiniBarChart data={data.dailyActive} />
      </div>

      {/* Retention + Event distribution side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Retention */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">留存率</h3>
          <RetentionChart data={data.retention} />
        </div>

        {/* Event distribution */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">事件分布(Top 10)</h3>
          {data.eventDistribution.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">暂无事件数据</div>
          ) : (
            <div className="space-y-1.5">
              {data.eventDistribution.map(e => {
                const pct = data.totalEvents > 0 ? (e.count / data.totalEvents * 100) : 0;
                const label = (eventTypeLabels as Record<string, string>)[e.eventType] || e.eventType;
                return (
                  <div key={e.eventType} className="flex items-center gap-2">
                    <span className="text-xs w-20 truncate" title={e.eventType}>{label}</span>
                    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                      <div className="bg-primary/60 h-full rounded-full" style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-12 text-right">{e.count}次</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top users */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Users size={14} className="text-primary" />
          活跃用户排行
        </h3>
        {data.topUsers.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">暂无用户数据</div>
        ) : (
          <div className="space-y-1">
            {data.topUsers.map((u, i) => (
              <div key={u.userId} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'}`}>
                  {i + 1}
                </span>
                <span className="text-sm flex-1">{u.name}</span>
                <span className="text-xs text-muted-foreground">{u.eventCount}次事件</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
