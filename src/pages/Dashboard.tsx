/**
 * 工作台 — 6 Tab 布局
 * Tab: 我的今日 / 业务现况 / 风险智能 / 后续计划 / 甘特图 / 其他
 * 非管理员默认"我的今日"，管理员/经理默认"业务现况"
 */
import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { useStore } from '@/store/useStore';
import { useViewingMember } from '@/store/hooks';
import { ItemDetailPanel } from '@/components/ItemDetailPanel';
import { GanttModal } from '@/components/GanttModal';
import { TabErrorBoundary, TabLoader } from '@/components/TabErrorBoundary';
import ViewModeSwitch from '@/components/ViewModeSwitch';
import { TrendingUp, AlertTriangle, Calendar, BarChart3, Settings, CheckCircle2, X, Rocket, UserPlus, Sparkles, Target, Zap, ListTodo, Sun } from 'lucide-react';

// ── 懒加载 Tab 组件 ──
const MyTodayTab = lazy(() => import('./dashboard/MyTodayTab'));
const BusinessTab = lazy(() => import('./dashboard/BusinessTab'));
const RiskAITab = lazy(() => import('./dashboard/RiskAITab'));
const PlansTab = lazy(() => import('./dashboard/PlansTab'));
const GanttTab = lazy(() => import('./dashboard/GanttTab'));
const OtherTab = lazy(() => import('./dashboard/OtherTab'));

// ── Tab 类型 & 配置 ──
type DashboardTab = 'myToday' | 'business' | 'riskAI' | 'plans' | 'gantt' | 'other';

const tabItems: { key: DashboardTab; label: string; icon: typeof TrendingUp }[] = [
  { key: 'myToday', label: '我的今日', icon: Sun },
  { key: 'business', label: '业务现况', icon: TrendingUp },
  { key: 'riskAI', label: '风险智能', icon: AlertTriangle },
  { key: 'plans', label: '后续计划', icon: Calendar },
  { key: 'gantt', label: '甘特图', icon: BarChart3 },
  { key: 'other', label: '其他', icon: Settings },
];

const TAB_LABELS: Record<DashboardTab, string> = {
  myToday: '我的今日', business: '业务现况', riskAI: '风险智能', plans: '后续计划', gantt: '甘特图', other: '其他',
};

// ── 新手引导模板 ──
const ONBOARDING_TEMPLATES = [
  { id: 'okr', label: 'OKR 目标管理', desc: '按季度设定目标与关键结果，追踪团队对齐', icon: <Target size={20} className="text-blue-600" />, bgColor: 'bg-blue-50' },
  { id: 'agile', label: '敏捷项目迭代', desc: 'Sprint冲刺+看板，快速响应变化', icon: <Zap size={20} className="text-amber-600" />, bgColor: 'bg-amber-50' },
  { id: 'simple', label: '轻量任务看板', desc: '简单任务列表，适合小团队快速上手', icon: <ListTodo size={20} className="text-emerald-600" />, bgColor: 'bg-emerald-50' },
];

// ── 主组件 ──
interface DashboardProps {
  onPageChange: (page: string) => void;
}

export default function Dashboard({ onPageChange }: DashboardProps) {
  const { state, dispatch } = useStore();
  const { isTeamView, viewingMember } = useViewingMember();

  // 非管理员默认"我的今日"，管理员/经理默认"业务现况"
  const userRole = state.currentUser?.role;
  const defaultTab: DashboardTab = (userRole === 'admin' || userRole === 'manager' || userRole === 'leader') ? 'business' : 'myToday';
  const [tab, setTab] = useState<DashboardTab>(defaultTab);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<'goal' | 'project' | 'task' | null>(null);
  const [ganttModalOpen, setGanttModalOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try { return localStorage.getItem('tbh-onboarding-done') === '1'; } catch { return false; }
  });

  const isNewUser = !onboardingDismissed && state.goals.length === 0 && state.projects.length === 0 && state.tasks.length === 0;

  function dismissOnboarding() {
    setOnboardingDismissed(true);
    try { localStorage.setItem('tbh-onboarding-done', '1'); } catch {}
  }

  const openDetail = useCallback((id: string, type: 'goal' | 'project' | 'task') => {
    setSelectedItemId(id);
    setSelectedItemType(type);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedItemId(null);
    setSelectedItemType(null);
  }, []);

  const openGantt = useCallback(() => setGanttModalOpen(true), []);

  // 共享回调：每个 Tab 都需要的 3 个函数
  const tabCallbacks = { onOpenDetail: openDetail, onOpenGantt: openGantt, onPageChange };

  // Ctrl+G 全局打开甘特图
  useEffect(() => {
    const handler = () => setGanttModalOpen(true);
    window.addEventListener('tbh-open-gantt', handler);
    return () => window.removeEventListener('tbh-open-gantt', handler);
  }, []);

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* 标题行 — 固定不滚动 */}
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6 pb-2">
        <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          {!isTeamView && viewingMember ? (
            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 sm:px-5 py-2.5 sm:py-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">{viewingMember.avatar}</div>
              <div className="min-w-0">
                <span className="text-sm font-medium">{viewingMember.name}</span>
                <span className="text-sm text-muted-foreground ml-1">的个人工作台</span>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-xl font-bold">工作台</h1>
              <p className="text-sm text-muted-foreground mt-0.5">一站式总览业务现况与待办事项</p>
            </div>
          )}
        </div>
      </div>
      </div>

      <div className="flex-shrink-0 px-4 md:px-6 pb-2">
        <ViewModeSwitch items={tabItems.map(t => ({ value: t.key, label: t.label, icon: t.icon }))} value={tab} onChange={v => setTab(v as DashboardTab)} size="sm" />
      </div>

      {/* 可滚动内容区域 — 移动端额外底部留白避免被底栏遮挡 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 pb-20 md:pb-4">
      {/* 新手引导 OR Tab 内容 */}
      {isNewUser ? (
        <div className="bg-gradient-to-br from-primary/5 via-white to-primary/10 rounded-2xl border border-primary/20 shadow-sm p-6 md:p-8 space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Rocket size={20} className="text-primary" /></div>
              <div>
                <h2 className="text-lg font-bold">欢迎使用团队业务中台</h2>
                <p className="text-xs text-muted-foreground mt-0.5">3步快速启动你的事项管理</p>
              </div>
            </div>
            <button onClick={dismissOnboarding} className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1"><X size={18} /></button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${state.goals.length > 0 ? 'bg-green-100 text-green-700' : 'bg-primary text-primary-foreground'}`}>{state.goals.length > 0 ? <CheckCircle2 size={14} /> : '1'}</span>
              选择场景模板，快速开始
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {ONBOARDING_TEMPLATES.map(t => (
                <button key={t.id} onClick={() => {
                  if (t.id === 'okr') {
                    dispatch({ type: 'ADD_GOAL', payload: { title: 'Q1 核心目标', description: '本季度最重要的目标', priority: 'high', status: 'in_progress', leaderId: state.currentUser?.id || '', supporterIds: [], tags: ['OKR'], keyResults: [{ title: '关键结果1', targetValue: 100, currentValue: 0 }, { title: '关键结果2', targetValue: 100, currentValue: 0 }], startDate: new Date().toISOString().split('T')[0], endDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0] } });
                  } else if (t.id === 'agile') {
                    dispatch({ type: 'ADD_PROJECT', payload: { title: '首个冲刺项目', description: '敏捷迭代项目', priority: 'medium', status: 'in_progress', leaderId: state.currentUser?.id || '', supporterIds: [], tags: ['敏捷'], startDate: new Date().toISOString().split('T')[0], endDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0] } });
                  } else {
                    dispatch({ type: 'ADD_TASK', payload: { title: '第一个任务', description: '从简单任务开始', priority: 'medium', status: 'todo', leaderId: state.currentUser?.id || '', supporterIds: [], tags: [], category: '', subtasks: [], attachments: [], trackingRecords: [], repeatCycle: 'none', blockedBy: [], dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0], startDate: new Date().toISOString().split('T')[0] } });
                  }
                  dismissOnboarding();
                }} className="flex flex-col items-start gap-2 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left group">
                  <div className={`w-10 h-10 rounded-xl ${t.bgColor} flex items-center justify-center`}>{t.icon}</div>
                  <div>
                    <span className="text-sm font-medium group-hover:text-primary transition-colors">{t.label}</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${state.goals.length > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{state.goals.length > 0 ? <CheckCircle2 size={14} /> : '2'}</span>
              创建你的第一个目标
              {state.goals.length > 0 && <span className="text-[11px] text-green-600 font-normal ml-1">已完成</span>}
            </div>
            <p className="text-xs text-muted-foreground pl-8">目标驱动：先定义目标，再拆解项目和任务，确保所有工作都围绕核心目标展开</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${state.members.length > 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{state.members.length > 1 ? <CheckCircle2 size={14} /> : '3'}</span>
              邀请团队成员协作
              {state.members.length > 1 && <span className="text-[11px] text-green-600 font-normal ml-1">已完成</span>}
            </div>
            <div className="pl-8 flex items-center gap-3">
              <p className="text-xs text-muted-foreground">分享邀请码让伙伴加入，实现团队事项协同</p>
              {state.teams[0]?.inviteCode && (
                <button onClick={() => onPageChange('admin')} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors">
                  <UserPlus size={12} /> 去邀请
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-primary/10">
            <Sparkles size={14} className="text-primary/50" />
            <p className="text-[11px] text-muted-foreground">小贴士：按 Ctrl+K 可随时打开命令面板快速操作</p>
          </div>
        </div>
      ) : (
        <div key={tab} className="animate-fade-in">
          {tab === 'myToday' && <TabErrorBoundary key="myToday" name={TAB_LABELS.myToday}><Suspense fallback={<TabLoader />}><MyTodayTab onOpenDetail={openDetail} onPageChange={onPageChange} /></Suspense></TabErrorBoundary>}
          {tab === 'business' && <TabErrorBoundary key="business" name={TAB_LABELS.business}><Suspense fallback={<TabLoader />}><BusinessTab {...tabCallbacks} /></Suspense></TabErrorBoundary>}
          {tab === 'riskAI' && <TabErrorBoundary key="riskAI" name={TAB_LABELS.riskAI}><Suspense fallback={<TabLoader />}><RiskAITab {...tabCallbacks} /></Suspense></TabErrorBoundary>}
          {tab === 'plans' && <TabErrorBoundary key="plans" name={TAB_LABELS.plans}><Suspense fallback={<TabLoader />}><PlansTab {...tabCallbacks} /></Suspense></TabErrorBoundary>}
          {tab === 'gantt' && <TabErrorBoundary key="gantt" name={TAB_LABELS.gantt}><Suspense fallback={<TabLoader />}><GanttTab {...tabCallbacks} /></Suspense></TabErrorBoundary>}
          {tab === 'other' && <TabErrorBoundary key="other" name={TAB_LABELS.other}><Suspense fallback={<TabLoader />}><OtherTab {...tabCallbacks} /></Suspense></TabErrorBoundary>}
        </div>
      )}

      </div>{/* end scrollable content area */}

      {/* 全局浮层：详情面板 + 甘特图弹窗 */}
      {selectedItemId && selectedItemType && (
        <ItemDetailPanel isOpen={true} onClose={closeDetail} itemId={selectedItemId} itemType={selectedItemType} />
      )}
      <GanttModal open={ganttModalOpen} onClose={() => setGanttModalOpen(false)} />
    </div>
  );
}
