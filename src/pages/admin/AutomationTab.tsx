import { useState } from 'react';
import { useStore } from '@/store/useStore';
import type { AutomationRule, AutomationTrigger, AutomationAction, ItemType } from '@/types';
import { Plus, Trash2, Bell, Edit2, UserPlus, Zap, ToggleLeft, ToggleRight, Sparkles, Activity, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { createRuleFromIntent, getWorkflowPatternSummary } from '@/lib/ai/aiWorkflowEngine';
import { getAutomationLog, clearAutomationLog } from '@/store/shared';
import type { AutomationLogEntry } from '@/store/shared';

const TRIGGERS: { value: AutomationTrigger; label: string }[] = [
  { value: 'status_change', label: '状态变更' },
  { value: 'due_arrive', label: '到期提醒' },
  { value: 'item_created', label: '创建事项' },
  { value: 'field_change', label: '字段变更' },
  { value: 'kr_lag', label: 'KR进度落后' },
  { value: 'overdue', label: '事项逾期' },
];
const ACTIONS: { value: AutomationAction; label: string }[] = [
  { value: 'notify', label: '发送通知' },
  { value: 'set_field', label: '改字段值' },
  { value: 'create_subtask', label: '创建子任务' },
  { value: 'assign', label: '分配负责人' },
  { value: 'escalation', label: '升级通知' },
  { value: 'ai_action', label: 'AI智能动作' },
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
  const [showLog, setShowLog] = useState(false);
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
        condition: { field: form.conditionField, operator: form.conditionOperator as AutomationRule['condition']['operator'], value: form.conditionValue },
        actions: form.actions,
      }}});
    } else {
      dispatch({ type: 'ADD_AUTOMATION_RULE', payload: {
        name: form.name, enabled: form.enabled, itemType: form.itemType, trigger: form.trigger,
        condition: { field: form.conditionField, operator: form.conditionOperator as AutomationRule['condition']['operator'], value: form.conditionValue },
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
    else if (type === 'ai_action') actions.push({ type, config: { actionId: 'smart_assign' } });
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

  const [aiInput, setAiInput] = useState('');
  const [showAiHint, setShowAiHint] = useState(false);

  function handleAiCreate() {
    if (!aiInput.trim()) return;
    const rule = createRuleFromIntent(aiInput.trim());
    if (!rule) return;
    dispatch({ type: 'ADD_AUTOMATION_RULE', payload: {
      name: rule.name, enabled: rule.enabled, itemType: rule.itemType, trigger: rule.trigger,
      condition: rule.condition, actions: rule.actions,
    }});
    setAiInput('');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">自动化规则</h3>
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={14} /> 新增规则</button>
      </div>
      <p className="text-xs text-muted-foreground">配置触发条件和执行动作，实现自动化工作流。如：任务完成时通知负责人、逾期自动升级等。</p>

      {/* AI Natural Language Workflow Builder */}
      <div className="border border-primary/20 rounded-lg p-3 bg-primary/5 space-y-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-primary" />
          <span className="text-xs font-semibold text-primary">AI 工作流创建</span>
          <button onClick={() => setShowAiHint(!showAiHint)} className="text-[10px] text-muted-foreground hover:text-foreground ml-auto">查看示例</button>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 border border-input rounded px-2 py-1 text-sm"
            placeholder="描述你想自动化的流程，如：当任务逾期时自动通知管理员"
            value={aiInput}
            onChange={e => setAiInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAiCreate()}
          />
          <button onClick={handleAiCreate} disabled={!aiInput.trim()} className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50">
            创建
          </button>
        </div>
        {showAiHint && (
          <div className="text-[11px] text-muted-foreground bg-card rounded p-2 border border-border">
            <div className="font-medium mb-1">可用模式:</div>
            <div>· 当任务逾期时自动通知管理员</div>
            <div>· 当目标完成时创建复盘子任务</div>
            <div>· 当KR进度落后时智能分配</div>
            <div>· 当任务阻塞时升级通知</div>
          </div>
        )}
      </div>

      {rules.length === 0 && <EmptyState title="暂无自动化规则" compact />}

      <div className="space-y-2">
        {rules.map(rule => (
          <div key={rule.id} className="flex items-center gap-3 px-3 py-2.5 border border-border rounded-lg bg-card">
            <Zap size={16} className={rule.enabled ? 'text-amber-500' : 'text-muted-foreground/30'} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{rule.name}</div>
              <div className="text-xs text-muted-foreground">{ITEM_TYPES.find(t => t.value === rule.itemType)?.label} · {TRIGGERS.find(t => t.value === rule.trigger)?.label} · {rule.actions.length}个动作</div>
            </div>
            <button onClick={() => toggleEnabled(rule.id, rule.enabled)} className="cursor-pointer">
              {rule.enabled ? <ToggleRight size={20} className="text-primary" /> : <ToggleLeft size={20} className="text-muted-foreground/40" />}
            </button>
            <button onClick={() => startEdit(rule)} className="text-muted-foreground hover:text-primary cursor-pointer"><Edit2 size={14} /></button>
            <button onClick={() => dispatch({ type: 'DELETE_AUTOMATION_RULE', payload: rule.id })} className="text-muted-foreground hover:text-destructive cursor-pointer"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
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
                <option value="eq">等于</option><option value="neq">不等于</option><option value="contains">包含</option><option value="empty">为空</option><option value="not_empty">不为空</option><option value="gt">大于</option><option value="lt">小于</option>
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
                <div key={i} className="flex items-center gap-2 p-2 bg-muted/50 rounded text-xs">
                  <span className="font-medium whitespace-nowrap">{ACTIONS.find(a => a.value === act.type)?.label}</span>
                  {(act.type === 'notify' || act.type === 'escalation') && <input className="flex-1 border border-input rounded px-1.5 py-0.5" placeholder="消息内容" value={act.config.message ?? ''} onChange={e => updateAction(i, { ...act.config, message: e.target.value })} />}
                  {act.type === 'set_field' && <><input className="w-16 border border-input rounded px-1.5 py-0.5" placeholder="字段" value={act.config.field ?? ''} onChange={e => updateAction(i, { ...act.config, field: e.target.value })} /><input className="w-16 border border-input rounded px-1.5 py-0.5" placeholder="值" value={act.config.value ?? ''} onChange={e => updateAction(i, { ...act.config, value: e.target.value })} /></>}
                  {act.type === 'assign' && <select className="border border-input rounded px-1.5 py-0.5" value={act.config.memberId ?? ''} onChange={e => updateAction(i, { ...act.config, memberId: e.target.value })}><option value="">选择成员</option>{state.members.filter(m => m.status === 'active').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
                  {act.type === 'create_subtask' && <input className="flex-1 border border-input rounded px-1.5 py-0.5" placeholder="子任务标题" value={act.config.title ?? ''} onChange={e => updateAction(i, { ...act.config, title: e.target.value })} />}
                  {act.type === 'ai_action' && <select className="border border-input rounded px-1.5 py-0.5" value={act.config.actionId ?? 'smart_assign'} onChange={e => updateAction(i, { ...act.config, actionId: e.target.value })}><option value="smart_assign">智能分配</option><option value="auto_complete_goal">自动完成目标</option><option value="get_risk_items">风险检测</option><option value="get_team_load">团队负载</option><option value="get_overdue_tasks">逾期查询</option><option value="get_goal_progress">目标进度</option></select>}
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

      {/* 执行日志面板 */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5"><Activity size={14} />执行日志</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowLog(v => !v)} className="text-xs text-muted-foreground hover:text-foreground">{showLog ? '收起' : '展开'}</button>
            {showLog && getAutomationLog().length > 0 && (
              <button onClick={clearAutomationLog} className="text-xs text-muted-foreground hover:text-destructive">清除</button>
            )}
          </div>
        </div>
        {showLog && (() => {
          const logs = getAutomationLog();
          if (logs.length === 0) return <p className="text-xs text-muted-foreground">暂无执行记录</p>;
          return (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {logs.slice(0, 50).map(log => (
                <div key={log.id} className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded text-xs">
                  {log.success ? <CheckCircle2 size={12} className="text-success flex-shrink-0" /> : <XCircle size={12} className="text-destructive flex-shrink-0" />}
                  <span className="font-medium truncate max-w-[120px]" title={log.ruleName}>{log.ruleName}</span>
                  <span className="text-muted-foreground">{TRIGGERS.find(t => t.value === log.trigger)?.label ?? log.trigger}</span>
                  <span className="truncate max-w-[100px]" title={log.itemTitle}>{log.itemTitle}</span>
                  <span className="text-muted-foreground ml-auto flex items-center gap-1"><Clock size={10} />{new Date(log.timestamp).toLocaleTimeString()}</span>
                  {!log.success && <span className="text-destructive truncate max-w-[120px]" title={log.error}>{log.error}</span>}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
