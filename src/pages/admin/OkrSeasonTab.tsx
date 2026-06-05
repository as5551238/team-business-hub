import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { usePermissions } from '@/store/hooks';
import type { OKRSeason, SeasonStatus, SeasonType } from '@/types';
import { Plus, Trash2, Edit2, Play, CheckCircle, Clock, Trophy, CalendarDays } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

const STATUS_LABELS: Record<SeasonStatus, string> = {
  draft: '草稿', planning: '规划中', executing: '执行中',
  scoring: '评分中', reviewing: '复盘', closed: '已关闭',
};
const STATUS_COLORS: Record<SeasonStatus, string> = {
  draft: 'bg-gray-100 text-gray-600', planning: 'bg-amber-100 text-amber-700',
  executing: 'bg-blue-100 text-blue-700', scoring: 'bg-purple-100 text-purple-700',
  reviewing: 'bg-orange-100 text-orange-700', closed: 'bg-green-100 text-green-700',
};
const TYPE_LABELS: Record<SeasonType, string> = { quarter: '季度', annual: '年度', custom: '自定义' };

/** Status transition order for the lifecycle flow */
const STATUS_FLOW: SeasonStatus[] = ['draft', 'planning', 'executing', 'scoring', 'reviewing', 'closed'];
const NEXT_STATUS: Partial<Record<SeasonStatus, SeasonStatus>> = {
  draft: 'planning', planning: 'executing', executing: 'scoring',
  scoring: 'reviewing', reviewing: 'closed',
};

export function OkrSeasonTab() {
  const { state, dispatch } = useStore();
  const { can } = usePermissions();
  const canManage = can('settings_manage');
  const seasons = state.seasons || [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'quarter' as SeasonType,
    startDate: '',
    endDate: '',
    status: 'draft' as SeasonStatus,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedSeason = seasons.find(s => s.id === selectedId);

  // Goals linked to the selected season
  const seasonGoals = useMemo(() => {
    if (!selectedId) return [];
    return state.goals.filter(g => g.seasonId === selectedId);
  }, [selectedId, state.goals]);

  // Stats for each season card
  const seasonStatsMap = useMemo(() => {
    const map: Record<string, { total: number; done: number; rate: number }> = {};
    for (const sn of seasons) {
      const goals = state.goals.filter(g => g.seasonId === sn.id);
      const total = goals.length;
      const done = goals.filter(g => g.status === 'done').length;
      map[sn.id] = { total, done, rate: total > 0 ? Math.round(done / total * 100) : 0 };
    }
    return map;
  }, [seasons, state.goals]);

  function handleSave() {
    if (!form.name.trim() || !form.startDate || !form.endDate) return;
    if (editingId) {
      dispatch({ type: 'UPDATE_SEASON', payload: { id: editingId, updates: form } });
    } else {
      dispatch({
        type: 'ADD_SEASON',
        payload: { ...form, teamId: state.currentTeamId || '__default__' },
      });
    }
    setShowForm(false);
    setEditingId(null);
    resetForm();
  }

  function startEdit(sn: OKRSeason) {
    setForm({
      name: sn.name,
      type: sn.type,
      startDate: sn.startDate,
      endDate: sn.endDate,
      status: sn.status,
    });
    setEditingId(sn.id);
    setShowForm(true);
  }

  function advanceStatus(sn: OKRSeason) {
    const next = NEXT_STATUS[sn.status];
    if (next) {
      dispatch({ type: 'UPDATE_SEASON', payload: { id: sn.id, updates: { status: next } } });
    }
  }

  function resetForm() {
    setForm({ name: '', type: 'quarter', startDate: '', endDate: '', status: 'draft' });
  }

  // Quick-create a season for the current quarter
  function quickCreateQuarter() {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3);
    const start = `${now.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01`;
    const endMonth = q * 3 + 3;
    const lastDay = new Date(now.getFullYear(), endMonth, 0).getDate();
    const end = `${now.getFullYear()}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const qLabel = `Q${q + 1} ${now.getFullYear()}`;
    dispatch({
      type: 'ADD_SEASON',
      payload: {
        name: qLabel,
        type: 'quarter',
        startDate: start,
        endDate: end,
        status: 'planning',
        teamId: state.currentTeamId || '__default__',
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">OKR 赛季管理</h3>
        <div className="flex gap-2">
          {canManage && (
            <button
              onClick={quickCreateQuarter}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted transition-colors"
            >
              <CalendarDays size={14} /> 本季度
            </button>
          )}
          {canManage && (
            <button
              onClick={() => { setShowForm(!showForm); setEditingId(null); resetForm(); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus size={14} /> 新建赛季
            </button>
          )}
        </div>
      </div>

      {seasons.length === 0 && (
        <EmptyState title="暂无OKR赛季，创建一个赛季开始管理目标周期" compact />
      )}

      {/* Season lifecycle flow (visual) */}
      {selectedSeason && (
        <div className="border border-border rounded-lg p-3 bg-card">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-muted-foreground">赛季生命周期</h4>
            <span className="text-xs text-muted-foreground">
              {TYPE_LABELS[selectedSeason.type]} · {selectedSeason.startDate} ~ {selectedSeason.endDate}
            </span>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {STATUS_FLOW.map((st, idx) => {
              const isActive = st === selectedSeason.status;
              const isPast = STATUS_FLOW.indexOf(selectedSeason.status) > idx;
              return (
                <div key={st} className="flex items-center gap-1 shrink-0">
                  <div
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : isPast
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {STATUS_LABELS[st]}
                  </div>
                  {idx < STATUS_FLOW.length - 1 && (
                    <div className={`w-4 h-0.5 ${isPast ? 'bg-green-300' : 'bg-gray-200'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Season cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {seasons.map(sn => {
          const stats = seasonStatsMap[sn.id];
          const next = NEXT_STATUS[sn.status];
          return (
            <div
              key={sn.id}
              onClick={() => setSelectedId(sn.id === selectedId ? null : sn.id)}
              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                selectedId === sn.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy size={14} className="text-primary shrink-0" />
                  <span className="text-sm font-medium truncate">{sn.name}</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${STATUS_COLORS[sn.status]}`}>
                  {STATUS_LABELS[sn.status]}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Clock size={11} /> {sn.startDate} ~ {sn.endDate}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {TYPE_LABELS[sn.type]}
                </span>
                <span className="text-[11px] text-muted-foreground">{stats.total}个目标</span>
              </div>
              {stats.total > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-muted-foreground">目标完成</span>
                    <span className="font-medium">{stats.rate}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${stats.rate}%` }} />
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1" />
                {next && canManage && (
                  <button
                    onClick={e => { e.stopPropagation(); advanceStatus(sn); }}
                    className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-0.5"
                    aria-label={`推进到${STATUS_LABELS[next]}`}
                  >
                    <Play size={12} /> {STATUS_LABELS[next]}
                  </button>
                )}
                {sn.status === 'reviewing' && canManage && (
                  <button
                    onClick={e => { e.stopPropagation(); advanceStatus(sn); }}
                    className="text-xs text-green-600 hover:text-green-800 cursor-pointer flex items-center gap-0.5"
                    aria-label="关闭赛季"
                  >
                    <CheckCircle size={12} /> 关闭
                  </button>
                )}
                {canManage && (
                  <button
                    onClick={e => { e.stopPropagation(); startEdit(sn); }}
                    className="text-muted-foreground hover:text-primary cursor-pointer"
                    aria-label="编辑赛季"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
                {canManage && (
                  <button
                    onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_SEASON', payload: sn.id }); if (selectedId === sn.id) setSelectedId(null); }}
                    className="text-muted-foreground hover:text-destructive cursor-pointer"
                    aria-label="删除赛季"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Season detail: linked goals */}
      {selectedSeason && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Trophy size={16} className="text-primary" /> {selectedSeason.name} - 关联目标
            </h4>
            <span className="text-xs text-muted-foreground">{seasonGoals.length} 项</span>
          </div>
          {seasonGoals.length === 0 ? (
            <EmptyState title="该赛季暂无关联目标，请在目标详情中选择赛季" compact />
          ) : (
            <div className="space-y-1 max-h-[280px] overflow-y-auto">
              {seasonGoals.map(g => {
                const levelLabel = g.strategyLevel === 'vision' ? '愿景' : g.strategyLevel === 'annual' ? '年度' : g.strategyLevel === 'quarter' ? '季度' : '';
                return (
                  <div key={g.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 text-xs">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        g.status === 'done' ? 'bg-green-500'
                          : g.status === 'blocked' ? 'bg-red-500'
                            : g.status === 'in_progress' ? 'bg-blue-500'
                              : 'bg-gray-300'
                      }`}
                    />
                    <span className={`truncate flex-1 ${g.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                      {g.title}
                    </span>
                    {levelLabel && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {levelLabel}
                      </span>
                    )}
                    <span className="shrink-0 text-muted-foreground">{g.progress}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit form */}
      {showForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
          <h4 className="text-xs font-semibold">{editingId ? '编辑赛季' : '新建赛季'}</h4>
          <div>
            <label className="text-xs text-muted-foreground">名称</label>
            <input
              className="w-full border border-input rounded px-2 py-1 text-sm mt-1"
              placeholder="如：Q1 2026"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">类型</label>
            <select
              className="w-full border border-input rounded px-2 py-1 text-sm mt-1"
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value as SeasonType })}
            >
              <option value="quarter">季度</option>
              <option value="annual">年度</option>
              <option value="custom">自定义</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">开始日期</label>
              <input
                type="date"
                className="w-full border border-input rounded px-2 py-1 text-sm mt-1"
                value={form.startDate}
                onChange={e => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">结束日期</label>
              <input
                type="date"
                className="w-full border border-input rounded px-2 py-1 text-sm mt-1"
                value={form.endDate}
                onChange={e => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>
          {!editingId && (
            <div>
              <label className="text-xs text-muted-foreground">初始状态</label>
              <select
                className="w-full border border-input rounded px-2 py-1 text-sm mt-1"
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value as SeasonStatus })}
              >
                {STATUS_FLOW.map(st => (
                  <option key={st} value={st}>{STATUS_LABELS[st]}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!form.name.trim() || !form.startDate || !form.endDate || form.endDate <= form.startDate}
              className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {editingId ? '保存' : '创建'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
