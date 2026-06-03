import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { useBackupExport } from '@/store/hooks';
import { loadWeChatConfig, saveWeChatConfig, sendWeChatMessage, testChannel, formatDailyDigest, type WeChatConfig, type NotifyChannel, getLastTestError, setLastTestError } from '@/supabase/wechat';
import { generateAllData } from '@/data/dataGenerator';
import type { BackupData } from '@/types';
import {
  Settings as SettingsIcon, MessageSquare, Send, Bell,
  Cloud, CloudOff, Loader2, RefreshCw, Check, ArrowRight, AlertCircle,
  Database, Download, Upload, Copy, Mail, Trash2, ChevronDown,
  Tag as TagIcon,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { handleError } from '@/lib/errorHandler';
import { inputCls, loadEmailConfig, saveEmailConfig } from './constants';
import type { EmailConfig } from './constants';
import { sendTestEmail, isEmailEnabled, getLastEmailError, setLastEmailError } from '@/supabase/email';
import { AISettingsSection } from './AISettingsSection';

function SupabaseSection() {
  const store = useStore();
  const { connectionMode, connectSupabase: doConnect, disconnectSupabase, initializeSupabaseData, connectionError } = store;
  const { goals = [], projects = [], tasks = [], members = [] } = store.state || {};
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState(connectionMode === 'supabase' ? 3 : 1);

  const statusConfig: Record<string, { color: string; label: string }> = { local: { color: 'text-gray-500', label: '本地模式（数据仅存本机）' }, supabase: { color: 'text-green-600', label: '云端同步中（团队成员实时共享）' }, loading: { color: 'text-amber-500', label: '连接中...' } };
  const st = statusConfig[connectionMode];

  async function handleConnect() { if (!url.trim() || !anonKey.trim()) return; setConnecting(true); try { const success = await doConnect(url.trim(), anonKey.trim()); if (success) setStep(2); } catch (e: unknown) { console.error('连接失败:', e); } setConnecting(false); }
  async function handleInitData() { setInitializing(true); try { await initializeSupabaseData(); setStep(3); } catch (e: unknown) { console.error('初始化失败:', e); } setInitializing(false); }
  function handleDisconnect() { disconnectSupabase(); setStep(1); setUrl(''); setAnonKey(''); }
  function handleCopy() { const el = document.getElementById('admin-schema-text'); if (el) { navigator.clipboard.writeText(el.textContent || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); } }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-5">
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
            <button onClick={handleCopy} className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-card border border-border hover:bg-muted">{copied ? <><Check size={10} className="text-green-600" /> 已复制</> : <><Copy size={10} /> 复制</>}</button>
            <pre id="admin-schema-text" className="bg-gray-900 text-gray-100 rounded-lg p-3 text-[10px] font-mono max-h-48 overflow-auto whitespace-pre select-all leading-relaxed">{`create extension if not exists "uuid-ossp";
create table if not exists members (id text primary key default gen_random_uuid()::text, name text not null, role text not null default 'member', department text not null, avatar text not null, email text not null, status text not null default 'active', join_date text not null, created_at timestamptz default now());
create table if not exists goals (id text primary key default gen_random_uuid()::text, title text not null, description text, type text not null default 'okr', status text not null default 'todo', parent_id text references goals(id) on delete cascade, level int not null default 0, start_date text not null, end_date text not null, owner_id text, key_results jsonb default '[]'::jsonb, progress int not null default 0, created_at timestamptz default now(), updated_at timestamptz default now(), leader_id text, supporter_ids jsonb default '[]'::jsonb, canvas_x float, canvas_y float, priority text not null default 'medium', tags jsonb default '[]'::jsonb, category text default '', repeat_cycle text not null default 'none', discussion_thread_id text, summary text default '', tracking_records jsonb default '[]'::jsonb, attachments jsonb default '[]'::jsonb, selected_kr_ids jsonb default '[]'::jsonb);
create table if not exists projects (id text primary key default gen_random_uuid()::text, title text not null, description text, goal_id text references goals(id), status text not null default 'todo', start_date text not null, end_date text not null, owner_id text, member_ids jsonb default '[]'::jsonb, task_count int not null default 0, progress int not null default 0, created_at timestamptz default now(), updated_at timestamptz default now(), leader_id text, supporter_ids jsonb default '[]'::jsonb, parent_id text, canvas_x float, canvas_y float, priority text not null default 'medium', tags jsonb default '[]'::jsonb, category text default '', repeat_cycle text not null default 'none', discussion_thread_id text, summary text default '', tracking_records jsonb default '[]'::jsonb, attachments jsonb default '[]'::jsonb);
create table if not exists tasks (id text primary key default gen_random_uuid()::text, title text not null, description text, project_id text, goal_id text, status text not null default 'todo', priority text not null default 'medium', assignee_id text, owner_id text, due_date text, reminder_date text, completed_at timestamptz, subtasks jsonb default '[]'::jsonb, tags jsonb default '[]'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), leader_id text, supporter_ids jsonb default '[]'::jsonb, canvas_x float, canvas_y float, parent_id text, category text default '', repeat_cycle text not null default 'none', discussion_thread_id text, summary text default '', tracking_records jsonb default '[]'::jsonb, attachments jsonb default '[]'::jsonb, blocked_by jsonb default '[]'::jsonb, sprint_id text);
create table if not exists notifications (id text primary key default gen_random_uuid()::text, type text not null, title text not null, message text not null, related_id text not null, related_type text not null, member_id text, read boolean not null default false, created_at timestamptz default now());
create table if not exists activities (id text primary key default gen_random_uuid()::text, member_id text, action text not null, target_type text not null, target_id text not null, target_title text not null, details text, created_at timestamptz default now());
create table if not exists item_links (id text primary key default gen_random_uuid()::text, source_id text not null, source_type text not null, target_id text not null, target_type text not null, label text, created_at timestamptz default now());
create table if not exists reviews (id text primary key default gen_random_uuid()::text, period text not null, period_start text, period_end text, member_id text, content text, improvements text, metrics jsonb default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists categories (id text primary key default gen_random_uuid()::text, name text not null, color text not null default '#6366f1', icon text not null default 'tag', applies_to jsonb default '[]'::jsonb, created_at timestamptz default now());
create table if not exists tags (id text primary key default gen_random_uuid()::text, name text not null, color text not null default '#6366f1', created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists templates (id text primary key default gen_random_uuid()::text, title text not null, description text, type text, content jsonb default '{}'::jsonb, created_by text, updated_by text, is_public boolean default true, category text, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists schedule_events (id text primary key default gen_random_uuid()::text, title text not null, description text, start_date text not null, end_date text not null, all_day boolean default false, color text, linked_item_id text, linked_item_type text, member_id text, repeat_cycle text default 'none', created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists notes (id text primary key default gen_random_uuid()::text, title text not null, content text, folder text default '', color text default '', is_pinned boolean default false, linked_item_id text, linked_item_type text, created_by text, updated_by text, created_at timestamptz default now(), updated_at timestamptz default now(), category text default '', tags jsonb default '[]'::jsonb);
create table if not exists comments (id text primary key default gen_random_uuid()::text, item_id text not null, item_type text not null, member_id text, member_name text, content text not null, mentioned_member_ids jsonb default '[]'::jsonb, is_read boolean default false, follow_up_required boolean default false, follow_up_status text default 'none', created_at timestamptz default now());
create table if not exists bookmarks (id text primary key default gen_random_uuid()::text, title text not null, url text not null, category text, icon text, "order" int default 0, created_at timestamptz default now());
create table if not exists saved_views (id text primary key default gen_random_uuid()::text, name text not null, type text not null, filters jsonb default '[]'::jsonb, filter_logic text default 'and', created_at timestamptz default now());
create table if not exists status_flow_rules (id text primary key default gen_random_uuid()::text, from_status text not null, to_status text not null, allowed_roles jsonb default '[]'::jsonb, auto_actions jsonb default '[]'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists automation_rules (id text primary key default gen_random_uuid()::text, name text not null, enabled boolean default true, item_type text not null, trigger text not null, condition jsonb default '{}'::jsonb, actions jsonb default '[]'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists sprints (id text primary key default gen_random_uuid()::text, name text not null, start_date text not null, end_date text not null, goal_ids jsonb default '[]'::jsonb, status text not null default 'planning', created_at timestamptz default now(), updated_at timestamptz default now());
alter table members enable row level security; alter table goals enable row level security; alter table projects enable row level security; alter table tasks enable row level security; alter table notifications enable row level security; alter table activities enable row level security; alter table item_links enable row level security; alter table reviews enable row level security; alter table categories enable row level security; alter table tags enable row level security; alter table templates enable row level security; alter table schedule_events enable row level security; alter table notes enable row level security; alter table comments enable row level security; alter table bookmarks enable row level security; alter table saved_views enable row level security; alter table status_flow_rules enable row level security; alter table automation_rules enable row level security; alter table sprints enable row level security;
create policy "Allow all" on members for all using (true) with check (true);
create policy "Allow all" on goals for all using (true) with check (true);
create policy "Allow all" on projects for all using (true) with check (true);
create policy "Allow all" on tasks for all using (true) with check (true);
create policy "Allow all" on notifications for all using (true) with check (true);
create policy "Allow all" on activities for all using (true) with check (true);
create policy "Allow all" on item_links for all using (true) with check (true);
create policy "Allow all" on reviews for all using (true) with check (true);
create policy "Allow all" on categories for all using (true) with check (true);
create policy "Allow all" on tags for all using (true) with check (true);
create policy "Allow all" on templates for all using (true) with check (true);
create policy "Allow all" on schedule_events for all using (true) with check (true);
create policy "Allow all" on notes for all using (true) with check (true);
create policy "Allow all" on comments for all using (true) with check (true);
create policy "Allow all" on bookmarks for all using (true) with check (true);
create policy "Allow all" on saved_views for all using (true) with check (true);
alter publication supabase_realtime add table goals;
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table activities;
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table templates;
alter publication supabase_realtime add table schedule_events;
alter publication supabase_realtime add table bookmarks;
alter publication supabase_realtime add table saved_views;
alter publication supabase_realtime add table reviews;
alter publication supabase_realtime add table knowledge;
alter publication supabase_realtime add table tags;
alter publication supabase_realtime add table sprints;
alter publication supabase_realtime add table automation_rules;
alter publication supabase_realtime add table status_flow_rules;
alter publication supabase_realtime add table item_links;
alter publication supabase_realtime add table comments;`}</pre>
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
  const { tasks = [], members = [] } = useStore().state || {};
  const [config, setConfig] = useState<WeChatConfig>(loadWeChatConfig());
  const [testResult, setTestResult] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [digestResult, setDigestResult] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState(getLastTestError());

  function updateConfig(partial: Partial<WeChatConfig>) {
    setConfig(prev => {
      const newConfig = { ...prev, ...partial };
      saveWeChatConfig(newConfig);
      return newConfig;
    });
  }
  function updateChannel(ch: NotifyChannel) { updateConfig({ channel: ch }); }

  const isReady = config.channel === 'server_chan' ? !!config.serverChan.sendKey : !!config.workWechat.webhookUrl;

  async function handleTest() {
    setTestResult('sending');
    try { const ok = await testChannel(config.channel, config); setTestResult(ok ? 'success' : 'error'); if (!ok) setLastTestError('发送失败，请检查配置'); } catch (e: unknown) { setTestResult('error'); setLastTestError(e instanceof Error ? e.message : '发送失败'); }
    setTimeout(() => setTestResult('idle'), 5000);
  }

  async function sendDigest() {
    setDigestResult('sending');
    try {
      const today = new Date().toISOString().split('T')[0];
      const overdueTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate && t.dueDate < today).map(t => ({ title: t.title, assignee: members.find(m => m.id === t.leaderId)?.name || '未知', dueDate: t.dueDate!, priority: t.priority }));
      const todayDueTasks = tasks.filter(t => t.status !== 'done' && t.dueDate === today).map(t => ({ title: t.title, assignee: members.find(m => m.id === t.leaderId)?.name || '未知' }));
      const ok = await sendWeChatMessage(formatDailyDigest({ overdueTasks, todayDueTasks, todayCompleted: tasks.filter(t => t.completedAt && t.completedAt.startsWith(today)).length, totalActive: tasks.filter(t => t.status === 'in_progress').length }));
      setDigestResult(ok ? 'success' : 'error');
    } catch (e: unknown) {
      setDigestResult('error');
      setLastTestError(e instanceof Error ? e.message : '发送失败');
    }
    setTimeout(() => setDigestResult('idle'), 3000);
  }

  // 定时自动发送
  useEffect(() => {
    if (!config.autoSend || !config.enabled || !isReady) return;
    const [hour, minute] = (config.autoSendTime || '08:00').split(':').map(Number);
    let lastSendDate = '';
    const interval = setInterval(() => {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      if (now.getHours() === hour && now.getMinutes() === minute && lastSendDate !== today) {
        lastSendDate = today;
        sendDigest();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [config.autoSend, config.enabled, config.autoSendTime, isReady]);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${config.enabled && isReady ? 'bg-green-50' : 'bg-gray-50'}`}><MessageSquare size={18} className={config.enabled && isReady ? 'text-green-600' : 'text-gray-400'} /></div>
          <div><div className="font-semibold text-sm">微信通知</div><div className={`text-xs ${config.enabled && isReady ? 'text-green-600' : 'text-muted-foreground'}`}>{config.enabled && isReady ? `已启用 - ${config.channel === 'server_chan' ? 'Server酱' : '企业微信群'}接收通知` : '未启用'}</div></div>
        </div>
        <button onClick={() => updateConfig({ enabled: !config.enabled })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.enabled ? 'bg-green-500' : 'bg-gray-200'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`} /></button>
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
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1"><div><span className="text-xs font-medium">定时自动发送摘要</span><span className="text-[10px] text-muted-foreground ml-1">每天定时推送任务摘要</span></div><button onClick={() => updateConfig({ autoSend: !config.autoSend })} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${config.autoSend ? 'bg-green-500' : 'bg-gray-200'}`}><span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-card transition-transform ${config.autoSend ? 'translate-x-4' : 'translate-x-0.5'}`} /></button></div>
        {config.autoSend && <div className="flex items-center gap-2 px-1"><label className="text-xs text-muted-foreground">发送时间</label><input type="time" value={config.autoSendTime || '08:00'} onChange={e => updateConfig({ autoSendTime: e.target.value })} className="border border-border rounded px-2 py-1 text-xs" /></div>}
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
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');

  function update(partial: Partial<EmailConfig>) { const c = { ...config, ...partial }; setConfig(c); saveEmailConfig(c); }

  async function handleTestEmail() {
    if (!config.fromEmail) { setTestResult('error'); setLastEmailError('请先填写收件人邮箱'); return; }
    if (!config.resendApiKey) { setTestResult('error'); setLastEmailError('请先填写 Resend API Key'); return; }
    setTesting(true);
    setTestResult('idle');
    try {
      const ok = await sendTestEmail(config.fromEmail);
      if (ok) { setTestResult('success'); setLastEmailError(''); }
      else { setTestResult('error'); setLastEmailError('邮件发送请求已提交但未确认成功，请检查邮箱'); }
    } catch (e: unknown) {
      setTestResult('error');
      setLastEmailError(e instanceof Error ? e.message : '邮件发送失败');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${config.enabled ? 'bg-green-50' : 'bg-gray-50'}`}><Mail size={18} className={config.enabled ? 'text-green-600' : 'text-gray-400'} /></div><div><div className="font-semibold text-sm">每日邮件推送</div><div className={`text-xs ${config.enabled ? 'text-green-600' : 'text-muted-foreground'}`}>{config.enabled ? '已启用 - 每日定时推送个人业务现况' : '未启用'}</div></div></div>
        <button onClick={() => update({ enabled: !config.enabled })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.enabled ? 'bg-green-500' : 'bg-gray-200'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`} /></button>
      </div>
      <div className="text-xs text-muted-foreground">每日定时按邮箱向各成员推送个人业务现况。使用 <a href="https://resend.com" target="_blank" rel="noopener" className="text-primary underline">Resend</a> 邮件服务（免费100封/天）。注册后获取 API Key 填入即可。</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2"><label className="block text-xs font-medium mb-1">Resend API Key</label><input type="password" className={inputCls} placeholder="re_xxxxxxxxxxxx" value={config.resendApiKey} onChange={e => update({ resendApiKey: e.target.value })} /></div>
        <div className="md:col-span-2"><label className="block text-xs font-medium mb-1">发件人邮箱（需在 Resend 中已验证的域名邮箱）</label><input className={inputCls} placeholder="noreply@yourdomain.com" value={config.fromEmail} onChange={e => update({ fromEmail: e.target.value })} /></div>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5" onClick={handleTestEmail} disabled={testing || !config.enabled || !config.resendApiKey}>
          {testing ? <><Loader2 size={12} className="animate-spin" /> 发送中...</> : <><Send size={12} /> 发送测试邮件</>}
        </button>
        {testResult === 'success' && <span className="text-xs text-green-600 flex items-center gap-1"><Check size={12} /> 发送成功</span>}
        {testResult === 'error' && <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12} /> {getLastEmailError() || '发送失败'}</span>}
      </div>
    </div>
  );
}

function DataStatsSection() {
  const { state, dispatch } = useStore();
  const goals = state.goals || [];
  const projects = state.projects || [];
  const tasks = state.tasks || [];
  const members = state.members || [];
  const activeGoals = goals.filter(g => g.status === 'in_progress').length;
  const completedGoals = goals.filter(g => g.status === 'done').length;
  const activeProjects = projects.filter(p => p.status === 'in_progress').length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-5">
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
  const { dispatch } = useStore();
  const [importStatus, setImportStatus] = useState<'idle' | 'confirming' | 'importing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [exporting, setExporting] = useState(false);
  const [autoExport, setAutoExport] = useState(() => {
    try { return localStorage.getItem('tbh-auto-export') === 'true'; } catch (e) { handleError(e, { module: 'SettingsTab', operation: 'READ_AUTO_EXPORT', severity: 'debug' }); return false; }
  });
  const stateRef = useRef(backupData);
  stateRef.current = backupData;
  const pendingBackupRef = useRef<BackupData | null>(null);

  const handleExport = useCallback(() => {
    setExporting(true);
    setTimeout(async () => {
      try {
        const { exportToExcel } = await import('@/lib/excelBackup');
        const buf = exportToExcel(stateRef.current);
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        a.href = url; a.download = `team-business-hub-backup-${date}.xlsx`;
        a.click(); URL.revokeObjectURL(url);
      } catch (e: unknown) { setErrorMsg('导出失败: ' + (e instanceof Error ? e.message : String(e))); setImportStatus('error'); setTimeout(() => setImportStatus('idle'), 3000); }
      setExporting(false);
    }, 50);
  }, []);

  useEffect(() => { if (!autoExport) return; let lastExportDate = ''; const interval = setInterval(() => { const now = new Date(); const today = now.toISOString().split('T')[0]; if (now.getHours() === 17 && now.getMinutes() === 0 && lastExportDate !== today) { lastExportDate = today; handleExport(); } }, 60000); return () => clearInterval(interval); }, [autoExport, handleExport]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    if (isExcel) {
      reader.onload = async () => {
        try {
          const { importFromExcel } = await import('@/lib/excelBackup');
          const backup = importFromExcel(reader.result as ArrayBuffer);
          if (!backup) { setErrorMsg('Excel文件格式不正确'); setImportStatus('error'); setTimeout(() => setImportStatus('idle'), 3000); return; }
          setImportStatus('confirming');
          pendingBackupRef.current = backup;
        } catch (e) { handleError(e, { module: 'SettingsTab', operation: 'IMPORT_EXCEL', severity: 'warn' }); setErrorMsg('无法解析Excel文件'); setImportStatus('error'); setTimeout(() => setImportStatus('idle'), 3000); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = async () => {
        try {
          const { importFromJSON } = await import('@/lib/excelBackup');
          const backup = importFromJSON(reader.result as string);
          if (!backup) { setErrorMsg('JSON文件结构不完整'); setImportStatus('error'); setTimeout(() => setImportStatus('idle'), 3000); return; }
          setImportStatus('confirming');
          pendingBackupRef.current = backup;
        } catch (e) { handleError(e, { module: 'SettingsTab', operation: 'IMPORT_JSON', severity: 'warn' }); setErrorMsg('无法解析文件'); setImportStatus('error'); setTimeout(() => setImportStatus('idle'), 3000); }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  }

  function handleConfirmImport() { const backup = pendingBackupRef.current; if (!backup) return; setImportStatus('importing'); setTimeout(() => { dispatch({ type: 'IMPORT_BACKUP', payload: backup }); setImportStatus('success'); setTimeout(() => setImportStatus('idle'), 3000); }, 500); }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-5">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Database size={14} className="text-primary" /> 数据备份与恢复</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1"><div><span className="text-xs font-medium">每日17:00自动导出</span><span className="text-[10px] text-muted-foreground ml-1">开启后每天整点自动下载备份</span></div><button onClick={() => { const next = !autoExport; setAutoExport(next); try { localStorage.setItem('tbh-auto-export', String(next)); } catch (e) { handleError(e, { module: 'SettingsTab', operation: 'SAVE_AUTO_EXPORT', severity: 'debug' }); } }} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoExport ? 'bg-green-500' : 'bg-gray-200'}`}><span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-card transition-transform ${autoExport ? 'translate-x-4' : 'translate-x-0.5'}`} /></button></div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-border hover:bg-muted transition-colors disabled:opacity-50">{exporting ? '导出中...' : <><Download size={12} /> 导出备份（Excel）</>}</button>
          <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-border hover:bg-muted transition-colors cursor-pointer"><Upload size={12} /> 导入恢复<input type="file" accept=".xlsx,.xls,.json" className="hidden" onChange={handleFileSelect} /></label>
        </div>
        {importStatus === 'confirming' && <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-2"><p className="font-medium text-amber-800">确认导入？当前数据将被覆盖。</p><div className="flex gap-2"><button onClick={handleConfirmImport} className="flex items-center gap-1 px-3 py-1.5 rounded bg-amber-600 text-white text-xs hover:bg-amber-700">确认导入</button><button onClick={() => setImportStatus('idle')} className="flex items-center gap-1 px-3 py-1.5 rounded border border-border text-xs hover:bg-muted">取消</button></div></div>}
        {importStatus === 'importing' && <div className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> 正在导入...</div>}
        {importStatus === 'success' && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-medium">导入成功！数据已恢复。</div>}
        {importStatus === 'error' && errorMsg && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{errorMsg}</div>}
         <div className="pt-2 border-t border-border"><button onClick={() => { if (!confirm('确认清空所有数据？此操作不可撤销！')) return; try { const data = generateAllData(); dispatch({ type: 'RESET_DATA', payload: { ...data, currentUser: data.members[0] } }); } catch (e) { console.error('Reset data failed:', e); } }} className="text-xs text-destructive hover:underline flex items-center gap-1"><Trash2 size={12} /> 清空所有数据</button></div>
      </div>
    </div>
  );
}

function TagsCategoriesSection() {
  const { state, dispatch } = useStore();
  const tags = state.tags ?? [];
  const categories = state.categories || [];
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#8b5cf6');
  const [newCatApplies, setNewCatApplies] = useState<string[]>(['goal', 'project', 'task']);
  const [openSection, setOpenSection] = useState<'tags' | 'categories' | null>(null);
  const tagPresets = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#6366f1'];

  function addTag() { if (!newTagName.trim()) return; dispatch({ type: 'ADD_TAG', payload: { name: newTagName.trim(), color: newTagColor } }); setNewTagName(''); }
  function deleteTag(id: string) { if (!confirm('确认删除此标签？')) return; dispatch({ type: 'DELETE_TAG', payload: id }); }
  function addCategory() { if (!newCatName.trim()) return; dispatch({ type: 'ADD_CATEGORY', payload: { name: newCatName.trim(), color: newCatColor, icon: 'tag', appliesTo: newCatApplies } }); setNewCatName(''); }
  function deleteCat(id: string) { if (!confirm('确认删除此分类？')) return; dispatch({ type: 'DELETE_CATEGORY', payload: id }); }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-4">
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
  const { state } = useStore();
  const isAdmin = state.currentUser?.role === 'admin';
  if (!isAdmin) {
    return <div className="p-8 text-center text-muted-foreground text-sm">权限不足：系统设置仅管理员可访问</div>;
  }
  return (
    <div className="space-y-5 animate-fade-in">
      <div><h2 className="text-lg font-bold flex items-center gap-2"><SettingsIcon size={20} /> 系统设置</h2><EmptyState title="配置云端同步、通知和备份" compact /></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SupabaseSection />
        <WeChatSection />
      </div>
      <EmailSection />
      <div className="bg-card rounded-xl border border-border shadow-sm p-5">
        <AISettingsSection />
      </div>
      <TagsCategoriesSection />
      <DataStatsSection />
      <BackupSection />
    </div>
  );
}
