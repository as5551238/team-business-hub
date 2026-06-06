import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { Budget, BudgetItem, CostEntry, BudgetCategory } from '@/types';
import { Plus, X, AlertTriangle, CheckCircle, Clock, DollarSign, TrendingUp, TrendingDown, ChevronDown, ChevronRight } from 'lucide-react';
import { inputCls, primaryBtnCls, btnCls } from './constants';
import { SimpleSelect } from '@/components/ui/simple-select';

const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  labor: '人力成本',
  material: '物料/资源',
  outsourcing: '外包/采购',
  travel: '差旅',
  other: '其他',
};

const CATEGORY_COLORS: Record<BudgetCategory, string> = {
  labor: 'bg-blue-100 text-blue-700',
  material: 'bg-emerald-100 text-emerald-700',
  outsourcing: 'bg-purple-100 text-purple-700',
  travel: 'bg-amber-100 text-amber-700',
  other: 'bg-gray-100 text-gray-700',
};

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  approved: '已审批',
  active: '执行中',
  closed: '已关闭',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  approved: 'bg-blue-100 text-blue-700',
  active: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-slate-100 text-slate-700',
};

const CURRENCY_SYMBOLS: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€' };

export function BudgetTab() {
  const { state, dispatch } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<string | null>(null);
  const [showCostEntry, setShowCostEntry] = useState(false);
  const [expandedBudget, setExpandedBudget] = useState<string | null>(null);

  // Create budget form
  const [formName, setFormName] = useState('');
  const [formProjectId, setFormProjectId] = useState('');
  const [formCurrency, setFormCurrency] = useState('CNY');
  const [formItems, setFormItems] = useState<BudgetItem[]>([]);

  // Cost entry form
  const [costAmount, setCostAmount] = useState('');
  const [costCategory, setCostCategory] = useState<BudgetCategory>('other');
  const [costDesc, setCostDesc] = useState('');
  const [costProjectId, setCostProjectId] = useState('');
  const [costTaskId, setCostTaskId] = useState('');

  const budgets = state.budgets;
  const costEntries = state.costEntries;

  // Summary stats
  const totalPlanned = useMemo(() =>
    budgets.reduce((sum, b) => sum + b.items.reduce((s, it) => s + it.plannedAmount, 0), 0),
    [budgets]
  );
  const totalActual = useMemo(() =>
    budgets.reduce((sum, b) => sum + b.items.reduce((s, it) => s + it.actualAmount, 0), 0),
    [budgets]
  );
  const deviation = totalPlanned > 0 ? ((totalActual - totalPlanned) / totalPlanned * 100) : 0;

  // Cost by category
  const costByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ce of costEntries) {
      if (ce.status === 'approved') {
        map[ce.category] = (map[ce.category] || 0) + ce.amount;
      }
    }
    return map;
  }, [costEntries]);

  // R2-4: Labor cost estimation (daily rate × completed tasks)
  const laborCostEstimate = useMemo(() => {
    const DAILY_RATE = 800; // default daily rate CNY
    const completedTasks = state.tasks.filter(t => t.status === 'done' && t.completedAt);
    const memberHours: Record<string, number> = {};
    for (const t of completedTasks) {
      const assignee = t.assigneeId || t.ownerId;
      if (!assignee) continue;
      const start = t.startDate ? new Date(t.startDate) : new Date(t.createdAt);
      const end = t.completedAt ? new Date(t.completedAt) : new Date();
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      memberHours[assignee] = (memberHours[assignee] || 0) + days;
    }
    return Object.entries(memberHours).map(([memberId, days]) => {
      const member = state.members.find(m => m.id === memberId);
      return { memberId, name: member?.name || member?.nickname || '未知', days, cost: days * DAILY_RATE };
    });
  }, [state.tasks, state.members]);

  const totalLaborCost = laborCostEstimate.reduce((s, l) => s + l.cost, 0);

  // Cost trend (by month)
  const costTrend = useMemo(() => {
    const monthly: Record<string, number> = {};
    for (const ce of costEntries) {
      if (ce.status !== 'approved') continue;
      const month = ce.recordedAt ? new Date(ce.recordedAt).toISOString().slice(0, 7) : new Date(ce.createdAt).toISOString().slice(0, 7);
      monthly[month] = (monthly[month] || 0) + ce.amount;
    }
    const maxAmount = Math.max(...Object.values(monthly), 1);
    return Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({
      month, amount, pct: amount / maxAmount * 100,
    }));
  }, [costEntries]);

  function resetForm() {
    setFormName(''); setFormProjectId(''); setFormCurrency('CNY'); setFormItems([]);
  }

  function addFormItem() {
    setFormItems(prev => [...prev, {
      id: `bi-${Date.now()}-${prev.length}`,
      category: 'other',
      name: '',
      plannedAmount: 0,
      actualAmount: 0,
      notes: null,
    }]);
  }

  function updateFormItem(idx: number, updates: Partial<BudgetItem>) {
    setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, ...updates } : it));
  }

  function removeFormItem(idx: number) {
    setFormItems(prev => prev.filter((_, i) => i !== idx));
  }

  function handleCreateBudget() {
    if (!formName.trim()) return;
    const totalAmount = formItems.reduce((s, it) => s + it.plannedAmount, 0);
    dispatch({
      type: 'ADD_BUDGET',
      payload: {
        projectId: formProjectId || null,
        seasonId: null,
        name: formName.trim(),
        totalAmount,
        currency: formCurrency,
        status: 'draft',
        items: formItems,
        approvedBy: null,
        teamId: state.currentTeamId || '__default__',
      },
    });
    resetForm();
    setShowCreate(false);
  }

  function handleApproveBudget(budget: Budget) {
    dispatch({
      type: 'UPDATE_BUDGET',
      payload: { id: budget.id, updates: { status: 'approved', approvedBy: state.currentUser?.id || null } },
    });
  }

  function handleActivateBudget(budget: Budget) {
    dispatch({ type: 'UPDATE_BUDGET', payload: { id: budget.id, updates: { status: 'active' } } });
  }

  function handleCloseBudget(budget: Budget) {
    dispatch({ type: 'UPDATE_BUDGET', payload: { id: budget.id, updates: { status: 'closed' } } });
  }

  function handleDeleteBudget(id: string) {
    dispatch({ type: 'DELETE_BUDGET', payload: id });
  }

  function handleAddCostEntry() {
    if (!costAmount || !costDesc.trim()) return;
    const targetBudgetId = selectedBudget || (budgets.length > 0 ? budgets[0].id : null);
    if (!targetBudgetId) return;
    dispatch({
      type: 'ADD_COST_ENTRY',
      payload: {
        budgetId: targetBudgetId,
        projectId: costProjectId || null,
        taskId: costTaskId || null,
        category: costCategory,
        amount: Number(costAmount),
        description: costDesc.trim(),
        recordedBy: state.currentUser?.id || null,
        recordedAt: new Date().toISOString(),
        approvedBy: null,
        status: 'pending',
        teamId: state.currentTeamId || '__default__',
      },
    });
    setCostAmount(''); setCostDesc(''); setCostCategory('other'); setCostProjectId(''); setCostTaskId('');
    setShowCostEntry(false);
  }

  function handleApproveCost(ce: CostEntry) {
    dispatch({ type: 'UPDATE_COST_ENTRY', payload: { id: ce.id, updates: { status: 'approved', approvedBy: state.currentUser?.id || null } } });
  }

  function handleRejectCost(ce: CostEntry) {
    dispatch({ type: 'UPDATE_COST_ENTRY', payload: { id: ce.id, updates: { status: 'rejected' } } });
  }

  return (
    <div className="space-y-4">
      {/* Summary Dashboard */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground font-medium">总预算</div>
          <div className="text-lg font-bold">{CURRENCY_SYMBOLS.CNY}{totalPlanned.toLocaleString()}</div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground font-medium">实际支出</div>
          <div className="text-lg font-bold">{CURRENCY_SYMBOLS.CNY}{totalActual.toLocaleString()}</div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground font-medium">偏差率</div>
          <div className={`text-lg font-bold flex items-center gap-1 ${Math.abs(deviation) > 20 ? 'text-red-600' : Math.abs(deviation) > 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {deviation > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {deviation.toFixed(1)}%
          </div>
          {Math.abs(deviation) > 20 && (
            <div className="flex items-center gap-1 text-[9px] text-red-500 mt-0.5">
              <AlertTriangle size={9} /> 超支预警
            </div>
          )}
        </div>
      </div>

      {/* Category Breakdown */}
      {Object.keys(costByCategory).length > 0 && (
        <div className="border rounded-lg p-3">
          <div className="text-[11px] font-semibold mb-2">已审批支出分类</div>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(costByCategory) as [BudgetCategory, number][]).map(([cat, amt]) => (
              <div key={cat} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium ${CATEGORY_COLORS[cat]}`}>
                {CATEGORY_LABELS[cat]}: ¥{amt.toLocaleString()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* R2-4: Labor Cost Estimate */}
      {laborCostEstimate.length > 0 && (
        <div className="border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-semibold">人力成本估算 (日费率 ¥800)</div>
            <span className="text-sm font-bold text-blue-700">¥{totalLaborCost.toLocaleString()}</span>
          </div>
          <div className="space-y-1">
            {laborCostEstimate.map(l => (
              <div key={l.memberId} className="flex items-center gap-2 text-[11px]">
                <span className="w-16 truncate">{l.name}</span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(100, l.cost / totalLaborCost * 100)}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground w-8 text-right">{l.days}天</span>
                <span className="text-[10px] font-medium w-20 text-right">¥{l.cost.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* R2-4: Cost Trend */}
      {costTrend.length > 0 && (
        <div className="border rounded-lg p-3">
          <div className="text-[11px] font-semibold mb-2">成本趋势 (月)</div>
          <div className="space-y-1">
            {costTrend.map(t => (
              <div key={t.month} className="flex items-center gap-2 text-[11px]">
                <span className="w-14 text-[10px] text-muted-foreground">{t.month}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${t.pct}%` }} />
                </div>
                <span className="text-[10px] font-medium w-20 text-right">¥{t.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <button onClick={() => setShowCreate(true)} className={primaryBtnCls}>
          <Plus size={12} /> 创建预算
        </button>
        <button onClick={() => setShowCostEntry(true)} className={btnCls}>
          <DollarSign size={12} /> 录入成本
        </button>
      </div>

      {/* Budget List */}
      <div className="space-y-2">
        {budgets.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-xs">
            暂无预算，点击"创建预算"开始
          </div>
        )}
        {budgets.map(budget => {
          const isExpanded = expandedBudget === budget.id;
          const budgetCosts = costEntries.filter(ce => ce.budgetId === budget.id);
          const plannedTotal = budget.items.reduce((s, it) => s + it.plannedAmount, 0);
          const actualTotal = budget.items.reduce((s, it) => s + it.actualAmount, 0);
          const budgetDeviation = plannedTotal > 0 ? ((actualTotal - plannedTotal) / plannedTotal * 100) : 0;

          return (
            <div key={budget.id} className="border rounded-lg">
              {/* Budget Header */}
              <button
                className="w-full p-3 flex items-center gap-3 text-left hover:bg-muted/30"
                onClick={() => setExpandedBudget(isExpanded ? null : budget.id)}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{budget.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${STATUS_COLORS[budget.status]}`}>
                      {STATUS_LABELS[budget.status]}
                    </span>
                    {Math.abs(budgetDeviation) > 20 && (
                      <AlertTriangle size={12} className="text-red-500" />
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    ¥{plannedTotal.toLocaleString()} 预算 / ¥{actualTotal.toLocaleString()} 实际
                    {plannedTotal > 0 && (
                      <span className={`ml-2 ${Math.abs(budgetDeviation) > 20 ? 'text-red-600' : Math.abs(budgetDeviation) > 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        ({budgetDeviation > 0 ? '+' : ''}{budgetDeviation.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>
                {/* Status Actions */}
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  {budget.status === 'draft' && (
                    <button onClick={() => handleApproveBudget(budget)} className="px-2 py-1 text-[9px] font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                      审批
                    </button>
                  )}
                  {budget.status === 'approved' && (
                    <button onClick={() => handleActivateBudget(budget)} className="px-2 py-1 text-[9px] font-medium bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200">
                      启动
                    </button>
                  )}
                  {budget.status === 'active' && (
                    <button onClick={() => handleCloseBudget(budget)} className="px-2 py-1 text-[9px] font-medium bg-slate-100 text-slate-700 rounded hover:bg-slate-200">
                      关闭
                    </button>
                  )}
                  <button onClick={() => handleDeleteBudget(budget.id)} className="p-1 text-muted-foreground hover:text-destructive">
                    <X size={12} />
                  </button>
                </div>
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-3 animate-fade-in">
                  {/* Budget Items Table */}
                  {budget.items.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="text-left px-2 py-1.5 font-medium">类别</th>
                            <th className="text-left px-2 py-1.5 font-medium">名称</th>
                            <th className="text-right px-2 py-1.5 font-medium">计划</th>
                            <th className="text-right px-2 py-1.5 font-medium">实际</th>
                            <th className="text-right px-2 py-1.5 font-medium">偏差</th>
                          </tr>
                        </thead>
                        <tbody>
                          {budget.items.map((item, idx) => {
                            const dev = item.plannedAmount > 0 ? ((item.actualAmount - item.plannedAmount) / item.plannedAmount * 100) : 0;
                            return (
                              <tr key={idx} className="border-t">
                                <td className="px-2 py-1.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] ${CATEGORY_COLORS[item.category]}`}>
                                    {CATEGORY_LABELS[item.category]}
                                  </span>
                                </td>
                                <td className="px-2 py-1.5">{item.name || '-'}</td>
                                <td className="text-right px-2 py-1.5">¥{item.plannedAmount.toLocaleString()}</td>
                                <td className="text-right px-2 py-1.5">¥{item.actualAmount.toLocaleString()}</td>
                                <td className={`text-right px-2 py-1.5 ${Math.abs(dev) > 20 ? 'text-red-600 font-medium' : Math.abs(dev) > 10 ? 'text-amber-600' : ''}`}>
                                  {dev > 0 ? '+' : ''}{dev.toFixed(1)}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Deviation Bar */}
                  {plannedTotal > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span>预算使用率</span>
                        <span>{Math.min(100, (actualTotal / plannedTotal * 100)).toFixed(0)}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${actualTotal / plannedTotal > 1.2 ? 'bg-red-500' : actualTotal / plannedTotal > 1.1 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, actualTotal / plannedTotal * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Cost Entries */}
                  {budgetCosts.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold mb-1.5">成本记录</div>
                      <div className="space-y-1">
                        {budgetCosts.map(ce => (
                          <div key={ce.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30 text-[11px]">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] ${CATEGORY_COLORS[ce.category]}`}>
                              {CATEGORY_LABELS[ce.category]}
                            </span>
                            <span className="flex-1 truncate">{ce.description}</span>
                            <span className="font-medium">¥{ce.amount.toLocaleString()}</span>
                            {ce.status === 'pending' && (
                              <div className="flex items-center gap-1">
                                <button onClick={() => handleApproveCost(ce)} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded" title="审批">
                                  <CheckCircle size={12} />
                                </button>
                                <button onClick={() => handleRejectCost(ce)} className="p-0.5 text-red-500 hover:bg-red-50 rounded" title="驳回">
                                  <X size={12} />
                                </button>
                              </div>
                            )}
                            {ce.status === 'approved' && <CheckCircle size={12} className="text-emerald-500" />}
                            {ce.status === 'rejected' && <X size={12} className="text-red-400" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create Budget Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => { setShowCreate(false); resetForm(); }} />
          <div className="relative bg-card rounded-xl shadow-xl border w-full max-w-lg animate-slide-up max-h-[85vh] flex flex-col">
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm">创建预算</h3>
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="p-1 rounded hover:bg-muted"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 flex-1 overflow-y-auto space-y-3">
              <div>
                <label className="text-[11px] font-medium block mb-1">预算名称 *</label>
                <input className={inputCls} placeholder="例: 2026 Q2 产品线预算" value={formName} onChange={e => setFormName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium block mb-1">关联项目</label>
                  <SimpleSelect value={formProjectId} onValueChange={setFormProjectId} options={state.projects.map(p => ({ value: p.id, label: p.title }))} placeholder="无" className="w-full h-10 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-medium block mb-1">币种</label>
                  <SimpleSelect value={formCurrency} onValueChange={setFormCurrency} options={[{ value: 'CNY', label: 'CNY (¥)' }, { value: 'USD', label: 'USD ($)' }, { value: 'EUR', label: 'EUR (€)' }]} className="w-full h-10 text-sm" />
                </div>
              </div>

              {/* Budget Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-medium">分项预算</label>
                  <button onClick={addFormItem} className={btnCls}><Plus size={10} /> 添加分项</button>
                </div>
                <div className="space-y-2">
                  {formItems.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-2 p-2 border rounded-lg">
                      <SimpleSelect value={item.category} onValueChange={(v) => updateFormItem(idx, { category: v as BudgetCategory })} options={Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ value: k, label: v }))} className="h-7 text-[10px]" />
                      <input
                        className="flex-1 min-w-0 border rounded px-1.5 py-1 text-[10px]"
                        placeholder="名称"
                        value={item.name}
                        onChange={e => updateFormItem(idx, { name: e.target.value })}
                      />
                      <input
                        type="number"
                        className="w-20 border rounded px-1.5 py-1 text-[10px] text-right"
                        placeholder="金额"
                        value={item.plannedAmount || ''}
                        onChange={e => updateFormItem(idx, { plannedAmount: Number(e.target.value) || 0 })}
                      />
                      <button onClick={() => removeFormItem(idx)} className="text-muted-foreground hover:text-destructive"><X size={12} /></button>
                    </div>
                  ))}
                </div>
                {formItems.length > 0 && (
                  <div className="text-right text-xs font-medium mt-2">
                    合计: {CURRENCY_SYMBOLS[formCurrency] || '¥'}{formItems.reduce((s, it) => s + it.plannedAmount, 0).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <button onClick={() => { setShowCreate(false); resetForm(); }} className={btnCls}>取消</button>
              <button onClick={handleCreateBudget} disabled={!formName.trim()} className={primaryBtnCls}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* Cost Entry Dialog */}
      {showCostEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCostEntry(false)} />
          <div className="relative bg-card rounded-xl shadow-xl border w-full max-w-md animate-slide-up">
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm">录入成本</h3>
              <button onClick={() => setShowCostEntry(false)} className="p-1 rounded hover:bg-muted"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] font-medium block mb-1">关联预算 *</label>
                <SimpleSelect value={selectedBudget || ''} onValueChange={setSelectedBudget} options={budgets.filter(b => b.status === 'active' || b.status === 'approved').map(b => ({ value: b.id, label: b.name }))} placeholder="选择预算" className="w-full h-10 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium block mb-1">类别 *</label>
                  <SimpleSelect value={costCategory} onValueChange={(v) => setCostCategory(v as BudgetCategory)} options={Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ value: k, label: v }))} className="w-full h-10 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-medium block mb-1">金额 *</label>
                  <input type="number" className={inputCls} placeholder="0" value={costAmount} onChange={e => setCostAmount(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium block mb-1">描述 *</label>
                <input className={inputCls} placeholder="成本描述..." value={costDesc} onChange={e => setCostDesc(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium block mb-1">关联项目</label>
                  <SimpleSelect value={costProjectId} onValueChange={setCostProjectId} options={state.projects.map(p => ({ value: p.id, label: p.title }))} placeholder="无" className="w-full h-10 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-medium block mb-1">关联任务</label>
                  <SimpleSelect value={costTaskId} onValueChange={setCostTaskId} options={state.tasks.slice(0, 30).map(t => ({ value: t.id, label: t.title }))} placeholder="无" className="w-full h-10 text-sm" />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <button onClick={() => setShowCostEntry(false)} className={btnCls}>取消</button>
              <button onClick={handleAddCostEntry} disabled={!costAmount || !costDesc.trim()} className={primaryBtnCls}>录入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
