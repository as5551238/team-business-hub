import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { StatusFlowRule, StatusFlowAutoAction, MemberRole, ItemType } from '@/types';
import { getDefaultStatusFlowRules } from '@/store/shared';
import { Plus, Trash2, Bell, Edit2, UserPlus, ArrowRight, Download, List, GitBranch, Power, PowerOff } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { SimpleSelect } from '@/components/ui/simple-select';
import { cn } from '@/lib/utils';

const STATUSES = ['todo', 'in_progress', 'done', 'blocked', 'cancelled'];
const STATUS_LABELS: Record<string, string> = { todo: '待办', in_progress: '进行中', done: '已完成', blocked: '阻塞', cancelled: '已取消' };
const STATUS_COLORS: Record<string, string> = { todo: 'bg-gray-200 text-gray-700', in_progress: 'bg-blue-100 text-blue-700', done: 'bg-green-100 text-green-700', blocked: 'bg-amber-100 text-amber-700', cancelled: 'bg-slate-100 text-slate-500' };
const STATUS_NODE_COLORS: Record<string, string> = { todo: '#e5e7eb', in_progress: '#bfdbfe', done: '#bbf7d0', blocked: '#fde68a', cancelled: '#e2e8f0' };
const ROLES = ['admin', 'manager', 'leader', 'member'] as const;
const ROLE_LABELS: Record<string, string> = { admin: '管理员', manager: '负责人', leader: '组长', member: '成员' };
const ITEM_TYPES: ItemType[] = ['task', 'project', 'goal'];
const ITEM_TYPE_LABELS: Record<string, string> = { task: '任务', project: '项目', goal: '目标' };

// 预设流转模板
const FLOW_PRESETS: Record<string, { label: string; desc: string; rules: StatusFlowRule[] }> = {
  standard: {
    label: '标准流', desc: '待办→进行中→完成，含阻塞处理',
    rules: [
      { id: 'std_1', itemType: 'task', fromStatus: 'todo', toStatus: 'in_progress', allowedRoles: ['admin', 'manager', 'leader', 'member'] as MemberRole[], autoActions: [], enabled: true, name: '开始任务' },
      { id: 'std_2', itemType: 'task', fromStatus: 'in_progress', toStatus: 'done', allowedRoles: ['admin', 'manager', 'leader', 'member'] as MemberRole[], autoActions: [], enabled: true, name: '完成任务' },
      { id: 'std_3', itemType: 'task', fromStatus: 'in_progress', toStatus: 'blocked', allowedRoles: ['admin', 'manager', 'leader', 'member'] as MemberRole[], autoActions: [{ type: 'notify' as const, config: { title: '任务被阻塞', message: '任务状态已变更为阻塞' } }], enabled: true, name: '阻塞任务' },
      { id: 'std_4', itemType: 'task', fromStatus: 'blocked', toStatus: 'in_progress', allowedRoles: ['admin', 'manager', 'leader'] as MemberRole[], autoActions: [], enabled: true, name: '解除阻塞' },
      { id: 'std_5', itemType: 'project', fromStatus: 'todo', toStatus: 'in_progress', allowedRoles: ['admin', 'manager', 'leader', 'member'] as MemberRole[], autoActions: [], enabled: true, name: '启动项目' },
      { id: 'std_6', itemType: 'project', fromStatus: 'in_progress', toStatus: 'done', allowedRoles: ['admin', 'manager', 'leader'] as MemberRole[], autoActions: [], enabled: true, name: '完成项目' },
      { id: 'std_7', itemType: 'goal', fromStatus: 'todo', toStatus: 'in_progress', allowedRoles: ['admin', 'manager', 'leader'] as MemberRole[], autoActions: [], enabled: true, name: '启动目标' },
      { id: 'std_8', itemType: 'goal', fromStatus: 'in_progress', toStatus: 'done', allowedRoles: ['admin'] as MemberRole[], autoActions: [{ type: 'notify' as const, config: { title: '目标已完成', message: '恭喜！目标已达成' } }], enabled: true, name: '完成目标' },
    ],
  },
  agile: {
    label: '敏捷流', desc: '含取消/回归，支持敏捷短迭代',
    rules: [
      { id: 'ag_1', itemType: 'task', fromStatus: 'todo', toStatus: 'in_progress', allowedRoles: ['admin', 'manager', 'leader', 'member'] as MemberRole[], autoActions: [], enabled: true, name: '开始' },
      { id: 'ag_2', itemType: 'task', fromStatus: 'in_progress', toStatus: 'done', allowedRoles: ['admin', 'manager', 'leader', 'member'] as MemberRole[], autoActions: [], enabled: true, name: '完成' },
      { id: 'ag_3', itemType: 'task', fromStatus: 'in_progress', toStatus: 'blocked', allowedRoles: ['admin', 'manager', 'leader', 'member'] as MemberRole[], autoActions: [{ type: 'notify' as const, config: { title: '阻塞', message: '任务被阻塞' } }], enabled: true, name: '阻塞' },
      { id: 'ag_4', itemType: 'task', fromStatus: 'blocked', toStatus: 'in_progress', allowedRoles: ['admin', 'manager', 'leader'] as MemberRole[], autoActions: [], enabled: true, name: '解除阻塞' },
      { id: 'ag_5', itemType: 'task', fromStatus: 'in_progress', toStatus: 'todo', allowedRoles: ['admin', 'manager'] as MemberRole[], autoActions: [], enabled: true, name: '回归待办' },
      { id: 'ag_6', itemType: 'task', fromStatus: 'todo', toStatus: 'cancelled', allowedRoles: ['admin', 'manager'] as MemberRole[], autoActions: [], enabled: true, name: '取消' },
      { id: 'ag_7', itemType: 'task', fromStatus: 'done', toStatus: 'in_progress', allowedRoles: ['admin', 'manager'] as MemberRole[], autoActions: [{ type: 'notify' as const, config: { title: '重开', message: '已完成任务被重新打开' } }], enabled: true, name: '重开' },
    ],
  },
  simple: {
    label: '极简流', desc: '仅待办→完成两步，适合轻度管理',
    rules: [
      { id: 'sm_1', itemType: 'task', fromStatus: 'todo', toStatus: 'done', allowedRoles: [] as MemberRole[], autoActions: [], enabled: true, name: '完成' },
      { id: 'sm_2', itemType: 'project', fromStatus: 'todo', toStatus: 'done', allowedRoles: [] as MemberRole[], autoActions: [], enabled: true, name: '完成' },
    ],
  },
};

// --- 可视化流程图组件 ---
function FlowGraph({ rules, itemType }: { rules: StatusFlowRule[]; itemType: ItemType }) {
  const filtered = rules.filter(r => r.itemType === itemType && r.enabled !== false);
  const allStatuses = useMemo(() => {
    const s = new Set<string>();
    filtered.forEach(r => { s.add(r.fromStatus); s.add(r.toStatus); });
    if (s.size === 0) STATUSES.forEach(st => s.add(st));
    return [...s];
  }, [filtered]);

  const W = 520;
  const H = 300;
  const NODE_W = 80;
  const NODE_H = 40;

  // Layout: arrange nodes in a flow — todo → in_progress → done vertically, blocked/cancelled to side
  const positionMap = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    const cx = W / 2;
    const mainRow = ['todo', 'in_progress', 'done'];
    const sideLeft = ['blocked'];
    const sideRight = ['cancelled'];
    const verticalGap = 90;
    const startY = 40;

    mainRow.forEach((s, i) => {
      if (allStatuses.includes(s)) positions[s] = { x: cx - NODE_W / 2, y: startY + i * verticalGap };
    });
    sideLeft.forEach((s, i) => {
      if (allStatuses.includes(s)) positions[s] = { x: cx - 200, y: startY + (verticalGap * 1.5) + i * verticalGap };
    });
    sideRight.forEach((s, i) => {
      if (allStatuses.includes(s)) positions[s] = { x: cx + 120, y: startY + (verticalGap * 1.5) + i * verticalGap };
    });

    // Distribute any remaining
    let extraY = startY + verticalGap * 3;
    allStatuses.forEach(s => {
      if (!positions[s]) { positions[s] = { x: cx + 120, y: extraY }; extraY += verticalGap; }
    });
    return positions;
  }, [allStatuses]);

  function nodeCenter(status: string) {
    const p = positionMap[status];
    return { cx: p.x + NODE_W / 2, cy: p.y + NODE_H / 2 };
  }

  const hasRules = filtered.length > 0;

  return (
    <svg width={W} height={H} className="border border-border rounded-lg bg-card">
      {/* Title */}
      <text x={W / 2} y={20} textAnchor="middle" fontSize={11} fill="#888">{ITEM_TYPE_LABELS[itemType]}状态流转图</text>

      {/* Nodes */}
      {allStatuses.map(status => {
        const p = positionMap[status];
        return (
          <g key={status}>
            <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={8} fill={STATUS_NODE_COLORS[status] || '#f3f4f6'} stroke="#d1d5db" strokeWidth={1.5} />
            <text x={p.x + NODE_W / 2} y={p.y + NODE_H / 2 + 4} textAnchor="middle" fontSize={12} fontWeight="600" fill="#374151">{STATUS_LABELS[status]}</text>
          </g>
        );
      })}

      {/* Edges */}
      {filtered.map((rule, i) => {
        const from = nodeCenter(rule.fromStatus);
        const to = nodeCenter(rule.toStatus);
        const hasAction = (rule.autoActions?.length ?? 0) > 0;
        const dx = to.cx - from.cx;
        const dy = to.cy - from.cy;
        // Bezier curve for smooth arcs
        const cp1x = from.cx + dx * 0.1;
        const cp1y = from.cy + dy * 0.6;
        const cp2x = to.cx - dx * 0.1;
        const cp2y = to.cy - dy * 0.6;
        const pathD = `M${from.cx},${from.cy} C${cp1x},${cp1y} ${cp2x},${cp2y} ${to.cx},${to.cy}`;
        const strokeColor = hasAction ? '#f59e0b' : '#6b7280';
        const labelX = (from.cx + to.cx) / 2 + (dx === 0 ? 12 : 0);
        const labelY = (from.cy + to.cy) / 2;
        const label = rule.name || `${STATUS_LABELS[rule.fromStatus]}→${STATUS_LABELS[rule.toStatus]}`;
        return (
          <g key={rule.id || i}>
            <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={1.5} markerEnd="url(#flowArrow)" />
            <title>{label}{hasAction ? ` (${rule.autoActions!.length}个动作)` : ''} | {rule.allowedRoles.length === 0 ? '全部角色' : rule.allowedRoles.map(r => ROLE_LABELS[r]).join(',')}</title>
            {label && <text x={labelX} y={labelY} textAnchor="middle" fontSize={8} fill={hasAction ? '#d97706' : '#9ca3af'}>{label.length > 8 ? label.substring(0, 8) + '…' : label}</text>}
          </g>
        );
      })}

      {/* Arrow marker */}
      <defs>
        <marker id="flowArrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6 Z" fill="#6b7280" />
        </marker>
      </defs>

      {/* Empty state overlay */}
      {!hasRules && (
        <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fill="#9ca3af">暂无流转规则（默认：任意可转任意状态）</text>
      )}
    </svg>
  );
}

export function FlowConfigTab() {
  const { state, dispatch } = useStore();
  const rules = state.statusFlowRules || [];
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [form, setForm] = useState<StatusFlowRule>({ id: '', itemType: 'task', fromStatus: 'todo', toStatus: 'in_progress', allowedRoles: [], autoActions: [], enabled: true });
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [filterType, setFilterType] = useState<ItemType | 'all'>('all');

  const filteredRules = filterType === 'all' ? rules : rules.filter(r => r.itemType === filterType);

  function handleAdd() {
    dispatch({ type: 'ADD_STATUS_FLOW_RULE', payload: { ...form } });
    setForm({ id: '', itemType: 'task', fromStatus: 'todo', toStatus: 'in_progress', allowedRoles: [], autoActions: [], enabled: true });
    setEditingIdx(null);
  }

  function handleUpdate() {
    if (editingIdx !== null) {
      dispatch({ type: 'UPDATE_STATUS_FLOW_RULE', payload: { index: editingIdx, rule: { ...form, id: form.id || rules[editingIdx]?.id || '' } } });
      setEditingIdx(null);
      setForm({ id: '', itemType: 'task', fromStatus: 'todo', toStatus: 'in_progress', allowedRoles: [], autoActions: [], enabled: true });
    }
  }

  function handleDelete(idx: number) {
    dispatch({ type: 'DELETE_STATUS_FLOW_RULE', payload: idx });
  }

  function toggleEnabled(idx: number) {
    const rule = rules[idx];
    dispatch({ type: 'UPDATE_STATUS_FLOW_RULE', payload: { index: idx, rule: { ...rule, enabled: !rule.enabled } } });
  }

  function toggleRole(role: string) {
    const next = form.allowedRoles.includes(role as MemberRole) ? form.allowedRoles.filter(r => r !== role) : [...form.allowedRoles, role as MemberRole];
    setForm({ ...form, allowedRoles: next });
  }

  function addAction(type: StatusFlowAutoAction['type']) {
    const actions = [...(form.autoActions || [])];
    if (type === 'notify') actions.push({ type, config: { title: '状态变更通知', message: '', memberId: '' } });
    else if (type === 'set_field') actions.push({ type, config: { field: 'priority', value: 'high' } });
    else if (type === 'assign') actions.push({ type, config: { memberId: '' } });
    else if (type === 'create_subtask') actions.push({ type, config: { title: '', priority: 'medium' } });
    setForm({ ...form, autoActions: actions });
  }

  function removeAction(idx: number) {
    const actions = (form.autoActions || []).filter((_, i) => i !== idx);
    setForm({ ...form, autoActions: actions });
  }

  function updateAction(idx: number, config: Record<string, string>) {
    const actions = [...(form.autoActions || [])];
    actions[idx] = { ...actions[idx], config };
    setForm({ ...form, autoActions: actions });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-sm">状态流转规则</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {/* itemType filter */}
          <SimpleSelect value={filterType} onValueChange={v => setFilterType(v as ItemType | 'all')} options={[{ value: 'all', label: '全部类型' }, ...ITEM_TYPES.map(t => ({ value: t, label: ITEM_TYPE_LABELS[t] }))]} className="border border-input rounded px-2 py-1 text-xs" />
          {/* Preset selector */}
          {rules.length > 0 && (<SimpleSelect value="" onValueChange={v => { if (v) { const preset = FLOW_PRESETS[v]; if (preset) dispatch({ type: 'SET_STATUS_FLOW_RULES', payload: preset.rules }); } }} options={[{ value: '', label: '重置为预设模板...' }, ...Object.entries(FLOW_PRESETS).map(([key, preset]) => ({ value: key, label: `${preset.label}—${preset.desc}` }))]} className="border border-input rounded px-2 py-1 text-xs" />)}
          {/* View mode toggle */}
          <div className="flex items-center border border-border rounded overflow-hidden">
            <button className={cn('px-2 py-1 text-xs transition-colors', viewMode === 'graph' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')} onClick={() => setViewMode('graph')}><GitBranch size={14} /></button>
            <button className={cn('px-2 py-1 text-xs transition-colors', viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')} onClick={() => setViewMode('list')}><List size={14} /></button>
          </div>
          <button onClick={() => { setForm({ fromStatus: 'todo', toStatus: 'in_progress', allowedRoles: [], autoActions: [], enabled: true, itemType: filterType !== 'all' ? filterType : 'task' }); setEditingIdx(rules.length); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={14} /> 新增规则</button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">定义项目/任务/目标状态之间的流转约束。留空角色列表 = 所有角色可转。状态变更时自动执行配置的动作。</p>

      {/* Empty state */}
      {rules.length === 0 && <div className="text-center py-6 space-y-3"><EmptyState title="暂无流转规则" compact /><p className="text-xs text-muted-foreground">默认：任意角色可转任意状态</p><div className="flex items-center justify-center gap-2">{Object.entries(FLOW_PRESETS).map(([key, preset]) => (<button key={key} onClick={() => dispatch({ type: 'SET_STATUS_FLOW_RULES', payload: preset.rules })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"><Download size={12} /> {preset.label}<span className="text-muted-foreground group-hover:text-primary-foreground/80">— {preset.desc}</span></button>))}</div></div>}

      {/* Graph view */}
      {rules.length > 0 && viewMode === 'graph' && (
        <div className="space-y-4">
          {(filterType === 'all' ? ITEM_TYPES : [filterType]).map(it => (
            <FlowGraph key={it} rules={rules} itemType={it} />
          ))}
        </div>
      )}

      {/* List view */}
      {rules.length > 0 && viewMode === 'list' && (
        <div className="space-y-2">
          {filteredRules.map((rule, idx) => {
            const globalIdx = rules.indexOf(rule);
            return (
              <div key={rule.id || idx} className={cn('flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-card', rule.enabled === false && 'opacity-50')}>
                {/* Enabled toggle */}
                <button className="cursor-pointer" onClick={() => toggleEnabled(globalIdx)} aria-label={rule.enabled === false ? '启用规则' : '禁用规则'}>
                  {rule.enabled === false ? <PowerOff size={14} className="text-muted-foreground" /> : <Power size={14} className="text-green-500" />}
                </button>
                {/* Type badge */}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">{ITEM_TYPE_LABELS[rule.itemType]}</span>
                <span className={cn('text-xs px-2 py-0.5 rounded', STATUS_COLORS[rule.fromStatus] || 'bg-gray-100')}>{STATUS_LABELS[rule.fromStatus]}</span>
                <ArrowRight size={14} className="text-muted-foreground flex-shrink-0" />
                <span className={cn('text-xs px-2 py-0.5 rounded', STATUS_COLORS[rule.toStatus] || 'bg-blue-50 text-blue-700')}>{STATUS_LABELS[rule.toStatus]}</span>
                {rule.name && <span className="text-xs text-muted-foreground truncate max-w-[100px]">{rule.name}</span>}
                <span className="text-[10px] text-muted-foreground">{rule.allowedRoles.length === 0 ? '全部角色' : rule.allowedRoles.map(r => ROLE_LABELS[r]).join(', ')}</span>
                {(rule.autoActions?.length ?? 0) > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{rule.autoActions!.length}个动作</span>}
                {rule.enabled === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">已禁用</span>}
                <div className="flex-1" />
                <button onClick={() => { setForm({ ...rule }); setEditingIdx(globalIdx); }} className="text-muted-foreground hover:text-primary cursor-pointer" aria-label="编辑规则"><Edit2 size={14} /></button>
                <button onClick={() => handleDelete(globalIdx)} className="text-muted-foreground hover:text-destructive cursor-pointer" aria-label="删除规则"><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor */}
      {editingIdx !== null && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
          <h4 className="text-xs font-semibold">{editingIdx < rules.length ? '编辑规则' : '新建规则'}</h4>
          {/* itemType */}
          <div>
            <label className="text-xs text-muted-foreground">应用类型</label>
            <SimpleSelect value={form.itemType} onValueChange={v => setForm({ ...form, itemType: v as ItemType })} options={ITEM_TYPES.map(t => ({ value: t, label: ITEM_TYPE_LABELS[t] }))} className="border border-input rounded px-2 py-1 text-sm mt-1" />
          </div>
          <div className="flex items-center gap-2">
            <SimpleSelect value={form.fromStatus} onValueChange={v => setForm({ ...form, fromStatus: v })} options={STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] }))} className="border border-input rounded px-2 py-1 text-sm" />
            <ArrowRight size={16} />
            <SimpleSelect value={form.toStatus} onValueChange={v => setForm({ ...form, toStatus: v })} options={STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s] }))} className="border border-input rounded px-2 py-1 text-sm" />
          </div>
          {/* Rule name */}
          <div>
            <label className="text-xs text-muted-foreground">规则名称（可选）</label>
            <input type="text" className="w-full text-sm border border-input rounded px-2 py-1.5 mt-1" placeholder="如：开始任务" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          {/* Enabled toggle */}
          <div className="flex items-center gap-2">
            <button className={cn('flex items-center gap-1.5 text-xs cursor-pointer', form.enabled !== false ? 'text-green-600' : 'text-muted-foreground')} onClick={() => setForm({ ...form, enabled: form.enabled === false ? true : false })}>
              {form.enabled !== false ? <Power size={14} /> : <PowerOff size={14} />}
              {form.enabled !== false ? '已启用' : '已禁用'}
            </button>
          </div>
          {/* Roles */}
          <div>
            <label className="text-xs text-muted-foreground">允许的角色（不选=全部）</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ROLES.map(r => (
                <label key={r} className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" checked={form.allowedRoles.includes(r)} onChange={() => toggleRole(r)} />
                  {ROLE_LABELS[r]}
                </label>
              ))}
            </div>
          </div>
          {/* Auto actions */}
          <div>
            <label className="text-xs text-muted-foreground">触发动作</label>
            <div className="flex gap-1 mt-1 flex-wrap">
              <button onClick={() => addAction('notify')} className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-muted cursor-pointer"><Bell size={12} /> 通知</button>
              <button onClick={() => addAction('set_field')} className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-muted cursor-pointer"><Edit2 size={12} /> 改字段</button>
              <button onClick={() => addAction('assign')} className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-muted cursor-pointer"><UserPlus size={12} /> 分配</button>
              <button onClick={() => addAction('create_subtask')} className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-muted cursor-pointer"><Plus size={12} /> 创建子任务</button>
            </div>
            <div className="space-y-2 mt-2">
              {(form.autoActions || []).map((act, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-xs flex-wrap">
                  <span className="font-medium">{act.type === 'notify' ? '通知' : act.type === 'set_field' ? '改字段' : act.type === 'assign' ? '分配' : '创建子任务'}</span>
                  {act.type === 'notify' && (
                    <input className="flex-1 min-w-[120px] border border-input rounded px-1.5 py-0.5 text-xs" placeholder="通知消息" value={act.config.message ?? ''} onChange={e => updateAction(i, { ...act.config, message: e.target.value })} />
                  )}
                  {act.type === 'set_field' && (
                    <>
                      <input className="w-20 border border-input rounded px-1.5 py-0.5 text-xs" placeholder="字段" value={act.config.field ?? ''} onChange={e => updateAction(i, { ...act.config, field: e.target.value })} />
                      <input className="w-20 border border-input rounded px-1.5 py-0.5 text-xs" placeholder="值" value={act.config.value ?? ''} onChange={e => updateAction(i, { ...act.config, value: e.target.value })} />
                    </>
                  )}
                  {act.type === 'assign' && (
                    <SimpleSelect value={act.config.memberId ?? ''} onValueChange={v => updateAction(i, { ...act.config, memberId: v })} options={[{ value: '', label: '选择成员' }, ...state.members.filter(m => m.status === 'active').map(m => ({ value: m.id, label: m.name }))]} className="border border-input rounded px-1.5 py-0.5 text-xs" />
                  )}
                  {act.type === 'create_subtask' && (
                    <>
                      <input className="w-28 border border-input rounded px-1.5 py-0.5 text-xs" placeholder="子任务标题" value={act.config.title ?? ''} onChange={e => updateAction(i, { ...act.config, title: e.target.value })} />
                      <SimpleSelect value={act.config.priority ?? 'medium'} onValueChange={v => updateAction(i, { ...act.config, priority: v })} options={[{ value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' }]} className="border border-input rounded px-1.5 py-0.5 text-xs" />
                      <SimpleSelect value={act.config.memberId ?? ''} onValueChange={v => updateAction(i, { ...act.config, memberId: v })} options={[{ value: '', label: '自动分配' }, ...state.members.filter(m => m.status === 'active').map(m => ({ value: m.id, label: m.name }))]} className="border border-input rounded px-1.5 py-0.5 text-xs" />
                    </>
                  )}
                  <button onClick={() => removeAction(i)} className="text-muted-foreground hover:text-destructive cursor-pointer" aria-label="移除动作"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={editingIdx < rules.length ? handleUpdate : handleAdd} className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 cursor-pointer">{editingIdx < rules.length ? '保存' : '添加'}</button>
            <button onClick={() => setEditingIdx(null)} className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted cursor-pointer">取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
