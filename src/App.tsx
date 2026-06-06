import { useState, useEffect, useRef, lazy, Suspense, Component, useMemo, type ReactNode, type ErrorInfo } from 'react';
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { DegradedBanner } from '@/components/DegradedMode';
import { FeatureFlagProvider } from '@/lib/featureFlags';
import { handleError } from '@/lib/errorHandler';
import { startAiPushScan, stopAiPushScan } from '@/lib/pushEventEngine';
import { startAutomaton, stopAutomaton } from '@/lib/ai/aiAutomaton';
import { getPageFromPathname } from '@/lib/routes';
import type { Page } from '@/components/layout/Layout';
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Goals = lazy(() => import('@/pages/Goals'));
const Projects = lazy(() => import('@/pages/Projects'));
const Tasks = lazy(() => import('@/pages/Tasks'));
const Insight = lazy(() => import('@/pages/Insight'));
const Knowledge = lazy(() => import('@/pages/Knowledge'));
const Admin = lazy(() => import('@/pages/Admin'));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })));
const ConsentDialog = lazy(() => import('@/pages/PrivacyPage').then(m => ({ default: m.ConsentDialog })));
const LoginScreen = lazy(() => import('@/pages/Login').then(m => ({ default: m.LoginScreen })));
import { StoreProvider, useStore } from '@/store/useStore';
import type { Action } from '@/store/types';
import { MotionConfig } from 'framer-motion';
import { RefreshCw } from 'lucide-react';

// Per-page ErrorBoundary - one page crash won't take down others
class PageErrorBoundary extends Component<{ children: ReactNode; name: string }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    import('@/lib/sentry').then(m => m.captureException?.(error, { componentStack: info.componentStack })).catch(() => {});
  }
  render() {
    if (this.state.hasError) {
      return <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-6"><div className="text-3xl">⚠️</div><div className="text-sm font-medium">{this.props.name} 页面加载出错</div><div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 max-w-lg text-center break-all">{this.state.error?.message || '未知错误'}</div><button onClick={() => { this.setState({ hasError: false, error: null }); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted"><RefreshCw size={14} /> 重试</button></div>;
    }
    return this.props.children;
  }
}

// Page type is exported from Layout.tsx for shared use

const LOGIN_KEY = 'tbh-current-user';

const PAGE_LABELS: Record<Page, string> = { dashboard: '工作台', goals: '目标管理', projects: '项目中心', tasks: '任务中心', insight: '数据洞察', ai: 'AI 分析', knowledge: '知识库', admin: '管理中心' };

/** Helper: redirect root/unknown routes to dashboard */
function NavigateToDashboard() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/dashboard', { replace: true }); }, [navigate]);
  return null;
}

function navLabel(p: Page) { return PAGE_LABELS[p] || p; }

function AppInner({ loggedIn }: { loggedIn: string }) {
  const { state, dispatch } = useStore();
  const stateRef = useRef(state);
  stateRef.current = state;

  const location = useLocation();
  const currentPage = useMemo(() => getPageFromPathname(location.pathname), [location.pathname]);

  const [showConsent, setShowConsent] = useState(() => {
    try { return !localStorage.getItem('tbh-privacy-consented'); } catch (e) { handleError(e, { module: 'App', operation: 'CHECK_PRIVACY_CONSENT', severity: 'debug' }); return true; }
  });

  // Start AI proactive push scan + Automaton once on login
  useEffect(() => {
    startAiPushScan(
      () => stateRef.current.tasks,
      () => stateRef.current.goals,
      () => stateRef.current.currentUser?.id ?? null,
    );
    // Automaton uses the dispatch bridge injected by StoreProvider via setAsyncDispatch
    startAutomaton(
      () => stateRef.current,
      (action: Action) => { try { dispatch(action); } catch (e) { handleError(e, { module: 'App', operation: 'AUTOMATON_DISPATCH', severity: 'warn' }); } },
    );
    return () => { stopAiPushScan(); stopAutomaton(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  // Admin/manager default to team view (viewingMemberId = null), set during login
  // Member users default to personal view (viewingMemberId = own ID), set during login

  const currentUser = useMemo(() => state.members.find(m => m.id === loggedIn), [state.members, loggedIn]);

    return (
    <>
      <DegradedBanner />
      {showConsent && (
        <Suspense fallback={null}>
          <ConsentDialog
            onAccept={() => setShowConsent(false)}
            onDecline={() => {
              setShowConsent(false);
              // Decline: still allow basic use but log
              console.warn('[Privacy] User declined privacy consent');
            }}
          />
        </Suspense>
      )}
      <Layout currentUser={currentUser}>
        <Suspense fallback={<div className="flex items-center justify-center h-64 text-muted-foreground text-sm">加载中...</div>}>
          <PageErrorBoundary key={currentPage} name={navLabel(currentPage)}>
            <Routes>
              <Route path="/" element={<NavigateToDashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/goals/:itemId" element={<Goals />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:itemId" element={<Projects />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/tasks/:itemId" element={<Tasks />} />
              <Route path="/insight" element={<Insight />} />
              <Route path="/knowledge" element={<Knowledge />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="*" element={<NavigateToDashboard />} />
            </Routes>
          </PageErrorBoundary>
        </Suspense>
      </Layout>
    </>
  );
}

function App() {
  // Initialize Sentry on first load (prod only)
  useEffect(() => { if (import.meta.env.PROD) { import('@/lib/sentry').then(m => m.initSentry()).catch(() => {}); } }, []);

  // Force SW update: detect new version and reload to bust stale PWA cache
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onControllerChange = () => {
      // New SW has taken control — reload to use fresh code
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    // Also: if there's a waiting SW, force it to activate immediately
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg?.waiting) { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); }
    });
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  // D7: Deep link — handle NAVIGATE messages from SW (notificationclick)
  // Now uses react-router: navigate to /tasks/:itemId style URLs
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        const url = event.data.url;
        // Convert SW URL to react-router hash URL: /task/xxx -> #/tasks/xxx
        const page = url.includes('/goal') ? 'goals' : url.includes('/project') ? 'projects' : url.includes('/task') ? 'tasks' : null;
        if (page) {
          const itemId = url.split('/').pop();
          if (itemId) {
            window.location.hash = `#/${page}/${itemId}`;
          } else {
            window.location.hash = `#/${page}`;
          }
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <StoreProvider>
        <HashRouter>
          <AppShell />
        </HashRouter>
      </StoreProvider>
    </MotionConfig>
  );
}

/** Wrapper inside StoreProvider: handles login state + localStorage migration + store sync */
function AppShell() {
  // Migrate old localStorage key
  useEffect(() => {
    try {
      const oldId = localStorage.getItem('tbh-current-user-id');
      if (oldId && !localStorage.getItem(LOGIN_KEY)) {
        localStorage.setItem(LOGIN_KEY, oldId);
      }
      localStorage.removeItem('tbh-current-user-id');
    } catch (e) { handleError(e, { module: 'App', operation: 'LOCALSTORAGE_MIGRATION', severity: 'debug' }); }
  }, []);

  const { state: appState } = useStore();
  const currentUserId = appState.currentUser?.id || null;
  const [loggedIn, setLoggedIn] = useState<string | null>(() => { try { return localStorage.getItem(LOGIN_KEY); } catch (e) { handleError(e, { module: 'App', operation: 'RESTORE_LOGGED_IN', severity: 'debug' }); return null; } });

  // Sync loggedIn with store: when currentUser changes (e.g. logout, or switching users), update localStorage + loggedIn
  useEffect(() => {
    if (currentUserId) {
      try { localStorage.setItem(LOGIN_KEY, currentUserId); } catch (e) { handleError(e, { module: 'App', operation: 'SAVE_LOGIN_KEY', severity: 'debug' }); }
    } else {
      try { localStorage.removeItem(LOGIN_KEY); } catch (e) { handleError(e, { module: 'App', operation: 'REMOVE_LOGIN_KEY', severity: 'debug' }); }
    }
    setLoggedIn(currentUserId);
  }, [currentUserId]);

  return loggedIn ? (
    <FeatureFlagProvider teamId={appState.currentTeamId}>
      <AppInner loggedIn={loggedIn} />
    </FeatureFlagProvider>
  ) : (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-muted-foreground text-sm">加载登录页...</div>}>
      <LoginScreen onLogin={(id) => setLoggedIn(id)} />
    </Suspense>
  );
}

export default App;
