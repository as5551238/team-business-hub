/**
 * 首次运行向导 — 基于 AI 推荐配置的零配置启动体验
 *
 * Round 5 — 接入 onboardingAI，从孤立代码变为可交互向导
 * - 三步引导：行业 → 团队规模 → 核心关注
 * - 自动推荐目标结构、看板配置
 * - 一键应用模板配置
 */
import { useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import {
  isOnboarded,
  markOnboarded,
  recommendConfig,
  INDUSTRY_TEMPLATES,
  type OnboardingConfig,
  type IndustryTemplate,
} from '@/lib/onboardingAI';
import {
  Rocket,
  Building2,
  Users,
  Target,
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkles,
  Briefcase,
  Megaphone,
  HardHat,
  Heart,
} from 'lucide-react';

const INDUSTRY_OPTIONS = [
  { value: '科技', label: '科技/互联网', icon: Rocket, desc: '快速迭代、产品交付' },
  { value: '营销', label: '市场营销', icon: Megaphone, desc: '品牌增长、内容驱动' },
  { value: '工程', label: '项目管理', icon: HardHat, desc: '交付效率、成本控制' },
  { value: '人力', label: '人力资源', icon: Heart, desc: '招聘优化、员工满意' },
];

const SIZE_OPTIONS = [
  { value: '5', label: '5人以下', desc: '微型团队' },
  { value: '10', label: '5-15人', desc: '小型团队' },
  { value: '25', label: '15-50人', desc: '中型团队' },
  { value: '50', label: '50人以上', desc: '大型团队' },
];

const FOCUS_OPTIONS = [
  { value: 'growth', label: '增长优先', desc: '用户增长、收入提升' },
  { value: 'quality', label: '质量优先', desc: '产品品质、客户满意' },
  { value: 'efficiency', label: '效率优先', desc: '流程优化、成本控制' },
  { value: 'innovation', label: '创新优先', desc: '技术突破、模式探索' },
];

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const { dispatch } = useStore();
  const [step, setStep] = useState(0);
  const [industry, setIndustry] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [focus, setFocus] = useState('');
  const [config, setConfig] = useState<OnboardingConfig | null>(null);

  const steps = ['选择行业', '团队规模', '核心关注', '确认配置'];

  const handleNext = useCallback(() => {
    if (step === 2 && industry && teamSize && focus) {
      const cfg = recommendConfig(industry, teamSize, focus);
      setConfig(cfg);
      setStep(3);
    } else if (step < 2) {
      setStep(step + 1);
    }
  }, [step, industry, teamSize, focus]);

  const handleBack = useCallback(() => {
    if (step > 0) setStep(step - 1);
  }, [step]);

  const handleApply = useCallback(() => {
    if (!config) return;
    // 应用模板：创建推荐的目标
    for (const g of config.suggestedGoals) {
      dispatch({
        type: 'ADD_GOAL',
        payload: {
          title: g.title,
          description: `${config.template.name}模板推荐目标`,
          type: g.type,
          priority: g.priority as 'urgent' | 'high' | 'medium' | 'low',
          status: 'todo',
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
          keyResults: g.krs.map((kr, i) => ({
            id: `kr-${Date.now()}-${i}`,
            title: kr.title,
            track: kr.track as 'okr' | 'kpi' | 'both',
            targetValue: kr.targetValue,
            currentValue: 0,
          })),
          tags: [],
          category: config.industry,
        },
      });
    }
    markOnboarded();
    onComplete();
  }, [config, dispatch, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* 进度条 */}
        <div className="flex items-center gap-1 px-6 pt-5 pb-3">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${i <= step ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 rounded transition-colors ${i < step ? 'bg-primary' : 'bg-gray-100'}`} />}
            </div>
          ))}
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Step 0: 行业 */}
          {step === 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={20} className="text-primary" />
                <h2 className="text-lg font-bold">欢迎来到团队业务中台</h2>
              </div>
              <p className="text-sm text-muted-foreground">选择您的行业，我们将为您推荐最佳配置方案</p>
              <div className="grid grid-cols-2 gap-2">
                {INDUSTRY_OPTIONS.map(opt => {
                  const OptIcon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setIndustry(opt.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${industry === opt.value ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-gray-100 hover:border-gray-200'}`}
                    >
                      <OptIcon size={20} className={industry === opt.value ? 'text-primary' : 'text-gray-400'} />
                      <div className="text-sm font-medium mt-1.5">{opt.label}</div>
                      <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 1: 团队规模 */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Users size={20} className="text-primary" />
                <h2 className="text-lg font-bold">您的团队规模</h2>
              </div>
              <p className="text-sm text-muted-foreground">这将影响权限模型和流程复杂度推荐</p>
              <div className="grid grid-cols-2 gap-2">
                {SIZE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTeamSize(opt.value)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${teamSize === opt.value ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-gray-100 hover:border-gray-200'}`}
                  >
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: 核心关注 */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Target size={20} className="text-primary" />
                <h2 className="text-lg font-bold">核心关注方向</h2>
              </div>
              <p className="text-sm text-muted-foreground">我们将据此调整目标优先级和看板配置</p>
              <div className="grid grid-cols-2 gap-2">
                {FOCUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFocus(opt.value)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${focus === opt.value ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-gray-100 hover:border-gray-200'}`}
                  >
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: 确认配置 */}
          {step === 3 && config && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Briefcase size={20} className="text-primary" />
                <h2 className="text-lg font-bold">推荐配置方案</h2>
              </div>
              <p className="text-sm text-muted-foreground">{config.template.name} — {config.template.description}</p>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground">推荐目标</div>
                {config.suggestedGoals.map((g, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{g.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${g.type === 'okr' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>{g.type.toUpperCase()}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${g.priority === 'urgent' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{g.priority}</span>
                    </div>
                    <div className="space-y-0.5 ml-2">
                      {g.krs.map((kr, j) => (
                        <div key={j} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${kr.track === 'okr' ? 'bg-blue-400' : kr.track === 'kpi' ? 'bg-green-400' : 'bg-purple-400'}`} />
                          {kr.title}（目标: {kr.targetValue}）
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground">推荐任务分类</div>
                <div className="flex flex-wrap gap-1.5">
                  {config.suggestedCategories.map(c => (
                    <span key={c} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/5 text-primary border border-primary/20">{c}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 导航按钮 */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleBack}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${step === 0 ? 'invisible' : 'hover:bg-muted'}`}
            >
              <ChevronLeft size={14} className="inline mr-1" />
              上一步
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { markOnboarded(); onComplete(); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                跳过
              </button>
              {step < 3 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={
                    (step === 0 && !industry) ||
                    (step === 1 && !teamSize) ||
                    (step === 2 && !focus)
                  }
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  下一步
                  <ChevronRight size={14} className="inline ml-1" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleApply}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90"
                >
                  <Check size={14} className="inline mr-1" />
                  应用配置
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 检查是否需要显示向导 */
export function shouldShowOnboarding(): boolean {
  return !isOnboarded();
}
