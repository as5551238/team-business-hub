import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { ReviewModel, ReviewSession, ReviewActionItem } from '@/types';
import { getReviewModel } from '@/lib/reviewModelRegistry';
import { ChevronRight, ChevronLeft, CheckCircle, Sparkles, X, ListChecks, Plus, Clock, Target } from 'lucide-react';
import { SwotMatrix } from './SwotMatrix';
import { PdcaCycle } from './PdcaCycle';
import { FishboneDiagram } from './FishboneDiagram';
import { FiveWhysChain } from './FiveWhysChain';

interface Props {
  model: ReviewModel;
  onClose: () => void;
  onComplete: (session: ReviewSession) => void;
}

/** Models with dedicated visual renderers */
const MODEL_RENDERERS = new Set(['swot', 'pdca', 'fishbone', '5whys']);

export function ReviewSessionWizard({ model, onClose, onComplete }: Props) {
  const { state, dispatch } = useStore();
  const [currentStep, setCurrentStep] = useState(0);
  const [inputs, setInputs] = useState<Record<string, string | string[]>>({});
  const [isAIFilling, setIsAIFilling] = useState(false);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [actionItems, setActionItems] = useState<ReviewActionItem[]>([]);
  const [newActionText, setNewActionText] = useState('');
  const [view, setView] = useState<'wizard' | 'summary'>('wizard');

  const hasVisualRenderer = MODEL_RENDERERS.has(model.id);
  const totalSteps = model.steps.length;
  const isLastStep = currentStep === totalSteps - 1;
  const step = model.steps[currentStep];
  const stepKey = `step_${step.index}`;

  // For models with visual renderers, gather all inputs at once
  const filledSteps = useMemo(() =>
    model.steps.filter(s => {
      const v = inputs[`step_${s.index}`];
      return v && (Array.isArray(v) ? v.length > 0 : String(v).trim().length > 0);
    }).length,
    [inputs, model.steps]
  );

  function getStepValue(): string | string[] {
    if (step.inputType === 'list') {
      return (inputs[stepKey] as string[]) || [];
    }
    return (inputs[stepKey] as string) || '';
  }

  function setStepValue(value: string | string[]) {
    setInputs(prev => ({ ...prev, [stepKey]: value }));
  }

  function handleListAdd(item: string) {
    if (!item.trim()) return;
    const list = (inputs[stepKey] as string[]) || [];
    setStepValue([...list, item.trim()]);
  }

  function handleListRemove(idx: number) {
    const list = (inputs[stepKey] as string[]) || [];
    setStepValue(list.filter((_, i) => i !== idx));
  }

  async function handleAIFill(targetStepKey?: string) {
    setIsAIFilling(true);
    try {
      const key = targetStepKey || stepKey;
      const suggestions: Record<string, Record<string, string | string[]>> = {
        swot: { step_1: ['团队执行力强', '产品认知度高'], step_2: ['资源有限', '市场推广不足'], step_3: ['市场需求增长', '竞品出现空档'], step_4: ['新竞品进入', '政策不确定性'] },
        grai: { step_1: '基于OKR数据回看原始目标...', step_2: '根据关键结果评估达成情况...', step_3: '分析主客观原因...', step_4: '提炼规律与经验...' },
        pdca: { step_1: '回顾迭代计划...', step_3: '基于数据检查偏差...' },
        aar: { step_1: '回顾项目原始目标...', step_2: '梳理实际执行的事实...' },
        okr_scoring: { step_1: '按KR分析达成数据并评分...' },
        bsc: { step_1: '财务维度：成本控制基本达标，ROI符合预期...' },
        kpt: { step_1: ['按时交付关键功能', '团队协作顺畅'], step_2: ['部分需求变更频繁', '测试覆盖不够'], step_3: ['引入需求变更流程', '增加自动化测试'] },
      };
      const modelSuggestions = suggestions[model.id];
      if (modelSuggestions && modelSuggestions[key]) {
        setInputs(prev => ({ ...prev, [key]: modelSuggestions[key] }));
      } else {
        const targetStep = model.steps.find(s => `step_${s.index}` === key);
        setInputs(prev => ({ ...prev, [key]: targetStep?.inputType === 'list' ? ['等待AI分析...'] : `AI将基于历史数据分析${targetStep?.title || ''}...` }));
      }
    } finally {
      setIsAIFilling(false);
    }
  }

  function addActionItem() {
    if (!newActionText.trim()) return;
    setActionItems(prev => [...prev, {
      id: `ai-${Date.now()}-${prev.length}`,
      content: newActionText.trim(),
      assigneeId: null,
      dueDate: null,
      linkedTaskId: null,
      status: 'pending',
      verifiedAt: null,
    }]);
    setNewActionText('');
  }

  function removeActionItem(id: string) {
    setActionItems(prev => prev.filter(a => a.id !== id));
  }

  function handleComplete() {
    setView('summary');
  }

  function handleFinalSubmit() {
    const session: ReviewSession = {
      id: `rs-${Date.now()}`,
      modelId: model.id,
      seasonId: null,
      goalId: null,
      projectId: null,
      memberId: state.currentUser?.id || null,
      teamId: state.currentTeamId || '__default__',
      status: 'completed',
      inputs,
      aiInsights,
      actionItems,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_REVIEW_SESSION', payload: session });
    onComplete(session);
  }

  function handleNext() {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  }

  function handlePrev() {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  }

  const [listInput, setListInput] = useState('');

  // Summary view
  if (view === 'summary') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-card rounded-xl shadow-xl border w-full max-w-2xl animate-slide-up max-h-[90vh] flex flex-col">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">{model.name} — 复盘总结</h3>
              <p className="text-[11px] text-muted-foreground">确认行动项后完成复盘</p>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="关闭"><X size={16} /></button>
          </div>

          <div className="px-5 py-4 flex-1 overflow-y-auto space-y-4">
            {/* Inputs Summary */}
            <div className="space-y-2">
              {model.steps.map(s => {
                const key = `step_${s.index}`;
                const v = inputs[key];
                if (!v || (Array.isArray(v) ? v.length === 0 : !String(v).trim())) return null;
                return (
                  <div key={key} className="border rounded-lg p-3">
                    <div className="text-[11px] font-semibold text-muted-foreground mb-1">{s.title}</div>
                    {Array.isArray(v) ? (
                      <div className="flex flex-wrap gap-1">
                        {v.map((item, i) => <span key={i} className="px-2 py-0.5 rounded bg-muted text-[11px]">{item}</span>)}
                      </div>
                    ) : (
                      <p className="text-xs whitespace-pre-wrap">{String(v)}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* AI Insights */}
            {aiInsights && (
              <div className="border border-primary/20 rounded-lg p-3 bg-primary/5">
                <div className="flex items-center gap-1 mb-1">
                  <Sparkles size={12} className="text-primary" />
                  <span className="text-[11px] font-semibold text-primary">AI洞察</span>
                </div>
                <p className="text-xs whitespace-pre-wrap">{aiInsights}</p>
              </div>
            )}

            {/* Action Items */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ListChecks size={14} />
                <span className="text-xs font-semibold">行动项 ({actionItems.length})</span>
              </div>
              <div className="space-y-1.5 mb-2">
                {actionItems.map(item => (
                  <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/40 text-xs">
                    <Target size={10} className="text-primary shrink-0" />
                    <span className="flex-1">{item.content}</span>
                    <button onClick={() => removeActionItem(item.id)} className="text-muted-foreground hover:text-destructive">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-input rounded px-2 py-1.5 text-xs"
                  placeholder="添加行动项..."
                  value={newActionText}
                  onChange={e => setNewActionText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addActionItem(); }}
                />
                <button
                  onClick={addActionItem}
                  className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                  添加
                </button>
              </div>
            </div>
          </div>

          <div className="px-5 py-3 border-t flex items-center justify-between">
            <button
              onClick={() => setView('wizard')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted"
            >
              <ChevronLeft size={12} /> 返回编辑
            </button>
            <button
              onClick={handleFinalSubmit}
              className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              <CheckCircle size={12} /> 确认完成复盘
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-card rounded-xl shadow-xl border w-full animate-slide-up max-h-[90vh] flex flex-col ${hasVisualRenderer ? 'max-w-2xl' : 'max-w-lg'}`}>
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">{model.name}</h3>
            <p className="text-[11px] text-muted-foreground">
              {hasVisualRenderer
                ? `已填写 ${filledSteps}/${totalSteps} 步`
                : `步骤 ${currentStep + 1}/${totalSteps}`
              }
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted" aria-label="关闭"><X size={16} /></button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div className="h-full bg-primary transition-all" style={{ width: `${((filledSteps + (hasVisualRenderer ? 0 : currentStep)) / totalSteps) * 100}%` }} />
        </div>

        {/* Step content */}
        <div className="px-5 py-4 flex-1 overflow-y-auto space-y-3">
          {/* Model-specific visual renderers */}
          {hasVisualRenderer && model.id === 'swot' && (
            <SwotMatrix value={inputs} onChange={setInputs} onAIFill={handleAIFill} isAIFilling={isAIFilling} />
          )}
          {hasVisualRenderer && model.id === 'pdca' && (
            <PdcaCycle value={inputs} onChange={setInputs} onAIFill={handleAIFill} isAIFilling={isAIFilling} />
          )}
          {hasVisualRenderer && model.id === 'fishbone' && (
            <FishboneDiagram value={inputs} onChange={setInputs} />
          )}
          {hasVisualRenderer && model.id === '5whys' && (
            <FiveWhysChain value={inputs} onChange={setInputs} />
          )}

          {/* Default step-by-step for models without visual renderers */}
          {!hasVisualRenderer && (
            <>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  {step.index}
                </span>
                <h4 className="font-medium text-sm">{step.title}</h4>
                {step.aiAutoFill && (
                  <button
                    onClick={() => handleAIFill()}
                    disabled={isAIFilling}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                  >
                    <Sparkles size={10} /> {isAIFilling ? 'AI分析中...' : 'AI填充'}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{step.description}</p>

              {step.inputType === 'text' && (
                <textarea
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm min-h-[120px] resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder={step.placeholder || '请输入...'}
                  value={getStepValue() as string}
                  onChange={e => setStepValue(e.target.value)}
                />
              )}

              {step.inputType === 'list' && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 border border-input rounded px-2 py-1.5 text-sm"
                      placeholder={step.placeholder || '添加项目...'}
                      value={listInput}
                      onChange={e => setListInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { handleListAdd(listInput); setListInput(''); } }}
                    />
                    <button
                      onClick={() => { handleListAdd(listInput); setListInput(''); }}
                      className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90"
                    >
                      添加
                    </button>
                  </div>
                  <div className="space-y-1">
                    {((getStepValue() as string[]) || []).map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/40 text-xs">
                        <span className="flex-1">{item}</span>
                        <button onClick={() => handleListRemove(idx)} className="text-muted-foreground hover:text-destructive">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {step.inputType === 'select' && step.inputOptions && (
                <div className="space-y-1">
                  {step.inputOptions.map(opt => (
                    <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs">
                      <input
                        type="radio"
                        name={stepKey}
                        checked={getStepValue() === opt}
                        onChange={() => setStepValue(opt)}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Action Items (always available) */}
          {actionItems.length > 0 && (
            <div className="border-t pt-3 mt-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ListChecks size={12} className="text-primary" />
                <span className="text-[11px] font-semibold">行动项 ({actionItems.length})</span>
              </div>
              {actionItems.map(item => (
                <div key={item.id} className="flex items-center gap-2 px-2 py-1 rounded bg-muted/30 text-[11px] mb-0.5">
                  <Target size={10} className="text-primary shrink-0" />
                  <span className="flex-1">{item.content}</span>
                  <button onClick={() => removeActionItem(item.id)} className="text-muted-foreground hover:text-destructive"><X size={10} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!hasVisualRenderer && (
              <button
                onClick={handlePrev}
                disabled={currentStep === 0}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted disabled:opacity-30"
              >
                <ChevronLeft size={12} /> 上一步
              </button>
            )}
            {/* Quick add action item */}
            <div className="flex items-center gap-1">
              <input
                className="w-32 border border-input rounded px-2 py-1 text-[10px]"
                placeholder="添加行动项..."
                value={newActionText}
                onChange={e => setNewActionText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addActionItem(); }}
              />
              <button onClick={addActionItem} className="p-1 rounded hover:bg-muted"><Plus size={12} /></button>
            </div>
          </div>
          <button
            onClick={handleNext}
            className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            {isLastStep || hasVisualRenderer ? <><CheckCircle size={12} /> 完成复盘</> : <>{'下一步'} <ChevronRight size={12} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
