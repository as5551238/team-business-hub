/**
 * 首次运行向导 — 基于 AI 推荐配置的零配置启动体验
 *
 * R8 — App Store Readiness 升级
 * - 品牌视觉：渐变背景 + 品牌色系
 * - 步骤动画：slide-in 过渡
 * - 进度条升级：带标签的步骤指示器
 * - 成功态：应用配置后显示确认动画
 */
import { useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
  PartyPopper,
} from 'lucide-react';

const INDUSTRY_OPTIONS = [
  { value: '科技', label: '科技/互联网', icon: Rocket, desc: '快速迭代、产品交付', color: 'from-blue-500 to-cyan-400' },
  { value: '营销', label: '市场营销', icon: Megaphone, desc: '品牌增长、内容驱动', color: 'from-pink-500 to-rose-400' },
  { value: '工程', label: '项目管理', icon: HardHat, desc: '交付效率、成本控制', color: 'from-amber-500 to-yellow-400' },
  { value: '人力', label: '人力资源', icon: Heart, desc: '招聘优化、员工满意', color: 'from-green-500 to-emerald-400' },
];

const SIZE_OPTIONS = [
  { value: '5', label: '5人以下', desc: '微型团队', icon: '👤' },
  { value: '10', label: '5-15人', desc: '小型团队', icon: '👥' },
  { value: '25', label: '15-50人', desc: '中型团队', icon: '👨‍👩‍👧‍👦' },
  { value: '50', label: '50人以上', desc: '大型团队', icon: '🏢' },
];

const FOCUS_OPTIONS = [
  { value: 'growth', label: '增长优先', desc: '用户增长、收入提升', gradient: 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-200' },
  { value: 'quality', label: '质量优先', desc: '产品品质、客户满意', gradient: 'bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-blue-200' },
  { value: 'efficiency', label: '效率优先', desc: '流程优化、成本控制', gradient: 'bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border-amber-200' },
  { value: 'innovation', label: '创新优先', desc: '技术突破、模式探索', gradient: 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-200' },
];

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const { dispatch } = useStore();
  const [step, setStep] = useState(0);
  const [industry, setIndustry] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [focus, setFocus] = useState('');
  const [config, setConfig] = useState<OnboardingConfig | null>(null);
  const [applied, setApplied] = useState(false);

  const steps = ['选择行业', '团队规模', '核心关注', '确认配置'];

  const handleSkip = useCallback(() => { markOnboarded(); onComplete(); }, [onComplete]);

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
    setApplied(true);
    setTimeout(onComplete, 1500);
  }, [config, dispatch, onComplete]);

  // 成功动画
  if (applied) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-primary/90 to-blue-600/90 backdrop-blur-sm animate-fade-in">
        <div className="text-center animate-slide-up">
          <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-6">
            <PartyPopper size={40} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">配置完成</h2>
          <p className="text-white/80">正在进入您的工作空间...</p>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={true} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 [&>button]:hidden" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader className="brand-gradient px-6 pt-5 pb-4 sr-only">
          <DialogTitle className="text-white">新手引导</DialogTitle>
          <DialogDescription className="text-white/80">配置您的团队业务中台</DialogDescription>
        </DialogHeader>
        {/* 品牌头部 — 视觉可见的渐变头部，与sr-only DialogHeader共存以满足a11y */}
        <div className="brand-gradient px-6 pt-5 pb-4">
          <div className="flex items-center gap-2 text-white/80 text-xs mb-2">
            <Building2 size={12} />
            <span>团队业务中台</span>
          </div>
          {/* 进度条 */}
          <div className="flex items-center gap-1">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-1 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${i <= step ? 'bg-white text-primary scale-110' : 'bg-white/20 text-white/50'}`}>
                  {i < step ? <Check size={14} /> : i + 1}
                </div>
                {i < steps.length - 1 && <div className={`flex-1 h-0.5 rounded transition-all duration-500 ${i < step ? 'bg-white' : 'bg-white/20'}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-5 space-y-4 animate-fade-in" key={step}>
          {/* Step 0: 行业 */}
          {step === 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={20} className="text-primary" />
                <h2 className="text-lg font-bold">欢迎来到团队业务中台</h2>
              </div>
              <p className="text-sm text-muted-foreground">选择您的行业，我们将为您推荐最佳配置方案</p>
              <div className="grid grid-cols-2 gap-3">
                {INDUSTRY_OPTIONS.map(opt => {
                  const OptIcon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setIndustry(opt.value)}
                      className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 hover:shadow-md group ${industry === opt.value ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm' : 'border-border hover:border-primary/30'}`}
                    >
                      {industry === opt.value && (
                        <div className={`absolute top-2 right-2 w-5 h-5 rounded-full bg-gradient-to-r ${opt.color} flex items-center justify-center`}>
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-r ${opt.color} flex items-center justify-center mb-2`}>
                        <OptIcon size={20} className="text-white" />
                      </div>
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</div>
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
              <div className="grid grid-cols-2 gap-3">
                {SIZE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTeamSize(opt.value)}
                    className={`p-4 rounded-xl border-2 text-left transition-all duration-200 hover:shadow-md ${teamSize === opt.value ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm' : 'border-border hover:border-primary/30'}`}
                  >
                    <div className="text-2xl mb-1">{opt.icon}</div>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</div>
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
              <div className="grid grid-cols-2 gap-3">
                {FOCUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFocus(opt.value)}
                    className={`p-4 rounded-xl border-2 text-left transition-all duration-200 hover:shadow-md ${focus === opt.value ? opt.gradient + ' ring-2 shadow-sm' : 'border-border hover:border-primary/30'}`}
                  >
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</div>
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

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {config.suggestedGoals.map((g, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-1 hover:shadow-sm transition-shadow">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{g.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${g.type === 'okr' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>{g.type.toUpperCase()}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${g.priority === 'urgent' ? 'bg-red-50 text-red-600' : g.priority === 'high' ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-500'}`}>{g.priority}</span>
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
          <div className="flex items-center justify-between pt-2 border-t">
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
                onClick={handleSkip}
                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
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
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  下一步
                  <ChevronRight size={14} className="inline ml-1" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleApply}
                  className="px-4 py-2 rounded-lg text-sm font-medium brand-gradient text-white hover:opacity-90 transition-opacity"
                >
                  <Check size={14} className="inline mr-1" />
                  应用配置
                </button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 检查是否需要显示向导 */
export function shouldShowOnboarding(): boolean {
  return !isOnboarded();
}
