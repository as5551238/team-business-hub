/**
 * 团队资源负载面板 — 可视化团队成员工作量
 *
 * Round 8 — 交互效率 + 1
 * - 接入 resourceBottleneck 负载计算
 * - 可视化负载柱状图
 * - 建议任务重新分配
 */
import { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { calcMemberLoads, type MemberLoad } from '@/lib/resourceBottleneck';
import { Users, AlertTriangle, CheckCircle2, ArrowRight, TrendingUp } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  balanced: { label: '工作饱和', color: 'text-green-700', bgColor: 'bg-green-100' },
  loaded: { label: '接近满载', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  overloaded: { label: '已超载', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  critical: { label: '严重超载', color: 'text-red-700', bgColor: 'bg-red-100' },
  idle: { label: '空闲', color: 'text-gray-500', bgColor: 'bg-gray-100' },
};

export function TeamLoadTab() {
  const { state } = useStore();
  const activeMembers = state.members.filter(m => m.status !== 'inactive');

  const loads = useMemo(() => {
    return calcMemberLoads(state.tasks, activeMembers);
  }, [state.tasks, activeMembers]);

  const maxLoad = Math.max(...loads.map((l: MemberLoad) => l.loadIndex), 1);

  const overloadedMembers = loads.filter((l: MemberLoad) => l.status === 'overloaded' || l.status === 'critical');
  const idleMembers = loads.filter((l: MemberLoad) => l.status === 'idle');
  const balancedMembers = loads.filter((l: MemberLoad) => l.status === 'balanced');

  return (
    <div className="space-y-5">
      {/* 概览 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-3 border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><AlertTriangle size={12} className="text-red-500" />超载</div>
          <div className="text-xl font-bold text-red-600">{overloadedMembers.length}</div>
        </div>
        <div className="bg-white rounded-xl p-3 border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><CheckCircle2 size={12} className="text-green-500" />饱和</div>
          <div className="text-xl font-bold text-green-600">{balancedMembers.length}</div>
        </div>
        <div className="bg-white rounded-xl p-3 border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Users size={12} className="text-gray-400" />空闲</div>
          <div className="text-xl font-bold">{idleMembers.length}</div>
        </div>
      </div>

      {/* 负载柱状图 */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2"><Users size={14} />成员负载分布</h3>
        <div className="space-y-2">
          {loads.sort((a: MemberLoad, b: MemberLoad) => b.loadIndex - a.loadIndex).map((l: MemberLoad) => {
            const cfg = STATUS_CONFIG[l.status] || STATUS_CONFIG.idle;
            const barWidth = maxLoad > 0 ? Math.min(100, (l.loadIndex / maxLoad) * 100) : 0;
            const barColor = l.status === 'critical' ? 'bg-red-500' : l.status === 'overloaded' ? 'bg-orange-500' : l.status === 'balanced' ? 'bg-green-500' : l.status === 'loaded' ? 'bg-yellow-500' : 'bg-gray-300';
            return (
              <div key={l.memberId} className="flex items-center gap-2">
                <div className="w-20 text-xs font-medium truncate">{l.memberName}</div>
                <div className="flex-1 h-5 bg-gray-50 rounded-full overflow-hidden relative">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barWidth}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">{l.activeTasks}项 · {l.loadIndex}</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${cfg.bgColor} ${cfg.color}`}>{cfg.label}</span>
              </div>
            );
          })}
          {loads.length === 0 && <div className="text-center text-sm text-muted-foreground py-4">暂无成员数据</div>}
        </div>
      </div>

      {/* 重新分配建议 */}
      {overloadedMembers.length > 0 && idleMembers.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
            <TrendingUp size={14} />
            建议重新分配
          </div>
          {overloadedMembers.slice(0, 3).map((ol: MemberLoad) => {
            const target = idleMembers[0];
            if (!target) return null;
            const overflowTasks = ol.activeTasks - Math.ceil(ol.activeTasks * 0.7);
            return (
              <div key={ol.memberId} className="flex items-center gap-2 text-xs text-amber-700">
                <span className="font-medium">{ol.memberName}</span>
                <ArrowRight size={12} />
                <span className="font-medium">{target.memberName}</span>
                <span className="text-amber-600">({overflowTasks > 0 ? `可转移${overflowTasks}项` : '建议调整'})</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-[11px] text-blue-700"><strong>负载计算说明</strong>：基于成员当前活跃任务数和优先级权重计算负载指数。负载指数 = 加权任务数 / 标准容量(5)。建议超载成员将低优先级任务转移给空闲成员。</p>
      </div>
    </div>
  );
}
