import { useState } from 'react';
import { useStore } from '@/store/useStore';
import type { StatusFlowRule, StatusFlowAutoAction, MemberRole } from '@/types';
import { getDefaultStatusFlowRules } from '@/store/shared';
import { Plus, Trash2, Bell, Edit2, UserPlus, ArrowRight, Download } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

const STATUSES = ['todo', 'in_progress', 'done', 'blocked', 'cancelled'];
const STATUS_LABELS: Record<string, string> = { todo: '待办', in_progress: '进行中', done: '已完成', blocked: '阻塞', cancelled: '已取消' };
const ROLES = ['admin', 'manager', 'leader', 'member'] as const;
const ROLE_LABELS: Record<string, string> = { admin: '管理员', manager: '负责人', leader: '组长', member: '成员' };

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

export function FlowConfigTab() {
  const { state, dispatch } = useStore();
  const rules = state.statusFlowRules || [];
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [form, setForm] = useState<StatusFlowRule>({ id: '', fromStatus: 'todo', toStatus: 'in_progress', allowedRoles: [], autoActions: [] });

  function handleAdd() {
    dispatch({ type: 'ADD_STATUS_FLOW_RULE', payload: { ...form } });
    setForm({ id: '', fromStatus: 'todo', toStatus: 'in_progress', allowedRoles: [], autoActions: [] });
    setEditingIdx(null);
  }

  function handleUpdate() {
    if (editingIdx !== null) {
      dispatch({ type: 'UPDATE_STATUS_FLOW_RULE', payload: { index: editingIdx, rule: { ...form, id: form.id || rules[editingIdx]?.id || '' } } });
      setEditingIdx(null);
      setForm({ id: '', fromStatus: 'todo', toStatus: 'in_progress', allowedRoles: [], autoActions: [] });
    }
  }

  function handleDelete(idx: number) {
    dispatch({ type: 'DELETE_STATUS_FLOW_RULE', payload: idx });
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
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">状态流转规则</h3>
        <div className="flex items-center gap-2">
          {rules.length > 0 && (<select className="border border-input rounded px-2 py-1 text-xs" onChange={e => { if (e.target.value) { const preset = FLOW_PRESETS[e.target.value]; if (preset) dispatch({ type: 'SET_STATUS_FLOW_RULES', payload: preset.rules }); e.target.value = ''; } }} defaultValue="">
            <option value="" disabled>重置为预设模板...</option>
            {Object.entries(FLOW_PRESETS).map(([key, preset]) => (<option key={key} value={key}>{preset.label}—{preset.desc}</option>))}
          </select>)}
          <button onClick={() => { setForm({ fromStatus: 'todo', toStatus: 'in_progress', allowedRoles: [], autoActions: [] }); setEditingIdx(rules.length); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={14} /> 新增规则</button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">定义项目/任务状态之间的流转约束。留空角色列表 = 所有角色可转。状态变更时自动执行配置的动作。</p>

      {rules.length === 0 && <div className="text-center py-6 space-y-3"><p className="text-xs text-muted-foreground">暂无流转规则（默认：任意角色可转任意状态）</p><div className="flex items-center justify-center gap-2">{Object.entries(FLOW_PRESETS).map(([key, preset]) => (<button key={key} onClick={() => dispatch({ type: 'SET_STATUS_FLOW_RULES', payload: preset.rules })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"><Download size={12} /> {preset.label}<span className="text-muted-foreground group-hover:text-primary-foreground/80">— {preset.desc}</span></button>))}</div></div>}

      <div className="space-y-2">
        {rules.map((rule, idx) => (
          <div key={rule.id || idx} className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-card">
            <span className="text-xs px-2 py-0.5 rounded bg-gray-100">{STATUS_LABELS[rule.fromStatus] || rule.fromStatus}</span>
            <ArrowRight size={14} className="text-muted-foreground" />
            <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">{STATUS_LABELS[rule.toStatus] || rule.toStatus}</span>
            <span className="text-xs text-muted-foreground">{rule.allowedRoles.length === 0 ? '全部角色' : rule.allowedRoles.map(r => ROLE_LABELS[r]).join(', ')}</span>
            {(rule.autoActions?.length ?? 0) > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{rule.autoActions!.length}个动作</span>}
            <div className="flex-1" />
            <button onClick={() => { setForm({ ...rule }); setEditingIdx(idx); }} className="text-muted-foreground hover:text-primary cursor-pointer"><Edit2 size={14} /></button>
            <button onClick={() => handleDelete(idx)} className="text-muted-foreground hover:text-destructive cursor-pointer"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      {editingIdx !== null && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
          <h4 className="text-xs font-semibold">{editingIdx < rules.length ? '编辑规则' : '新建规则'}</h4>
          <div className="flex items-center gap-2">
            <select className="border border-input rounded px-2 py-1 text-sm" value={form.fromStatus} onChange={e => setForm({ ...form, fromStatus: e.target.value })}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <ArrowRight size={16} />
            <select className="border border-input rounded px-2 py-1 text-sm" value={form.toStatus} onChange={e => setForm({ ...form, toStatus: e.target.value })}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
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
          <div>
            <label className="text-xs text-muted-foreground">触发动作</label>
            <div className="flex gap-1 mt-1">
              <button onClick={() => addAction('notify')} className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-muted cursor-pointer"><Bell size={12} /> 通知</button>
              <button onClick={() => addAction('set_field')} className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-muted cursor-pointer"><Edit2 size={12} /> 改字段</button>
              <button onClick={() => addAction('assign')} className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-muted cursor-pointer"><UserPlus size={12} /> 分配</button>
            </div>
            <div className="space-y-2 mt-2">
              {(form.autoActions || []).map((act, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-xs">
                  <span className="font-medium">{act.type === 'notify' ? '通知' : act.type === 'set_field' ? '改字段' : '分配'}</span>
                  {act.type === 'notify' && (
                    <input className="flex-1 border border-input rounded px-1.5 py-0.5 text-xs" placeholder="通知消息" value={act.config.message ?? ''} onChange={e => updateAction(i, { ...act.config, message: e.target.value })} />
                  )}
                  {act.type === 'set_field' && (
                    <>
                      <input className="w-20 border border-input rounded px-1.5 py-0.5 text-xs" placeholder="字段" value={act.config.field ?? ''} onChange={e => updateAction(i, { ...act.config, field: e.target.value })} />
                      <input className="w-20 border border-input rounded px-1.5 py-0.5 text-xs" placeholder="值" value={act.config.value ?? ''} onChange={e => updateAction(i, { ...act.config, value: e.target.value })} />
                    </>
                  )}
                  {act.type === 'assign' && (
                    <select className="border border-input rounded px-1.5 py-0.5 text-xs" value={act.config.memberId ?? ''} onChange={e => updateAction(i, { ...act.config, memberId: e.target.value })}>
                      <option value="">选择成员</option>
                      {state.members.filter(m => m.status === 'active').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  )}
                  <button onClick={() => removeAction(i)} className="text-muted-foreground hover:text-destructive cursor-pointer"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={editingIdx < rules.length ? handleUpdate : handleAdd} className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">{editingIdx < rules.length ? '保存' : '添加'}</button>
            <button onClick={() => setEditingIdx(null)} className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted">取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
