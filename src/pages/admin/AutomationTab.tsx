import { useState } from 'react';
import { useStore } from '@/store/useStore';
import type { AutomationRule, AutomationTrigger, AutomationAction, ItemType } from '@/types';
import { Plus, Trash2, Bell, Edit2, UserPlus, Zap, ToggleLeft, ToggleRight } from 'lucide-react';

const TRIGGERS: { value: AutomationTrigger; label: string }[] = [
  { value: 'status_change', label: '状态变更' },
  { value: 'due_arrive', label: '到期提醒' },
  { value: 'item_created', label: '创建事项' },
  { value: 'field_change', label: '字段变更' },
];
const ACTIONS: { value: AutomationAction; label: string }[] = [
  { value: 'notify', label: '发送通知' },
  { value: 'set_field', label: '改字段值' },
  { value: 'create_subtask', label: '创建子任务' },
  { value: 'assign', label: '分配负责人' },
  { value: 'escalation', label: '升级通知' },
];
const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: 'task', label: '任务' },
  { value: 'project', label: '项目' },
  { value: 'goal', label: '目标' },
];

export function AutomationTab() {
  const { state, dispatch } = useStore();
  const rules = state.automationRules || [];
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; enabled: boolean; itemType: ItemType; trigger: AutomationTrigger; conditionField: string; conditionOperator: string; conditionValue: string; actions: { type: AutomationAction; config: Record<string, string> }[] }>({
    name: '', enabled: true, itemType: 'task', trigger: 'status_change', conditionField: 'status', conditionOperator: 'eq', conditionValue: 'done', actions: [],
  });

  function resetForm() {
    setForm({ name: '', enabled: true, itemType: 'task', trigger: 'status_change', conditionField: 'status', conditionOperator: 'eq', conditionValue: 'done', actions: [] });
    setEditingId(null);
  }

  function startEdit(rule: AutomationRule) {
    setForm({
      name: rule.name, enabled: rule.enabled, itemType: rule.itemType, trigger: rule.trigger,
      conditionField: rule.condition.field, conditionOperator: rule.condition.operator, conditionValue: rule.condition.value,
      actions: [...rule.actions],
    });
    setEditingId(rule.id);
    setShowForm(true);
  }

  function handleSave() {
    if (editingId) {
      dispatch({ type: 'UPDATE_AUTOMATION_RULE', payload: { id: editingId, updates: {
        name: form.name, enabled: form.enabled, itemType: form.itemType, trigger: form.trigger,
        condition: { field: form.conditionField, operator: form.conditionOperator as any, value: form.conditionValue },
        actions: form.actions,
      }}});
    } else {
      dispatch({ type: 'ADD_AUTOMATION_RULE', payload: {
        name: form.name, enabled: form.enabled, itemType: form.itemType, trigger: form.trigger,
        condition: { field: form.conditionField, operator: form.conditionOperator as any, value: form.conditionValue },
        actions: form.actions,
      }});
    }
    setShowForm(false);
    resetForm();
  }

  function toggleEnabled(id: string, enabled: boolean) {
    dispatch({ type: 'UPDATE_AUTOMATION_RULE', payload: { id, updates: { enabled: !enabled } } });
  }

  function addAction(type: AutomationAction) {
    const actions = [...form.actions];
    if (type === 'notify') actions.push({ type, config: { title: '', message: '', memberId: '' } });
    else if (type === 'set_field') actions.push({ type, config: { field: '', value: '' } });
    else if (type === 'assign') actions.push({ type, config: { memberId: '' } });
    else if (type === 'escalation') actions.push({ type, config: { message: '' } });
    else if (type === 'create_subtask') actions.push({ type, config: { title: '' } });
    setForm({ ...form, actions });
  }

  function removeAction(idx: number) {
    setForm({ ...form, actions: form.actions.filter((_, i) => i !== idx) });
  }

  function updateAction(idx: number, config: Record<string, string>) {
    const actions = [...form.actions];
    actions[idx] = { ...actions[idx], config };
    setForm({ ...form, actions });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">自动化规则</h3>
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={14} /> 新增规则</button>
      </div>
      <p className="text-xs text-muted-foreground">配置触发条件和执行动作，实现自动化工作流。如：任务完成时通知负责人、逾期自动升级等。</p>

      {rules.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">暂无自动化规则</p>}

      <div className="space-y-2">
        {rules.map(rule => (
          <div key={rule.id} className="flex items-center gap-3 px-3 py-2.5 border border-border rounded-lg bg-white">
            <Zap size={16} className={rule.enabled ? 'text-amber-500' : 'text-gray-300'} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{rule.name}</div>
              <div className="text-xs text-muted-foreground">{ITEM_TYPES.find(t => t.value === rule.itemType)?.label} · {TRIGGERS.find(t => t.value === rule.trigger)?.label} · {rule.actions.length}个动作</div>
            </div>
            <button onClick={() => toggleEnabled(rule.id, rule.enabled)} className="cursor-pointer">
              {rule.enabled ? <ToggleRight size={20} className="text-primary" /> : <ToggleLeft size={20} className="text-gray-400" />}
            </button>
            <button onClick={() => startEdit(rule)} className="text-muted-foreground hover:text-primary cursor-pointer"><Edit2 size={14} /></button>
            <button onClick={() => dispatch({ type: 'DELETE_AUTOMATION_RULE', payload: rule.id })} className="text-muted-foreground hover:text-destructive cursor-pointer"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-white">
          <h4 className="text-xs font-semibold">{editingId ? '编辑自动化规则' : '新建自动化规则'}</h4>
          <div>
            <label className="text-xs text-muted-foreground">规则名称</label>
            <input className="w-full border border-input rounded px-2 py-1 text-sm mt-1" placeholder="如：任务完成时通知" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">适用类型</label>
              <select className="w-full border border-input rounded px-2 py-1 text-sm mt-1" value={form.itemType} onChange={e => setForm({ ...form, itemType: e.target.value as ItemType })}>
                {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">触发条件</label>
              <select className="w-full border border-input rounded px-2 py-1 text-sm mt-1" value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value as AutomationTrigger })}>
                {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">条件</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <input className="border border-input rounded px-2 py-1 text-sm" placeholder="字段" value={form.conditionField} onChange={e => setForm({ ...form, conditionField: e.target.value })} />
              <select className="border border-input rounded px-2 py-1 text-sm" value={form.conditionOperator} onChange={e => setForm({ ...form, conditionOperator: e.target.value })}>
                <option value="eq">等于</option><option value="neq">不等于</option><option value="contains">包含</option><option value="empty">为空</option><option value="not_empty">不为空</option>
              </select>
              <input className="border border-input rounded px-2 py-1 text-sm" placeholder="值" value={form.conditionValue} onChange={e => setForm({ ...form, conditionValue: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">执行动作</label>
            <div className="flex gap-1 mt-1">
              {ACTIONS.map(a => (
                <button key={a.value} onClick={() => addAction(a.value)} className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-border rounded hover:bg-muted cursor-pointer">{a.label}</button>
              ))}
            </div>
            <div className="space-y-2 mt-2">
              {form.actions.map((act, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-xs">
                  <span className="font-medium whitespace-nowrap">{ACTIONS.find(a => a.value === act.type)?.label}</span>
                  {(act.type === 'notify' || act.type === 'escalation') && <input className="flex-1 border border-input rounded px-1.5 py-0.5" placeholder="消息内容" value={act.config.message ?? ''} onChange={e => updateAction(i, { ...act.config, message: e.target.value })} />}
                  {act.type === 'set_field' && <><input className="w-16 border border-input rounded px-1.5 py-0.5" placeholder="字段" value={act.config.field ?? ''} onChange={e => updateAction(i, { ...act.config, field: e.target.value })} /><input className="w-16 border border-input rounded px-1.5 py-0.5" placeholder="值" value={act.config.value ?? ''} onChange={e => updateAction(i, { ...act.config, value: e.target.value })} /></>}
                  {act.type === 'assign' && <select className="border border-input rounded px-1.5 py-0.5" value={act.config.memberId ?? ''} onChange={e => updateAction(i, { ...act.config, memberId: e.target.value })}><option value="">选择成员</option>{state.members.filter(m => m.status === 'active').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
                  {act.type === 'create_subtask' && <input className="flex-1 border border-input rounded px-1.5 py-0.5" placeholder="子任务标题" value={act.config.title ?? ''} onChange={e => updateAction(i, { ...act.config, title: e.target.value })} />}
                  <button onClick={() => removeAction(i)} className="text-muted-foreground hover:text-destructive cursor-pointer"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!form.name.trim()} className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">{editingId ? '保存' : '添加'}</button>
            <button onClick={() => { setShowForm(false); resetForm(); }} className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted">取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
