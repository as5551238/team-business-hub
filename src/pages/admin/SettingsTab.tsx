import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore, useBackupExport } from '@/store/useStore';
import { loadWeChatConfig, saveWeChatConfig, sendWeChatMessage, testChannel, formatDailyDigest, type WeChatConfig, type NotifyChannel, getLastTestError, setLastTestError } from '@/supabase/wechat';
import { generateAllData } from '@/data/dataGenerator';
import { exportToExcel, importFromExcel, importFromJSON } from '@/lib/excelBackup';
import type { BackupData } from '@/types';
import {
  Settings as SettingsIcon, MessageSquare, Send, Bell,
  Cloud, CloudOff, Loader2, RefreshCw, Check, ArrowRight, AlertCircle,
  Database, Download, Upload, Copy, Mail, Trash2, ChevronDown,
  Tag as TagIcon,
} from 'lucide-react';
import { inputCls, loadEmailConfig, saveEmailConfig, loadWechatGroupConfig, saveWechatGroupConfig } from './constants';
import type { EmailConfig } from './constants';

function SupabaseSection() {
  const { connectionMode, connectSupabase, disconnectSupabase, initializeSupabaseData, connectionError } = useStore();
  const { goals, projects, tasks, members } = useStore().state;
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState(connectionMode === 'supabase' ? 3 : 1);

  const statusConfig: Record<string, { color: string; label: string }> = { local: { color: 'text-gray-500', label: '本地模式（数据仅存本机）' }, supabase: { color: 'text-green-600', label: '云端同步中（团队成员实时共享）' }, loading: { color: 'text-amber-500', label: '连接中...' } };
  const st = statusConfig[connectionMode];

  async function handleConnect() { if (!url.trim() || !anonKey.trim()) return; setConnecting(true); try { const success = await connectSupabase(url.trim(), anonKey.trim()); if (success) setStep(2); } catch (e: any) { console.error('连接失败:', e); } setConnecting(false); }
  async function handleInitData() { setInitializing(true); try { await initializeSupabaseData(); setStep(3); } catch (e: any) { console.error('初始化失败:', e); } setInitializing(false); }
  function handleDisconnect() { disconnectSupabase(); setStep(1); setUrl(''); setAnonKey(''); }
  function handleCopy() { const el = document.getElementById('admin-schema-text'); if (el) { navigator.clipboard.writeText(el.textContent || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); } }

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${connectionMode === 'supabase' ? 'bg-green-50' : 'bg-gray-50'}`}>{connectionMode === 'supabase' ? <Cloud size={18} className="text-green-600" /> : <CloudOff size={18} className="text-gray-400" />}</div>
          <div><div className="font-semibold text-sm">云端同步</div><div className={`text-xs ${st.color}`}>{st.label}</div></div>
        </div>
        {connectionMode === 'supabase' && <button onClick={handleDisconnect} className="text-xs text-destructive hover:underline">断开连接</button>}
      </div>
      {connectionError && <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4 text-sm text-red-700"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {connectionError}</div>}
      {connectionMode !== 'supabase' && (
        <div className="flex items-center gap-2 mb-5">
          {[{ n: 1, label: '连接' }, { n: 2, label: '建表' }, { n: 3, label: '初始化数据' }].map((s, i) => (
            <div key={s.n} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${step > s.n ? 'bg-green-500 text-white' : step === s.n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{step > s.n ? '\u2713' : s.n}</div>
              <span className={`text-xs ${step > s.n ? 'text-green-600' : step === s.n ? 'font-medium' : 'text-muted-foreground'}`}>{s.label}</span>
              {i < 2 && <div className={`flex-1 h-px ${step > s.n ? 'bg-green-300' : 'bg-border'}`} />}
            </div>
          ))}
        </div>
      )}
      {step === 1 && connectionMode !== 'supabase' && (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 space-y-1"><p className="font-medium">快速开始：</p><ol className="list-decimal ml-4"><li>访问 <a href="https://supabase.com" target="_blank" rel="noreferrer" className="underline font-medium">supabase.com</a> 注册并创建项目</li><li>在 Project Settings / API 复制 URL 和 publishable key</li></ol></div>
          <input className="w-full border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Project URL: https://xxxxx.supabase.co" value={url} onChange={e => setUrl(e.target.value)} />
          <input className="w-full border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Publishable Key: sb_publishable_xxx..." value={anonKey} onChange={e => setAnonKey(e.target.value)} />
          <button onClick={handleConnect} disabled={connecting || !url.trim() || !anonKey.trim()} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {connecting ? <><Loader2 size={14} className="animate-spin" /> 连接中...</> : '连接 Supabase'}
          </button>
        </div>
      )}
      {step === 2 && connectionMode === 'supabase' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">在 Supabase 的 SQL Editor 中执行以下脚本：</p>
          <div className="relative">
            <button onClick={handleCopy} className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-white border border-border hover:bg-muted">{copied ? <><Check size={10} className="text-green-600" /> 已复制</> : <><Copy size={10} /> 复制</>}</button>
            <pre id="admin-schema-text" className="bg-gray-900 text-gray-100 rounded-lg p-3 text-[10px] font-mono max-h-48 overflow-auto whitespace-pre select-all leading-relaxed">{`create extension if not exists "uuid-ossp";
create table if not exists members (id text primary key default gen_random_uuid()::text, name text not null, role text not null default 'member', department text not null, avatar text not null, email text not null, status text not null default 'active', join_date text not null, created_at timestamptz default now());
create table if not exists goals (id text primary key default gen_random_uuid()::text, title text not null, description text, type text not null default 'okr', status text not null default 'in_progress', parent_id text references goals(id) on delete cascade, level int not null default 0, start_date text not null, end_date text not null, owner_id text, key_results jsonb default '[]'::jsonb, progress int not null default 0, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists projects (id text primary key default gen_random_uuid()::text, title text not null, description text, goal_id text references goals(id), status text not null default 'planning', start_date text not null, end_date text not null, owner_id text, member_ids jsonb default '[]'::jsonb, task_count int not null default 0, progress int not null default 0, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists tasks (id text primary key default gen_random_uuid()::text, title text not null, description text, project_id text, goal_id text, status text not null default 'todo', priority text not null default 'medium', assignee_id text, owner_id text, due_date text, reminder_date text, completed_at timestamptz, subtasks jsonb default '[]'::jsonb, tags jsonb default '[]'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists notifications (id text primary key default gen_random_uuid()::text, type text not null, title text not null, message text not null, related_id text not null, related_type text not null, member_id text, read boolean not null default false, created_at timestamptz default now());
create table if not exists activities (id text primary key default gen_random_uuid()::text, member_id text, action text not null, target_type text not null, target_id text not null, target_title text not null, details text, created_at timestamptz default now());
alter table members enable row level security; alter table goals enable row level security; alter table projects enable row level security; alter table tasks enable row level security; alter table notifications enable row level security; alter table activities enable row level security;
create policy "Allow all" on members for all using (true) with check (true);
create policy "Allow all" on goals for all using (true) with check (true);
create policy "Allow all" on projects for all using (true) with check (true);
create policy "Allow all" on tasks for all using (true) with check (true);
create policy "Allow all" on notifications for all using (true) with check (true);
create policy "Allow all" on activities for all using (true) with check (true);
alter publication supabase_realtime add table goals;
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table activities;`}</pre>
          </div>
          <button onClick={() => setStep(3)} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90">已执行完SQL，下一步 <ArrowRight size={14} /></button>
        </div>
      )}
      {step === 3 && connectionMode === 'supabase' && (
        <div className="space-y-3">
          <button onClick={handleInitData} disabled={initializing} className="w-full flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">{initializing ? <><Loader2 size={14} className="animate-spin" /> 导入中...</> : <><Database size={14} /> 一键初始化预置数据</>}</button>
          <p className="text-[10px] text-muted-foreground text-center">将导入 {members.length} 成员、{goals.length} 目标、{projects.length} 项目、{tasks.length} 任务</p>
        </div>
      )}
    </div>
  );
}

function WeChatSection() {
  const { tasks, members } = useStore().state;
  const [config, setConfig] = useState<WeChatConfig>(loadWeChatConfig());
  const [wechatGroup, setWechatGroup] = useState(loadWechatGroupConfig());
  const [testResult, setTestResult] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [digestResult, setDigestResult] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState(getLastTestError());
  const [groupSaveOk, setGroupSaveOk] = useState(false);

  function updateConfig(partial: Partial<WeChatConfig>) {
    setConfig(prev => {
      const newConfig = { ...prev, ...partial };
      saveWeChatConfig(newConfig);
      return newConfig;
    });
  }
  function updateEvents(key: keyof WeChatConfig['notifyEvents'], val: boolean) {
    setConfig(prev => {
      const newConfig = { ...prev, notifyEvents: { ...prev.notifyEvents, [key]: val } };
      saveWeChatConfig(newConfig);
      return newConfig;
    });
  }
  function updateChannel(ch: NotifyChannel) { updateConfig({ channel: ch }); }
  function saveGroupConfig() {
    setWechatGroup(prev => { saveWechatGroupConfig(prev); return prev; });
    setGroupSaveOk(true);
    setTimeout(() => setGroupSaveOk(false), 2000);
  }

  const currentKey = config.channel === 'server_chan' ? config.serverChan.sendKey : config.workWechat.webhookUrl;
  const isReady = config.channel === 'server_chan' ? !!config.serverChan.sendKey : !!config.workWechat.webhookUrl;

  async function handleTest() {
    setTestResult('sending');
    try { const ok = await testChannel(config.channel, config); setTestResult(ok ? 'success' : 'error'); if (!ok) setLastTestError('发送失败，请检查配置'); } catch (e: any) { setTestResult('error'); setLastTestError(e.message || '发送失败'); }
    setTimeout(() => setTestResult('idle'), 5000);
  }

  async function sendDigest() {
    setDigestResult('sending');
    const today = new Date().toISOString().split('T')[0];
    const overdueTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate && t.dueDate < today).map(t => ({ title: t.title, assignee: members.find(m => m.id === t.leaderId)?.name || '未知', dueDate: t.dueDate!, priority: t.priority }));
    const todayDueTasks = tasks.filter(t => t.status !== 'done' && t.dueDate === today).map(t => ({ title: t.title, assignee: members.find(m => m.id === t.leaderId)?.name || '未知' }));
    const ok = await sendWeChatMessage(formatDailyDigest({ overdueTasks, todayDueTasks, todayCompleted: tasks.filter(t => t.completedAt && t.completedAt.startsWith(today)).length, totalActive: tasks.filter(t => t.status === 'in_progress').length }));
    setDigestResult(ok ? 'success' : 'error'); setTimeout(() => setDigestResult('idle'), 3000);
  }

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${config.enabled && isReady ? 'bg-green-50' : 'bg-gray-50'}`}><MessageSquare size={18} className={config.enabled && isReady ? 'text-green-600' : 'text-gray-400'} /></div>
          <div><div className="font-semibold text-sm">微信通知</div><div className={`text-xs ${config.enabled && isReady ? 'text-green-600' : 'text-muted-foreground'}`}>{config.enabled && isReady ? `已启用 - ${config.channel === 'server_chan' ? 'Server酱' : '企业微信群'}接收通知` : '未启用'}</div></div>
        </div>
        <button onClick={() => updateConfig({ enabled: !config.enabled })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.enabled ? 'bg-green-500' : 'bg-gray-200'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`} /></button>
      </div>
      <div><label className="block text-xs font-medium mb-2">通知通道</label>
        <div className="flex gap-2">
          <button onClick={() => updateChannel('server_chan')} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs border transition-colors ${config.channel === 'server_chan' ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border hover:bg-muted'}`}>Server酱（个人微信）</button>
          <button onClick={() => updateChannel('work_wechat')} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs border transition-colors ${config.channel === 'work_wechat' ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border hover:bg-muted'}`}>企业微信群机器人</button>
        </div>
      </div>
      {config.channel === 'server_chan' ? (
        <div>
          <label className="block text-xs font-medium mb-1">Server酱 SendKey</label>
          <input className="w-full border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="SCTxxxxxxxxxx..." value={config.serverChan.sendKey} onChange={e => updateConfig({ serverChan: { sendKey: e.target.value } })} />
          <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-3 text-[10px] text-green-800 space-y-1"><p className="font-medium">如何获取 Server酱 SendKey？</p><ol className="list-decimal ml-4 space-y-0.5"><li>用微信打开 sct.ftqq.com 并登录</li><li>在 SendKey 列表中点击新增或使用已有的 Key</li><li>复制 SendKey（形如 SCTxxxxxxxxxx）粘贴到上方输入框</li></ol></div>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium mb-1">企业微信群机器人 Webhook URL</label>
          <input className="w-full border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx" value={config.workWechat.webhookUrl} onChange={e => updateConfig({ workWechat: { webhookUrl: e.target.value } })} />
          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-[10px] text-amber-800 space-y-1"><p className="font-medium">找不到群机器人？</p><ol className="list-decimal ml-4 space-y-0.5"><li>群机器人功能需由企业管理员在企业微信管理后台开启</li><li>路径：管理后台 - 应用管理 - 群机器人 - 开启</li><li>开启后在群聊右上角... - 群设置 - 群机器人 - 添加</li></ol><p className="mt-1">如果用个人微信群，请切换为 Server酱 通道。</p></div>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium mb-1">企业微信群机器人独立配置（备用）</label>
        <div className="flex items-center gap-2">
          <input className="flex-1 border border-border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx" value={wechatGroup.webhookUrl} onChange={e => setWechatGroup({ webhookUrl: e.target.value })} />
          <button onClick={saveGroupConfig} className="px-3 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">保存</button>
          {groupSaveOk && <span className="text-xs text-green-600">已保存</span>}
        </div>
      </div>
      <div><label className="block text-xs font-medium mb-2">通知事件</label>
        <div className="space-y-2">
          {([
            { key: 'taskOverdue' as const, label: '任务逾期', desc: '超过截止日期时推送' },
            { key: 'taskDue' as const, label: '任务到期提醒', desc: '即将到期时推送' },
            { key: 'taskCreated' as const, label: '新任务分配', desc: '分配给成员时推送' },
            { key: 'taskCompleted' as const, label: '任务完成', desc: '标记完成时推送' },
            { key: 'goalUpdated' as const, label: '目标进度', desc: '进度变化时推送' },
          ] as const).map(ev => (
            <label key={ev.key} className="flex items-center justify-between py-1 cursor-pointer">
              <div><span className="text-xs font-medium">{ev.label}</span><span className="text-[10px] text-muted-foreground ml-1">{ev.desc}</span></div>
              <button onClick={() => updateEvents(ev.key, !config.notifyEvents[ev.key])} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${config.notifyEvents[ev.key] ? 'bg-green-500' : 'bg-gray-200'}`}><span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${config.notifyEvents[ev.key] ? 'translate-x-4' : 'translate-x-0.5'}`} /></button>
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <button onClick={handleTest} disabled={!isReady || testResult === 'sending'} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-border hover:bg-muted disabled:opacity-50 transition-colors">{testResult === 'sending' ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}{testResult === 'success' ? '发送成功!' : testResult === 'error' ? '发送失败' : '发送测试消息'}</button>
        {testResult === 'error' && testError && <div className="text-[10px] text-red-500 mt-1 max-w-[200px] truncate" title={testError}>{testError}</div>}
        <button onClick={sendDigest} disabled={!isReady || digestResult === 'sending'} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-border hover:bg-muted disabled:opacity-50 transition-colors">{digestResult === 'sending' ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}{digestResult === 'success' ? '发送成功!' : digestResult === 'error' ? '发送失败' : '发送今日摘要'}</button>
      </div>
    </div>
  );
}

function EmailSection() {
  const [config, setConfig] = useState<EmailConfig>(loadEmailConfig());

  function update(partial: Partial<EmailConfig>) { const c = { ...config, ...partial }; setConfig(c); saveEmailConfig(c); }

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${config.enabled ? 'bg-green-50' : 'bg-gray-50'}`}><Mail size={18} className={config.enabled ? 'text-green-600' : 'text-gray-400'} /></div><div><div className="font-semibold text-sm">每日邮件推送</div><div className={`text-xs ${config.enabled ? 'text-green-600' : 'text-muted-foreground'}`}>{config.enabled ? '已启用 - 每日7点推送个人业务现况' : '未启用'}</div></div></div>
        <button onClick={() => update({ enabled: !config.enabled })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.enabled ? 'bg-green-500' : 'bg-gray-200'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`} /></button>
      </div>
      <div className="text-xs text-muted-foreground">每日7点按邮箱向各成员推送个人业务现况，由服务端定时任务执行，前端仅存储配置。</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium mb-1">SMTP 服务器</label><input className={inputCls} placeholder="smtp.example.com" value={config.smtpHost} onChange={e => update({ smtpHost: e.target.value })} /></div>
        <div><label className="block text-xs font-medium mb-1">端口</label><input type="number" className={inputCls} placeholder="587" value={config.smtpPort} onChange={e => update({ smtpPort: parseInt(e.target.value) || 587 })} /></div>
        <div><label className="block text-xs font-medium mb-1">SMTP 用户名</label><input className={inputCls} placeholder="user@example.com" value={config.smtpUser} onChange={e => update({ smtpUser: e.target.value })} /></div>
        <div><label className="block text-xs font-medium mb-1">SMTP 密码</label><input type="password" className={inputCls} placeholder="密码" value={config.smtpPass} onChange={e => update({ smtpPass: e.target.value })} /></div>
        <div className="md:col-span-2"><label className="block text-xs font-medium mb-1">发件人邮箱</label><input className={inputCls} placeholder="noreply@example.com" value={config.fromEmail} onChange={e => update({ fromEmail: e.target.value })} /></div>
      </div>
    </div>
  );
}

function DataStatsSection() {
  const { goals, projects, tasks, members } = useStore().state;
  const dispatch = useStore().dispatch;
  const activeGoals = goals.filter(g => g.status === 'in_progress').length;
  const completedGoals = goals.filter(g => g.status === 'completed').length;
  const activeProjects = projects.filter(p => p.status === 'in_progress').length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-5">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Database size={14} className="text-primary" /> 当前数据</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '成员', value: members.length, sub: `${members.filter(m => m.status === 'active').length} 活跃` },
          { label: '目标', value: goals.length, sub: `${activeGoals} 进行中 / ${completedGoals} 完成` },
          { label: '项目', value: projects.length, sub: `${activeProjects} 进行中` },
          { label: '任务', value: tasks.length, sub: `${doneTasks} 已完成` },
        ].map((s, i) => (
          <div key={i} className="bg-muted/50 rounded-lg p-2.5 text-center"><div className="text-lg font-bold">{s.value}</div><div className="text-[10px] text-muted-foreground">{s.label}</div><div className="text-[10px] text-muted-foreground/60">{s.sub}</div></div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-border"><button onClick={() => { const data = generateAllData(); dispatch({ type: 'RESET_DATA', payload: { ...data, currentUser: data.members[0] } }); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><RefreshCw size={12} /> 重新生成本地数据</button></div>
    </div>
  );
}

function BackupSection() {
  const backupData = useBackupExport();
  const dispatch = useStore().dispatch;
  const [importStatus, setImportStatus] = useState<'idle' | 'confirming' | 'importing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [exporting, setExporting] = useState(false);
  const [autoExport, setAutoExport] = useState(false);
  const stateRef = useRef(backupData);
  stateRef.current = backupData;

  const handleExport = useCallback(() => {
    setExporting(true);
    setTimeout(() => {
      try {
        const buf = exportToExcel(stateRef.current);
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        a.href = url; a.download = `team-business-hub-backup-${date}.xlsx`;
        a.click(); URL.revokeObjectURL(url);
      } catch (e: any) { setErrorMsg('导出失败: ' + e.message); setImportStatus('error'); setTimeout(() => setImportStatus('idle'), 3000); }
      setExporting(false);
    }, 50);
  }, []);

  useEffect(() => { if (!autoExport) return; const interval = setInterval(() => { const now = new Date(); if (now.getHours() === 17 && now.getMinutes() === 0) handleExport(); }, 60000); return () => clearInterval(interval); }, [autoExport, handleExport]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    if (isExcel) {
      reader.onload = () => {
        try {
          const backup = importFromExcel(reader.result as ArrayBuffer);
          if (!backup) { setErrorMsg('Excel文件格式不正确'); setImportStatus('error'); setTimeout(() => setImportStatus('idle'), 3000); return; }
          setImportStatus('confirming');
          (window as unknown as { __pendingBackup: BackupData }).__pendingBackup = backup;
        } catch { setErrorMsg('无法解析Excel文件'); setImportStatus('error'); setTimeout(() => setImportStatus('idle'), 3000); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = () => {
        try {
          const backup = importFromJSON(reader.result as string);
          if (!backup) { setErrorMsg('JSON文件结构不完整'); setImportStatus('error'); setTimeout(() => setImportStatus('idle'), 3000); return; }
          setImportStatus('confirming');
          (window as unknown as { __pendingBackup: BackupData }).__pendingBackup = backup;
        } catch { setErrorMsg('无法解析文件'); setImportStatus('error'); setTimeout(() => setImportStatus('idle'), 3000); }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  }

  function handleConfirmImport() { setImportStatus('importing'); const backup = (window as unknown as { __pendingBackup: BackupData }).__pendingBackup; setTimeout(() => { dispatch({ type: 'IMPORT_BACKUP', payload: backup }); setImportStatus('success'); setTimeout(() => setImportStatus('idle'), 3000); }, 500); }

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-5">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Database size={14} className="text-primary" /> 数据备份与恢复</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1"><div><span className="text-xs font-medium">每日17:00自动导出</span><span className="text-[10px] text-muted-foreground ml-1">开启后每天整点自动下载备份</span></div><button onClick={() => setAutoExport(!autoExport)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoExport ? 'bg-green-500' : 'bg-gray-200'}`}><span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${autoExport ? 'translate-x-4' : 'translate-x-0.5'}`} /></button></div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-border hover:bg-muted transition-colors disabled:opacity-50">{exporting ? '导出中...' : <><Download size={12} /> 导出备份（Excel）</>}</button>
          <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-border hover:bg-muted transition-colors cursor-pointer"><Upload size={12} /> 导入恢复<input type="file" accept=".xlsx,.xls,.json" className="hidden" onChange={handleFileSelect} /></label>
        </div>
        {importStatus === 'confirming' && <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-2"><p className="font-medium text-amber-800">确认导入？当前数据将被覆盖。</p><div className="flex gap-2"><button onClick={handleConfirmImport} className="flex items-center gap-1 px-3 py-1.5 rounded bg-amber-600 text-white text-xs hover:bg-amber-700">确认导入</button><button onClick={() => setImportStatus('idle')} className="flex items-center gap-1 px-3 py-1.5 rounded border border-border text-xs hover:bg-muted">取消</button></div></div>}
        {importStatus === 'importing' && <div className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> 正在导入...</div>}
        {importStatus === 'success' && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-medium">导入成功！数据已恢复。</div>}
        {importStatus === 'error' && errorMsg && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{errorMsg}</div>}
        <div className="pt-2 border-t border-border"><button onClick={() => { const data = generateAllData(); dispatch({ type: 'RESET_DATA', payload: { ...data, currentUser: data.members[0] } }); }} className="text-xs text-destructive hover:underline flex items-center gap-1"><Trash2 size={12} /> 清空所有数据</button></div>
      </div>
    </div>
  );
}

function TagsCategoriesSection() {
  const { tags, categories } = useStore().state;
  const dispatch = useStore().dispatch;
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#8b5cf6');
  const [newCatApplies, setNewCatApplies] = useState<string[]>(['goal', 'project', 'task']);
  const [openSection, setOpenSection] = useState<'tags' | 'categories' | null>(null);
  const tagPresets = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#6366f1'];

  function addTag() { if (!newTagName.trim()) return; dispatch({ type: 'ADD_TAG', payload: { name: newTagName.trim(), color: newTagColor } }); setNewTagName(''); }
  function deleteTag(id: string) { dispatch({ type: 'DELETE_TAG', payload: id }); }
  function addCategory() { if (!newCatName.trim()) return; dispatch({ type: 'ADD_CATEGORY', payload: { name: newCatName.trim(), color: newCatColor, icon: 'tag', appliesTo: newCatApplies } }); setNewCatName(''); }
  function deleteCat(id: string) { dispatch({ type: 'DELETE_CATEGORY', payload: id }); }

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm p-5 space-y-4">
      <h3 className="font-semibold text-sm flex items-center gap-2"><TagIcon size={16} /> 标签与分类管理</h3>
      <div>
        <button onClick={() => setOpenSection(openSection === 'tags' ? null : 'tags')} className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"><span className="text-sm font-medium">标签管理</span><ChevronDown size={14} className={`transition-transform ${openSection === 'tags' ? 'rotate-180' : ''}`} /></button>
        {openSection === 'tags' && (
          <div className="mt-2 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input type="text" className="flex-1 min-w-[100px] border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="标签名称" value={newTagName} onChange={e => setNewTagName(e.target.value)} />
              <div className="flex gap-1">{tagPresets.map(c => <button key={c} onClick={() => setNewTagColor(c)} className={`w-6 h-6 rounded-full border-2 ${newTagColor === c ? 'ring-2 ring-primary' : ''}`} style={{ backgroundColor: c }} />)}</div>
              <button onClick={addTag} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">添加</button>
            </div>
            <div className="flex flex-wrap gap-1.5">{tags.map(tag => <span key={tag.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium" style={{ backgroundColor: tag.color + '15', color: tag.color }}>{tag.name}<button className="hover:opacity-60 ml-0.5" onClick={() => deleteTag(tag.id)}>x</button></span>)}{tags.length === 0 && <span className="text-xs text-muted-foreground">暂无标签</span>}</div>
          </div>
        )}
      </div>
      <div>
        <button onClick={() => setOpenSection(openSection === 'categories' ? null : 'categories')} className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"><span className="text-sm font-medium">分类管理</span><ChevronDown size={14} className={`transition-transform ${openSection === 'categories' ? 'rotate-180' : ''}`} /></button>
        {openSection === 'categories' && (
          <div className="mt-2 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input type="text" className="flex-1 min-w-[100px] border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="分类名称" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
              <div className="flex gap-1">{tagPresets.map(c => <button key={c} onClick={() => setNewCatColor(c)} className={`w-6 h-6 rounded-full border-2 ${newCatColor === c ? 'ring-2 ring-primary' : ''}`} style={{ backgroundColor: c }} />)}</div>
              <div className="flex flex-wrap gap-1">{(['goal', 'project', 'task'] as const).map(t => <button key={t} onClick={() => setNewCatApplies(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} className={`px-2 py-1 text-[11px] rounded border ${newCatApplies.includes(t) ? 'bg-primary/10 text-primary border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>{t === 'goal' ? '目标' : t === 'project' ? '项目' : '任务'}</button>)}</div>
              <button onClick={addCategory} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">添加</button>
            </div>
            <div className="flex flex-wrap gap-1.5">{categories.map(cat => <span key={cat.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium" style={{ backgroundColor: cat.color + '15', color: cat.color }}>{cat.name}<span className="opacity-60">{(cat.appliesTo || []).map(a => a === 'goal' ? '目标' : a === 'project' ? '项目' : '任务').join(',')}</span><button className="hover:opacity-60 ml-0.5" onClick={() => deleteCat(cat.id)}>x</button></span>)}{categories.length === 0 && <span className="text-xs text-muted-foreground">暂无分类</span>}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SettingsTab() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div><h2 className="text-lg font-bold flex items-center gap-2"><SettingsIcon size={20} /> 系统设置</h2><p className="text-sm text-muted-foreground mt-0.5">配置云端同步、通知和备份</p></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SupabaseSection />
        <WeChatSection />
      </div>
      <EmailSection />
      <TagsCategoriesSection />
      <DataStatsSection />
      <BackupSection />
    </div>
  );
}
