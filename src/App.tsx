import { useState, useEffect, useRef, useCallback, lazy, Suspense, Component, useMemo, type ReactNode, type ErrorInfo } from 'react';
import Layout from '@/components/layout/Layout';
import { initSentry, setSentryUser, clearSentryUser } from '@/lib/sentry';
import { DegradedBanner } from '@/components/DegradedMode';
import { FeatureFlagProvider } from '@/lib/featureFlags';
import { startAiPushScan, stopAiPushScan } from '@/lib/pushEventEngine';
import { startAutomaton, stopAutomaton } from '@/lib/ai/aiAutomaton';
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Goals = lazy(() => import('@/pages/Goals'));
const Projects = lazy(() => import('@/pages/Projects'));
const Tasks = lazy(() => import('@/pages/Tasks'));
const Insight = lazy(() => import('@/pages/Insight'));
const Knowledge = lazy(() => import('@/pages/Knowledge'));
const Admin = lazy(() => import('@/pages/Admin'));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })));
const ConsentDialog = lazy(() => import('@/pages/PrivacyPage').then(m => ({ default: m.ConsentDialog })));
import { StoreProvider, useStore } from '@/store/useStore';
import { UserPlus, LogIn, Phone, MessageCircle, Mail, ArrowRight, Search, RefreshCw, Users, Key, Building2 } from 'lucide-react';
import { setCurrentTeamId } from '@/store/supabase';
import { setRLSContext, getSupabaseClient } from '@/supabase/client';
import { wechatOAuthLogin, phoneOtpLogin, emailMagicLink } from '@/lib/authBridge';

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

type Page = 'dashboard' | 'goals' | 'projects' | 'tasks' | 'insight' | 'knowledge' | 'admin' | 'privacy';

const LOGIN_KEY = 'tbh-current-user';
const TEAM_KEY = 'tbh-current-team';
import { genId } from '@/store/utils';

const PAGE_LABELS: Record<Page, string> = { dashboard: '工作台', goals: '目标管理', projects: '项目中心', tasks: '任务中心', insight: '数据洞察', ai: 'AI 分析', knowledge: '知识库', admin: '管理中心' };
function navLabel(p: Page) { return PAGE_LABELS[p] || p; }

function LoginScreen({ onLogin }: { onLogin: (userId: string) => void }) {
  const { state, dispatch } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [authMethod, setAuthMethod] = useState<'search' | 'wechat' | 'phone' | 'email'>('search');
  const [step, setStep] = useState<'auth' | 'team'>('auth');
  const [search, setSearch] = useState('');
  const [phone, setPhone] = useState('');
  const [wechatId, setWechatId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [magicEmail, setMagicEmail] = useState('');
  const [wechatInput, setWechatInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [error, setError] = useState('');
  const [lockUntil, setLockUntil] = useState(0);
  const [loginPending, setLoginPending] = useState(false);
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  const [teamMode, setTeamMode] = useState<'join' | 'create' | 'select'>('select');
  const [inviteCode, setInviteCode] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [teamError, setTeamError] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOGIN_KEY);
      const SESSION_TTL = 8 * 60 * 60 * 1000;
      const loginTime = localStorage.getItem('tbh-login-time');
      if (loginTime && (Date.now() - parseInt(loginTime)) > SESSION_TTL) {
        localStorage.removeItem(LOGIN_KEY);
        localStorage.removeItem('tbh-login-time');
        localStorage.removeItem('tbh-login-attempts');
        return;
      }
      if (saved && state.members.find(m => m.id === saved)) {
        const member = state.members.find(m => m.id === saved);
        if (member && member.role === 'member') { dispatch({ type: 'SET_VIEWING_MEMBER', payload: saved }); }
        else { dispatch({ type: 'SET_VIEWING_MEMBER', payload: null }); }
        onLogin(saved);
      }
    } catch (e) {
      console.error('[App] failed to restore login state:', e);
    }
  }, []);

  useEffect(() => {
    const SESSION_TTL = 8 * 60 * 60 * 1000;
    const interval = setInterval(() => {
      try {
        const loginTime = localStorage.getItem('tbh-login-time');
        if (loginTime && (Date.now() - parseInt(loginTime)) > SESSION_TTL) {
          localStorage.removeItem(LOGIN_KEY);
          localStorage.removeItem('tbh-login-time');
          localStorage.removeItem('tbh-login-attempts');
          window.location.reload();
        }
      } catch {}
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  function checkRateLimit(): boolean {
    const now = Date.now();
    if (now < lockUntil) {
      const remain = Math.ceil((lockUntil - now) / 1000);
      setError(`登录尝试过于频繁，请 ${remain} 秒后再试`);
      return false;
    }
    return true;
  }
  function recordFailedAttempt() {
    const key = 'tbh-login-attempts';
    try {
      const raw = localStorage.getItem(key);
      const attempts: number[] = raw ? JSON.parse(raw) : [];
      attempts.push(Date.now());
      const cutoff = Date.now() - 5 * 60 * 1000;
      const recent = attempts.filter(t => t > cutoff);
      localStorage.setItem(key, JSON.stringify(recent));
      if (recent.length >= 5) {
        setLockUntil(Date.now() + 5 * 60 * 1000);
        setError('登录失败次数过多，已锁定 5 分钟');
      }
    } catch (e) { console.error('[App] rate limit recording failed:', e); }
  }

  function handleLogin() {
    if (loginPending) return;
    setError('');
    if (!checkRateLimit()) return;
    const q = search.trim().toLowerCase().replace(/\s/g, '');
    if (!q) { setError('请输入姓名、手机号、微信号或邮箱'); return; }
    if (q.length < 2) { setError('输入过短，请至少输入2个字符'); return; }
    const found = state.members.find(m => {
      if (m.name && m.name.toLowerCase().replace(/\s/g, '') === q) return true;
      if (m.nickname && m.nickname.toLowerCase().replace(/\s/g, '') === q) return true;
      if (m.phone && m.phone.replace(/\s/g, '') === q) return true;
      if (m.wechatId && m.wechatId.toLowerCase().replace(/\s/g, '') === q) return true;
      if (m.email && m.email.toLowerCase().replace(/\s/g, '') === q) return true;
      return false;
    });
    if (!found) { recordFailedAttempt(); setError('未找到匹配的成员，请检查输入或注册新账号'); return; }
    setLoginPending(true);
    // User found — check teams
    const userTeams = state.teamMembers.filter(tm => tm.memberId === found.id);
    if (userTeams.length === 0) {
      // No team — go to team selection
      setVerifiedUserId(found.id);
      dispatch({ type: 'SET_CURRENT_USER', payload: found.id });
      setStep('team');
      setLoginPending(false);
      return;
    }
    if (userTeams.length === 1) {
      // Single team — auto-join
      finalizeLogin(found.id, userTeams[0].teamId);
      return;
    }
    // Multiple teams — let user choose
    setVerifiedUserId(found.id);
    dispatch({ type: 'SET_CURRENT_USER', payload: found.id });
    setStep('team');
    setLoginPending(false);
  }

  async function handleWechatLogin() {
    if (loginPending) return;
    setError('');
    if (!wechatInput.trim()) { setError('请输入企业微信号'); return; }
    setLoginPending(true);
    const memberId = await wechatOAuthLogin(wechatInput.trim(), state.members);
    if (memberId) {
      const userTeams = state.teamMembers.filter(tm => tm.memberId === memberId);
      if (userTeams.length === 1) { finalizeLogin(memberId, userTeams[0].teamId); return; }
      setVerifiedUserId(memberId);
      dispatch({ type: 'SET_CURRENT_USER', payload: memberId });
      setStep('team');
    } else {
      setError('未找到匹配的成员，请检查企业微信号或先注册');
    }
    setLoginPending(false);
  }

  async function handlePhoneLogin() {
    if (loginPending) return;
    setError('');
    if (!phoneInput.trim()) { setError('请输入手机号'); return; }
    if (!/^1\d{10}$/.test(phoneInput.trim())) { setError('手机号格式不正确'); return; }
    if (!otp.trim() || !/^\d{6}$/.test(otp.trim())) { setError('请输入6位验证码'); return; }
    setLoginPending(true);
    const memberId = await phoneOtpLogin(phoneInput.trim(), otp.trim(), state.members);
    if (memberId) {
      const userTeams = state.teamMembers.filter(tm => tm.memberId === memberId);
      if (userTeams.length === 1) { finalizeLogin(memberId, userTeams[0].teamId); return; }
      setVerifiedUserId(memberId);
      dispatch({ type: 'SET_CURRENT_USER', payload: memberId });
      setStep('team');
    } else {
      setError('验证码错误或手机号未注册');
    }
    setLoginPending(false);
  }

  async function handleEmailLogin() {
    if (loginPending) return;
    setError('');
    if (!magicEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(magicEmail.trim())) { setError('请输入正确的邮箱地址'); return; }
    setLoginPending(true);
    const memberId = await emailMagicLink(magicEmail.trim(), state.members);
    if (memberId) {
      const userTeams = state.teamMembers.filter(tm => tm.memberId === memberId);
      if (userTeams.length === 1) { finalizeLogin(memberId, userTeams[0].teamId); return; }
      setVerifiedUserId(memberId);
      dispatch({ type: 'SET_CURRENT_USER', payload: memberId });
      setStep('team');
    } else {
      setError('邮箱未注册，请先注册或使用其他方式登录');
    }
    setLoginPending(false);
  }

  function handleRegister() {
    setError('');
    if (!name.trim() || name.trim().length > 20) { setError('请输入姓名（最多20字）'); return; }
    if (!phone.trim() && !wechatId.trim()) { setError('请输入手机号或微信号（至少一项）'); return; }
    const exists = state.members.find(m =>
      (phone.trim() && m.phone === phone.trim()) ||
      (wechatId.trim() && m.wechatId === wechatId.trim())
    );
    if (exists) {
      setVerifiedUserId(exists.id);
      dispatch({ type: 'SET_CURRENT_USER', payload: exists.id });
      const userTeams = state.teamMembers.filter(tm => tm.memberId === exists.id);
      if (userTeams.length === 1) {
        finalizeLogin(exists.id, userTeams[0].teamId);
        return;
      }
      setStep('team');
      return;
    }
    const newId = genId('m');
    dispatch({ type: 'ADD_MEMBER', payload: { id: newId, name: name.trim(), nickname: name.trim(), phone: phone.trim(), wechatId: wechatId.trim(), email: email.trim(), role: 'member' as const, department: '', avatar: name.trim().charAt(0).toUpperCase(), status: 'active' as const, permissions: [] } });
    try { localStorage.setItem(LOGIN_KEY, newId); localStorage.setItem('tbh-login-time', String(Date.now())); } catch {}
    setVerifiedUserId(newId);
    dispatch({ type: 'SET_CURRENT_USER', payload: newId });
    dispatch({ type: 'SET_VIEWING_MEMBER', payload: newId });
    setStep('team');
  }

  function finalizeLogin(userId: string, teamId: string) {
    dispatch({ type: 'SET_CURRENT_USER', payload: userId });
    try { localStorage.setItem(LOGIN_KEY, userId); localStorage.setItem('tbh-login-time', String(Date.now())); localStorage.setItem(TEAM_KEY, teamId); } catch {}
    const member = state.members.find(m => m.id === userId);
    dispatch({ type: 'SET_CURRENT_TEAM', payload: teamId });
    setCurrentTeamId(teamId);
    setRLSContext(teamId, userId);
    setSentryUser(userId, member?.name);
    // Login audit: write to audit_logs
    try {
      const sb = getSupabaseClient();
      if (sb) {
        sb.from('audit_logs').insert({
          table_name: 'members',
          record_id: userId,
          action: 'INSERT',
          new_data: { event: 'login', name: member?.name || '', role: member?.role || '' },
          performed_by: userId,
          team_id: teamId,
        }).then(() => {}, () => {});
      }
    } catch {}
    if (member && member.role === 'member') { dispatch({ type: 'SET_VIEWING_MEMBER', payload: userId }); }
    else { dispatch({ type: 'SET_VIEWING_MEMBER', payload: null }); }
    onLogin(userId);
  }

  async function handleJoinTeam() {
    setTeamError('');
    if (!inviteCode.trim()) { setTeamError('请输入邀请码'); return; }
    if (!verifiedUserId) return;
    try {
      const sb = (await import('@/supabase/client')).getSupabaseClient();
      if (sb) {
        const { data, error } = await sb.rpc('join_team_by_code', { p_invite_code: inviteCode.trim(), p_member_id: verifiedUserId });
        if (error) { setTeamError('加入失败：' + error.message); return; }
        if (data?.error) { setTeamError(data.error); return; }
        if (data?.team_id) {
          finalizeLogin(verifiedUserId, data.team_id);
          return;
        }
      }
      setTeamError('加入失败，请检查邀请码');
    } catch (e: unknown) { setTeamError('加入失败：' + (e instanceof Error ? e.message : String(e))); }
  }

  async function handleCreateTeam() {
    setTeamError('');
    if (!newTeamName.trim() || newTeamName.trim().length > 30) { setTeamError('请输入团队名称（1-30字）'); return; }
    if (!verifiedUserId) return;
    try {
      const sb = (await import('@/supabase/client')).getSupabaseClient();
      if (sb) {
        const { data, error } = await sb.rpc('create_team', { p_name: newTeamName.trim(), p_owner_id: verifiedUserId, p_description: '' });
        if (error) { setTeamError('创建失败：' + error.message); return; }
        if (data?.team_id) {
          finalizeLogin(verifiedUserId, data.team_id);
          return;
        }
      }
      setTeamError('创建失败，请重试');
    } catch (e: unknown) { setTeamError('创建失败：' + (e instanceof Error ? e.message : String(e))); }
  }

  function handleSelectTeam(teamId: string) {
    if (verifiedUserId) finalizeLogin(verifiedUserId, teamId);
  }

  // Team selection step
  if (step === 'team') {
    const userTeams = state.teamMembers.filter(tm => tm.memberId === verifiedUserId);
    const teamsForUser = state.teams.filter(t => userTeams.some(tm => tm.teamId === t.id));
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground text-2xl font-bold mb-4 shadow-lg">TB</div>
            <h1 className="text-2xl font-bold text-foreground">选择团队</h1>
            <p className="text-sm text-muted-foreground mt-1">选择一个团队加入，或创建/加入新团队</p>
          </div>
          <div className="bg-card rounded-2xl shadow-xl border border-border p-6 space-y-4">
            {teamsForUser.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">我的团队</h3>
                {teamsForUser.map(t => (
                  <button key={t.id} onClick={() => handleSelectTeam(t.id)} className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">{(t.avatar || t.name).charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.name}</div>
                      <div className="text-xs text-muted-foreground">邀请码: {t.inviteCode}</div>
                    </div>
                    <ArrowRight size={16} className="text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
            {teamsForUser.length > 0 && <div className="border-t border-border" />}
            <div className="flex bg-muted rounded-lg p-0.5">
              <button onClick={() => setTeamMode('join')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all ${teamMode === 'join' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}><Key size={14} />邀请码加入</button>
              <button onClick={() => setTeamMode('create')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all ${teamMode === 'create' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}><Building2 size={14} />创建团队</button>
            </div>
            {teamMode === 'join' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">团队邀请码</label>
                  <input className="w-full border border-border rounded-lg px-3 py-2.5 text-sm uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-center font-mono" placeholder="输入6位邀请码" value={inviteCode} onChange={e => setInviteCode(e.target.value.slice(0, 6))} maxLength={6} onKeyDown={e => e.key === 'Enter' && handleJoinTeam()} />
                </div>
                {teamError && <div className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{teamError}</div>}
                <button onClick={handleJoinTeam} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"><Key size={16} /> 加入团队</button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">团队名称</label>
                  <input className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="输入团队名称" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} maxLength={30} onKeyDown={e => e.key === 'Enter' && handleCreateTeam()} />
                </div>
                {teamError && <div className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{teamError}</div>}
                <button onClick={handleCreateTeam} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"><Building2 size={16} /> 创建团队</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Auth step (login/register)
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground text-2xl font-bold mb-4 shadow-lg">TB</div>
          <h1 className="text-2xl font-bold text-foreground">团队业务中台</h1>
          <p className="text-sm text-muted-foreground mt-1">Team Business Hub</p>
        </div>
        <div className="bg-card rounded-2xl shadow-xl border border-border p-6 space-y-5">
          <div className="flex bg-muted rounded-lg p-0.5">
            <button onClick={() => { setMode('login'); setError(''); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${mode === 'login' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
              <LogIn size={16} /> 登录
            </button>
            <button onClick={() => { setMode('register'); setError(''); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${mode === 'register' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
              <UserPlus size={16} /> 注册
            </button>
          </div>
          <div className="space-y-3">
            {mode === 'login' ? (
              <>
                <div className="flex bg-muted rounded-lg p-0.5">
                  <button onClick={() => { setAuthMethod('search'); setError(''); }} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition-all ${authMethod === 'search' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
                    <Search size={14} />搜索
                  </button>
                  <button onClick={() => { setAuthMethod('wechat'); setError(''); }} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition-all ${authMethod === 'wechat' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
                    <MessageCircle size={14} />企微
                  </button>
                  <button onClick={() => { setAuthMethod('phone'); setError(''); }} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition-all ${authMethod === 'phone' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
                    <Phone size={14} />手机
                  </button>
                  <button onClick={() => { setAuthMethod('email'); setError(''); }} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition-all ${authMethod === 'email' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>
                    <Mail size={14} />邮箱
                  </button>
                </div>
                {authMethod === 'search' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">姓名 / 手机号 / 微信号 / 邮箱</label>
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input className="w-full border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="请输入姓名、手机号、微信号或邮箱" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                    </div>
                  </div>
                )}
                {authMethod === 'wechat' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">企业微信号</label>
                    <div className="relative">
                      <MessageCircle size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input className="w-full border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="请输入企业微信号" value={wechatInput} onChange={e => setWechatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleWechatLogin()} />
                    </div>
                  </div>
                )}
                {authMethod === 'phone' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">手机号</label>
                      <div className="relative">
                        <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input className="w-full border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="请输入手机号" value={phoneInput} onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 11))} maxLength={11} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">验证码</label>
                      <input className="w-full border border-border rounded-lg px-3 py-2.5 text-sm tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono" placeholder="6位验证码" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} />
                    </div>
                  </div>
                )}
                {authMethod === 'email' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">邮箱地址</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input className="w-full border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="请输入邮箱" value={magicEmail} onChange={e => setMagicEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEmailLogin()} />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">姓名 *</label>
                  <input className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="请输入您的姓名" value={name} onChange={e => setName(e.target.value)} maxLength={20} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">手机号</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input className="w-full border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="请输入手机号" value={phone} onChange={e => setPhone(e.target.value)} maxLength={11} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">微信号</label>
                  <div className="relative">
                    <MessageCircle size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input className="w-full border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="请输入微信号" value={wechatId} onChange={e => setWechatId(e.target.value)} maxLength={50} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">邮箱（选填）</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input className="w-full border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="请输入邮箱" value={email} onChange={e => setEmail(e.target.value)} maxLength={100} />
                  </div>
                </div>
              </div>
            )}
          </div>
          {error && <div className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          <button onClick={mode === 'login' ? (authMethod === 'wechat' ? handleWechatLogin : authMethod === 'phone' ? handlePhoneLogin : authMethod === 'email' ? handleEmailLogin : handleLogin) : handleRegister} disabled={loginPending} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {mode === 'login' ? (loginPending ? '登录中...' : '登录') : '注册'} <ArrowRight size={16} />
          </button>
          {mode === 'login' && (
            <p className="text-xs text-center text-muted-foreground">输入姓名、手机号、微信号或邮箱登录，首次使用请先注册</p>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground/50 mt-6">共 {state.members.length} 名团队成员 · {state.teams.length} 个团队</p>
      </div>
    </div>
  );
}

function AppInner({ loggedIn }: { loggedIn: string }) {
  const { state, dispatch } = useStore();
  const stateRef = useRef(state);
  stateRef.current = state;

  // --- Lightweight hash-based URL routing ---
  // Hash format: #/dashboard, #/goals, #/tasks, etc.
  const PAGE_FROM_HASH = (hash: string): Page => {
    const p = hash.replace(/^#\/?/, '') as Page;
    const valid: Page[] = ['dashboard', 'goals', 'projects', 'tasks', 'insight', 'knowledge', 'admin', 'privacy'];
    return valid.includes(p) ? p : 'dashboard';
  };
  const [currentPage, setCurrentPage] = useState<Page>(() => PAGE_FROM_HASH(window.location.hash));
  const navigateTo = useCallback((page: Page) => {
    window.location.hash = `#/${page}`;
  }, []);

  // Listen for hash changes (back/forward, URL sharing)
  useEffect(() => {
    const onHashChange = () => setCurrentPage(PAGE_FROM_HASH(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    // Sync initial hash
    if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
      window.location.hash = '#/dashboard';
    }
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const [showConsent, setShowConsent] = useState(() => {
    try { return !localStorage.getItem('tbh-privacy-consented'); } catch { return true; }
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
      (action: any) => { try { dispatch(action); } catch {} },
    );
    return () => { stopAiPushScan(); stopAutomaton(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  // Admin/manager default to team view (viewingMemberId = null), set during login
  // Member users default to personal view (viewingMemberId = own ID), set during login

  function renderPage() {
    switch (currentPage) {
      case 'dashboard': return <Dashboard onPageChange={(p: string) => navigateTo(p as Page)} />;
      case 'goals': return <Goals />;
      case 'projects': return <Projects />;
      case 'tasks': return <Tasks />;
      case 'insight': return <Insight />;
      case 'knowledge': return <Knowledge />;
      case 'admin': return <Admin />;
      case 'privacy': return <PrivacyPage onBack={() => navigateTo('dashboard')} />;
      default: return <Dashboard />;
    }
  }

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
      <Layout currentPage={currentPage} onPageChange={navigateTo} currentUser={currentUser}>
        <Suspense fallback={<div className="flex items-center justify-center h-64 text-muted-foreground text-sm">加载中...</div>}>
          <PageErrorBoundary key={currentPage} name={navLabel(currentPage)}>
            {renderPage()}
          </PageErrorBoundary>
        </Suspense>
      </Layout>
    </>
  );
}

function App() {
  // Initialize Sentry on first load
  useEffect(() => { initSentry(); }, []);

  // Force SW update: detect new version and reload to bust stale PWA cache
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // New SW has taken control — reload to use fresh code
        window.location.reload();
      });
      // Also: if there's a waiting SW, force it to activate immediately
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg?.waiting) { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); }
      });
    }
  }, []);

  // D7: Deep link — handle NAVIGATE messages from SW (notificationclick)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        const url = event.data.url;
        // Convert SW URL to hash-based route: /task/xxx -> #tasks, /goal/xxx -> #goals
        const page = url.includes('/goal') ? 'goals' : url.includes('/project') ? 'projects' : url.includes('/task') ? 'tasks' : null;
        if (page) {
          window.location.hash = page;
          // Dispatch item navigation after a short delay for page to load
          const itemId = url.split('/').pop();
          if (itemId) {
            const itemType = url.includes('/goal') ? 'goal' : url.includes('/project') ? 'project' : 'task';
            setTimeout(() => window.dispatchEvent(new CustomEvent('tbh-nav-item', { detail: { id: itemId, type: itemType } })), 300);
          }
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
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
    } catch {}
  }, []);

  const { state: appState } = useStore();
  const currentUserId = appState.currentUser?.id || null;
  const [loggedIn, setLoggedIn] = useState<string | null>(() => { try { return localStorage.getItem(LOGIN_KEY); } catch { return null; } });

  // Sync loggedIn with store: when currentUser changes (e.g. logout, or switching users), update localStorage + loggedIn
  useEffect(() => {
    if (currentUserId) {
      try { localStorage.setItem(LOGIN_KEY, currentUserId); } catch {}
    } else {
      try { localStorage.removeItem(LOGIN_KEY); } catch {}
    }
    setLoggedIn(currentUserId);
  }, [currentUserId]);

  return loggedIn ? (
    <FeatureFlagProvider teamId={appState.currentTeamId}>
      <AppInner loggedIn={loggedIn} />
    </FeatureFlagProvider>
  ) : <LoginScreen onLogin={(id) => setLoggedIn(id)} />;
}

export default App;
