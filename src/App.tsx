import { useState, useEffect, lazy, Suspense, Component, useMemo, type ReactNode, type ErrorInfo } from 'react';
import Layout from '@/components/layout/Layout';
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Goals = lazy(() => import('@/pages/Goals'));
const Projects = lazy(() => import('@/pages/Projects'));
const Tasks = lazy(() => import('@/pages/Tasks'));
const Insight = lazy(() => import('@/pages/Insight'));
const Admin = lazy(() => import('@/pages/Admin'));
import { StoreProvider, useStore } from '@/store/useStore';
import { UserPlus, LogIn, Phone, MessageCircle, Mail, ArrowRight, Search, RefreshCw } from 'lucide-react';

// Per-page ErrorBoundary - one page crash won't take down others
class PageErrorBoundary extends Component<{ children: ReactNode; name: string }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(`[PageErrorBoundary] ${this.props.name}:`, error.message, '\n', info.componentStack); }
  render() {
    if (this.state.hasError) {
      return <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-6"><div className="text-3xl">⚠️</div><div className="text-sm font-medium">{this.props.name} 页面加载出错</div><div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 max-w-lg text-center break-all">{this.state.error?.message || '未知错误'}</div><button onClick={() => { this.setState({ hasError: false, error: null }); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted"><RefreshCw size={14} /> 重试</button></div>;
    }
    return this.props.children;
  }
}

type Page = 'dashboard' | 'goals' | 'projects' | 'tasks' | 'insight' | 'admin';

const LOGIN_KEY = 'tbh-current-user';
import { genId } from '@/store/utils';

const PAGE_LABELS: Record<Page, string> = { dashboard: '工作台', goals: '目标管理', projects: '项目中心', tasks: '任务中心', insight: '数据洞察', admin: '管理中心' };
function navLabel(p: Page) { return PAGE_LABELS[p] || p; }

function LoginScreen({ onLogin }: { onLogin: (userId: string) => void }) {
  const { state, dispatch } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [search, setSearch] = useState('');
  const [phone, setPhone] = useState('');
  const [wechatId, setWechatId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem(LOGIN_KEY);
    if (saved && state.members.find(m => m.id === saved)) {
      onLogin(saved);
    }
  }, []);

  function handleLogin() {
    setError('');
    const q = search.trim().toLowerCase();
    if (!q) { setError('请输入姓名、手机号、微信号或邮箱'); return; }
    const found = state.members.find(m => {
      if (m.name && m.name.toLowerCase().includes(q)) return true;
      if (m.nickname && m.nickname.toLowerCase().includes(q)) return true;
      if (m.phone && m.phone.includes(q)) return true;
      if (m.wechatId && m.wechatId.toLowerCase().includes(q)) return true;
      if (m.email && m.email.toLowerCase().includes(q)) return true;
      return false;
    });
    if (!found) { setError('未找到匹配的成员，请检查输入或注册新账号'); return; }
    try { localStorage.setItem(LOGIN_KEY, found.id); } catch {}
    dispatch({ type: 'SET_CURRENT_USER', payload: found.id });
    onLogin(found.id);
  }

  function handleRegister() {
    setError('');
    if (!name.trim()) { setError('请输入姓名'); return; }
    if (!phone.trim() && !wechatId.trim()) { setError('请输入手机号或微信号（至少一项）'); return; }
    const exists = state.members.find(m =>
      (phone.trim() && m.phone === phone.trim()) ||
      (wechatId.trim() && m.wechatId === wechatId.trim())
    );
    if (exists) {
      try { localStorage.setItem(LOGIN_KEY, exists.id); } catch {}
      dispatch({ type: 'SET_CURRENT_USER', payload: exists.id });
      onLogin(exists.id);
      return;
    }
    const newId = genId('m');
    dispatch({ type: 'ADD_MEMBER', payload: { id: newId, name: name.trim(), nickname: name.trim(), phone: phone.trim(), wechatId: wechatId.trim(), email: email.trim(), role: 'member' as const, department: 'SQ Team', avatar: name.trim().charAt(0).toUpperCase(), status: 'active' as const, permissions: [] } });
    try { localStorage.setItem(LOGIN_KEY, newId); } catch {}
    dispatch({ type: 'SET_CURRENT_USER', payload: newId });
    onLogin(newId);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground text-2xl font-bold mb-4 shadow-lg">TB</div>
          <h1 className="text-2xl font-bold text-foreground">团队业务中台</h1>
          <p className="text-sm text-muted-foreground mt-1">Team Business Hub</p>
        </div>
        <div className="bg-white rounded-2xl shadow-xl border border-border p-6 space-y-5">
          <div className="flex bg-muted rounded-lg p-0.5">
            <button onClick={() => { setMode('login'); setError(''); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${mode === 'login' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'}`}>
              <LogIn size={16} /> 登录
            </button>
            <button onClick={() => { setMode('register'); setError(''); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${mode === 'register' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'}`}>
              <UserPlus size={16} /> 注册
            </button>
          </div>
          <div className="space-y-3">
            {mode === 'login' ? (
              <div>
                <label className="block text-sm font-medium mb-1">姓名 / 手机号 / 微信号 / 邮箱</label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input className="w-full border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="请输入姓名、手机号、微信号或邮箱" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">姓名 *</label>
                  <input className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="请输入您的姓名" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">手机号</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input className="w-full border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="请输入手机号" value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">微信号</label>
                  <div className="relative">
                    <MessageCircle size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input className="w-full border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="请输入微信号" value={wechatId} onChange={e => setWechatId(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">邮箱（选填）</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input className="w-full border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="请输入邮箱" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>
          {error && <div className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          <button onClick={mode === 'login' ? handleLogin : handleRegister} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            {mode === 'login' ? '登录' : '注册并登录'} <ArrowRight size={16} />
          </button>
          {mode === 'login' && (
            <p className="text-xs text-center text-muted-foreground">输入姓名、手机号、微信号或邮箱登录，首次使用请先注册</p>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground/50 mt-6">共 {state.members.length} 名团队成员</p>
      </div>
    </div>
  );
}

function AppInner({ loggedIn }: { loggedIn: string }) {
  const { state, dispatch } = useStore();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

  useEffect(() => {
    if (state.currentUser && state.currentUser.role !== 'admin') {
      dispatch({ type: 'SET_VIEWING_MEMBER', payload: state.currentUser.id });
    }
  }, [state.currentUser?.id]);

  function renderPage() {
    switch (currentPage) {
      case 'dashboard': return <Dashboard onPageChange={(p: string) => setCurrentPage(p as Page)} />;
      case 'goals': return <Goals />;
      case 'projects': return <Projects />;
      case 'tasks': return <Tasks />;
      case 'insight': return <Insight />;
      case 'admin': return <Admin />;
      default: return <Dashboard />;
    }
  }

  const currentUser = useMemo(() => state.members.find(m => m.id === loggedIn), [state.members, loggedIn]);

    return (
    <Layout currentPage={currentPage} onPageChange={setCurrentPage} currentUser={currentUser}>
      <Suspense fallback={<div className="flex items-center justify-center h-64 text-muted-foreground text-sm">加载中...</div>}>
        <PageErrorBoundary key={currentPage} name={navLabel(currentPage)}>
          {renderPage()}
        </PageErrorBoundary>
      </Suspense>
    </Layout>
  );
}

function App() {
  // Migrate old localStorage key
  useEffect(() => {
    try {
      const oldId = localStorage.getItem('tbh-current-user-id');
      if (oldId && !localStorage.getItem(LOGIN_KEY)) {
        localStorage.setItem(LOGIN_KEY, oldId);
      }
      localStorage.removeItem('tbh-current-user-id');
    } catch {}
  }, []);

  const [loggedIn, setLoggedIn] = useState<string | null>(() => { try { return localStorage.getItem(LOGIN_KEY); } catch { return null; } });
  return (
    <StoreProvider>
        {loggedIn ? <AppInner loggedIn={loggedIn} /> : <LoginScreen onLogin={(id) => setLoggedIn(id)} />}
      </StoreProvider>
  );
}

export default App;
