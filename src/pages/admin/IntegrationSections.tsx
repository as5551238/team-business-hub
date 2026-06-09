/**
 * Integration sub-sections extracted from IntegrationsTab
 */
import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { usePermissions } from '@/store/hooks';
import { Code, Webhook, Plus, Trash2, TestTube, CheckCircle2, Copy, ChevronDown, ChevronRight, Key, Eye, EyeOff, Send, Link2, Unlink, Mail, RefreshCw, MessageSquare, Bell } from 'lucide-react';
import { getApiTokens, createApiToken, revokeApiToken, ALL_PERMISSIONS, type ApiToken } from '@/lib/api';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { getPushConfigs, savePushConfigs, pushNotification, type PushConfig, type PushChannel } from '@/lib/pushConnector';
import { initiateOAuth, loadOAuthStatuses, disconnectOAuth, PROVIDER_LABELS, type OAuthProvider } from '@/lib/oauthIntegration';
import { handleError } from '@/lib/errorHandler';
import { loadSettingDBFirst, saveSettingDualWrite } from '@/supabase/teamSettings';
import { connectManualToken, clearToken, getConnectionStatus, type ManualTokenInput } from '@/lib/outlook/tokenManager';
import { fetchCalendarEvents } from '@/lib/outlook/calendarSync';
import { fetchMailSummary } from '@/lib/outlook/mailSync';
import { GraphApiError } from '@/lib/outlook/graphClient';

// ===== Types =====
export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

export const WEBHOOK_EVENTS = [
  { value: 'goal.created', label: '目标创建' },
  { value: 'goal.status_changed', label: '目标状态变更' },
  { value: 'project.created', label: '项目创建' },
  { value: 'project.status_changed', label: '项目状态变更' },
  { value: 'task.created', label: '任务创建' },
  { value: 'task.status_changed', label: '任务状态变更' },
  { value: 'task.completed', label: '任务完成' },
  { value: 'member.joined', label: '成员加入' },
];

export const WEBHOOK_STORAGE_KEY = 'tbh-webhook-endpoints';
export const WEBHOOK_SETTING_KEY = 'webhook_endpoints';

/** Load webhooks from localStorage (sync, for useState init). DB refresh happens via useEffect. */
function loadWebhooksSync(): WebhookEndpoint[] {
  try { const s = localStorage.getItem(WEBHOOK_STORAGE_KEY); return s ? JSON.parse(s) : []; } catch (e) { handleError(e, { module: 'IntegrationsTab', operation: 'LOAD_WEBHOOKS', severity: 'debug' }); return []; }
}
/** Save webhooks to both DB and localStorage (DR-19 dual-write). */
function saveWebhooks(ws: WebhookEndpoint[], teamId: string) {
  saveSettingDualWrite(WEBHOOK_SETTING_KEY, WEBHOOK_STORAGE_KEY, ws, teamId);
}

// ===== Open API Reference =====
export function OpenAPISection() {
  const { state } = useStore();
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  const tables = [
    { name: 'goals', label: '目标', fields: ['id', 'title', 'description', 'type', 'status', 'priority', 'start_date', 'end_date', 'leader_id', 'progress', 'key_results'] },
    { name: 'projects', label: '项目', fields: ['id', 'title', 'description', 'goal_id', 'status', 'priority', 'start_date', 'end_date', 'leader_id', 'progress'] },
    { name: 'tasks', label: '任务', fields: ['id', 'title', 'description', 'project_id', 'goal_id', 'status', 'priority', 'leader_id', 'due_date', 'sprint_id', 'blocked_by'] },
    { name: 'members', label: '成员', fields: ['id', 'name', 'role', 'phone', 'email', 'department', 'status'] },
    { name: 'notifications', label: '通知', fields: ['id', 'type', 'title', 'message', 'member_id', 'read'] },
    { name: 'activities', label: '动态', fields: ['id', 'type', 'member_id', 'item_type', 'item_id', 'description'] },
  ];

  const [copiedField, setCopiedField] = useState('');
  const copyText = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopiedField(field); setTimeout(() => setCopiedField(''), 2000); }).catch(() => {});
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Code size={16} className="text-primary" />
        REST API 接入指南
      </div>
      <p className="text-xs text-muted-foreground">基于 Supabase REST API，外部系统可直接读写业务数据。使用 Publishable Key 进行认证（仅读取权限，写操作需配 RLS 策略）。</p>

      {/* Connection Info */}
      <div className="bg-gray-50 rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">API Base URL</span>
          <button onClick={() => copyText(`${supabaseUrl}/rest/v1`, 'base')} className="text-xs text-primary hover:underline flex items-center gap-1">
            {copiedField === 'base' ? <CheckCircle2 size={12} /> : <Copy size={12} />} 复制
          </button>
        </div>
        <code className="text-xs block bg-card rounded px-2 py-1 border font-mono break-all">{supabaseUrl}/rest/v1</code>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs font-medium">Publishable Key</span>
          <button onClick={() => copyText(publishableKey, 'key')} className="text-xs text-primary hover:underline flex items-center gap-1">
            {copiedField === 'key' ? <CheckCircle2 size={12} /> : <Copy size={12} />} 复制
          </button>
        </div>
        <code className="text-xs block bg-card rounded px-2 py-1 border font-mono break-all">{publishableKey}</code>
      </div>

      {/* Example Request */}
      <div className="bg-gray-50 rounded-lg border p-3 space-y-2">
        <span className="text-xs font-medium">示例：获取进行中的任务</span>
        <pre className="text-[11px] bg-gray-900 text-green-400 rounded p-3 overflow-x-auto font-mono">{`GET ${supabaseUrl}/rest/v1/tasks?status=eq.in_progress

Headers:
  apikey: ${publishableKey}
  Authorization: Bearer ${publishableKey}`}</pre>
      </div>

      {/* Table Reference */}
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">数据表参考</span>
        {tables.map(t => (
          <div key={t.name} className="border rounded-lg overflow-hidden">
            <button className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors" onClick={() => setExpandedTable(expandedTable === t.name ? null : t.name)}>
              {expandedTable === t.name ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="text-sm font-medium">{t.label}</span>
              <code className="text-[11px] text-muted-foreground font-mono">{t.name}</code>
              <span className="text-[10px] text-muted-foreground ml-auto">{t.fields.length} 字段</span>
            </button>
            {expandedTable === t.name && (
              <div className="px-3 pb-2 bg-muted/10">
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {t.fields.map(f => (
                    <code key={f} className="text-[11px] bg-card border rounded px-1.5 py-0.5 font-mono">{f}</code>
                  ))}
                </div>
                <button onClick={() => copyText(`GET ${supabaseUrl}/rest/v1/${t.name}`, `api-${t.name}`)} className="mt-2 text-[11px] text-primary hover:underline flex items-center gap-1">
                  {copiedField === `api-${t.name}` ? <CheckCircle2 size={10} /> : <Copy size={10} />} 复制 {t.name} 接口地址
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* RPC Functions */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-muted-foreground">RPC 函数</span>
        <div className="bg-gray-50 border rounded-lg p-3 space-y-2">
          {[
            { name: 'send_webhook', params: 'p_url, p_body', desc: '代理发送 HTTP POST（绕过 CORS）' },
            { name: 'send_email', params: 'p_to, p_subject, p_html, p_api_key, p_from_email', desc: '代理发送邮件（Resend API）' },
            { name: 'join_team_by_code', params: 'p_invite_code, p_member_id', desc: '通过邀请码加入团队' },
            { name: 'create_team', params: 'p_name, p_owner_id, p_description', desc: '创建新团队' },
          ].map(rpc => (
            <div key={rpc.name}>
              <code className="text-xs font-mono font-medium text-primary">{rpc.name}</code>
              <p className="text-[11px] text-muted-foreground mt-0.5">参数: <code className="font-mono">{rpc.params}</code> — {rpc.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* API Token 管理 */}
      <ApiTokenSection />

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <p className="text-[11px] text-amber-700"><strong>安全提示</strong>：Publishable Key 仅受 RLS 行级安全策略保护。生产环境请配置 Supabase RLS 策略，限制匿名用户可访问的数据范围。切勿泄露 service_role key。</p>
      </div>
    </div>
  );
}

// ===== API Token 管理 =====
export function ApiTokenSection() {
  const [tokens, setTokens] = useState<ApiToken[]>(getApiTokens());
  const [newName, setNewName] = useState('');
  const [newPerms, setNewPerms] = useState<string[]>(['goals:read', 'projects:read', 'tasks:read', 'tasks:write']);
  const [showTokenId, setShowTokenId] = useState<string | null>(null);

  // 按 group 分组的权限选项
  const PERM_GROUPS = ALL_PERMISSIONS.reduce<Record<string, typeof ALL_PERMISSIONS>>((acc, p) => {
    (acc[p.group] ??= []).push(p);
    return acc;
  }, {});

  function handleCreate() {
    if (!newName.trim()) return;
    createApiToken(newName, newPerms);
    setTokens(getApiTokens());
    setNewName('');
  }

  function handleRevoke(id: string) {
    if (!confirm('确认吊销此 API Token？')) return;
    revokeApiToken(id);
    setTokens(getApiTokens());
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Key size={14} /> API Token 管理
      </div>
      <p className="text-[11px] text-muted-foreground">创建 API Token 供外部 Agent 程序化访问平台数据。Token 一经创建无法修改权限，如需变更请吊销后重建。</p>

      {/* 创建 */}
      <div className="bg-gray-50 border rounded-lg p-3 space-y-2">
        <input type="text" className="w-full text-sm border border-input rounded-lg px-3 py-2" placeholder="Token 名称（如：CI 自动化）" value={newName} onChange={e => setNewName(e.target.value)} />
        <div className="space-y-1.5">
          {Object.entries(PERM_GROUPS).map(([group, perms]) => (
            <div key={group}>
              <span className="text-[10px] text-muted-foreground font-medium">{group}</span>
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {perms.map(p => (
                  <button key={p.value} type="button" onClick={() => setNewPerms(prev => prev.includes(p.value) ? prev.filter(v => v !== p.value) : [...prev, p.value])} className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${newPerms.includes(p.value) ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border hover:border-primary/50'} ${p.value === 'admin' ? 'ring-1 ring-amber-300' : ''}`}>{p.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button onClick={handleCreate} disabled={!newName.trim() || newPerms.length === 0} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">创建 Token</button>
      </div>

      {/* 列表 */}
      {tokens.length === 0 && <p className="text-[11px] text-muted-foreground">暂无 API Token</p>}
      {tokens.map(t => (
        <div key={t.id} className="border rounded-lg p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t.name}</span>
            <button onClick={() => handleRevoke(t.id)} className="text-[10px] text-destructive hover:underline">吊销</button>
          </div>
          <div className="flex items-center gap-1.5">
            <code className="text-[11px] font-mono bg-gray-100 rounded px-2 py-0.5 flex-1 truncate">
              {showTokenId === t.id ? t.token : '••••••••••••'}
            </code>
            <button onClick={() => setShowTokenId(showTokenId === t.id ? null : t.id)} className="p-1 hover:bg-muted rounded" aria-label="显示/隐藏令牌">
              {showTokenId === t.id ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
            <button onClick={() => navigator.clipboard.writeText(t.token)} className="p-1 hover:bg-muted rounded" aria-label="复制令牌"><Copy size={12} /></button>
          </div>
          <div className="flex flex-wrap gap-1">
            {t.permissions.map(p => <span key={p} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/5 text-primary border border-primary/20">{p}</span>)}
          </div>
          <span className="text-[10px] text-muted-foreground">创建于 {new Date(t.createdAt).toLocaleDateString('zh-CN')}</span>
        </div>
      ))}
    </div>
  );
}

// ===== Webhook Management =====
export function WebhookSection() {
  const { can } = usePermissions();
  const canManage = can('settings_manage');
  const { state } = useStore();
  const teamId = state.currentTeamId || '';
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>(loadWebhooksSync);

  // DR-19: Refresh from DB on mount
  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    loadSettingDBFirst<WebhookEndpoint[]>(WEBHOOK_SETTING_KEY, WEBHOOK_STORAGE_KEY, teamId).then(v => {
      if (!cancelled && v && v.length > 0) setWebhooks(v);
    });
    return () => { cancelled = true; };
  }, [teamId]);
  const [showForm, setShowForm] = useState(false);
  const [formUrl, setFormUrl] = useState('');
  const [formEvents, setFormEvents] = useState<Set<string>>(new Set(['task.created', 'task.status_changed']));
  const [testResult, setTestResult] = useState<Record<string, 'sending' | 'ok' | 'fail'>>({});

  const addWebhook = useCallback(() => {
    if (!formUrl.trim() || formEvents.size === 0) return;
    const w: WebhookEndpoint = {
      id: `wh-${Date.now()}`,
      url: formUrl.trim(),
      events: Array.from(formEvents),
      active: true,
      createdAt: new Date().toISOString(),
    };
    const next = [...webhooks, w];
    setWebhooks(next);
    saveWebhooks(next, teamId);
    setFormUrl('');
    setFormEvents(new Set(['task.created', 'task.status_changed']));
    setShowForm(false);
  }, [formUrl, formEvents, webhooks]);

  const removeWebhook = useCallback((id: string) => {
    const next = webhooks.filter(w => w.id !== id);
    setWebhooks(next);
    saveWebhooks(next, teamId);
  }, [webhooks, teamId]);

  const toggleWebhook = useCallback((id: string) => {
    const next = webhooks.map(w => w.id === id ? { ...w, active: !w.active } : w);
    setWebhooks(next);
    saveWebhooks(next, teamId);
  }, [webhooks, teamId]);

  const testWebhook = useCallback(async (id: string) => {
    const wh = webhooks.find(w => w.id === id);
    if (!wh) return;
    setTestResult(p => ({ ...p, [id]: 'sending' }));
    try {
      const { getSupabaseClient } = await import('@/supabase/client');
      const sb = getSupabaseClient();
      if (sb) {
        await sb.rpc('send_webhook', {
          p_url: wh.url,
          p_body: JSON.stringify({ event: 'test', timestamp: new Date().toISOString(), message: '团队业务中台 Webhook 测试' }),
        });
        setTestResult(p => ({ ...p, [id]: 'ok' }));
      } else {
        setTestResult(p => ({ ...p, [id]: 'fail' }));
      }
    } catch (e) {
      handleError(e, { module: 'IntegrationsTab', operation: 'TEST_WEBHOOK', severity: 'warn' });
      setTestResult(p => ({ ...p, [id]: 'fail' }));
    }
    setTimeout(() => setTestResult(p => { const n = { ...p }; delete n[id]; return n; }), 3000);
  }, [webhooks]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Webhook size={16} className="text-primary" />
          出站 Webhook
        </div>
        {canManage && (
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus size={14} /> 添加
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">配置 Webhook 端点，当指定事件触发时自动向外部系统推送 JSON 数据。基于 Supabase RPC 代理发送。</p>

      {/* Add Form */}
      {showForm && (
        <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
          <div>
            <label className="text-xs font-medium mb-1 block">Webhook URL *</label>
            <input type="url" className="w-full text-sm border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring" placeholder="https://your-server.com/api/webhook" value={formUrl} onChange={e => setFormUrl(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">订阅事件 *</label>
            <div className="flex flex-wrap gap-1.5">
              {WEBHOOK_EVENTS.map(ev => (
                <button key={ev.value} type="button" onClick={() => setFormEvents(p => { const n = new Set(p); n.has(ev.value) ? n.delete(ev.value) : n.add(ev.value); return n; })} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${formEvents.has(ev.value) ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border hover:border-primary/50'}`}>
                  {ev.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addWebhook} disabled={!formUrl.trim() || formEvents.size === 0} className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">添加</button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted">取消</button>
          </div>
        </div>
      )}

      {/* Webhook List */}
      {webhooks.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-xs">暂无 Webhook 端点，点击「添加」创建</div>
      ) : (
        <div className="space-y-2">
          {webhooks.map(wh => (
            <div key={wh.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleWebhook(wh.id)} className={`w-8 h-4 rounded-full transition-colors relative ${wh.active ? 'bg-primary' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-card transition-transform ${wh.active ? 'left-4' : 'left-0.5'}`} />
                  </button>
                  <code className="text-xs font-mono truncate max-w-[300px]">{wh.url}</code>
                  {!wh.active && <span className="text-[10px] text-muted-foreground">已暂停</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <Tooltip><TooltipTrigger asChild><button onClick={() => testWebhook(wh.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary" aria-label="测试发送">
                    {testResult[wh.id] === 'sending' ? <span className="text-xs animate-pulse">...</span> : testResult[wh.id] === 'ok' ? <CheckCircle2 size={14} className="text-green-500" /> : testResult[wh.id] === 'fail' ? <span className="text-xs text-red-500">x</span> : <TestTube size={14} />}
                  </button></TooltipTrigger><TooltipContent>测试发送</TooltipContent></Tooltip>
                  {canManage && <button onClick={() => removeWebhook(wh.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive" aria-label="删除"><Trash2 size={14} /></button>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {wh.events.map(ev => (
                  <span key={ev} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/5 text-primary border border-primary/20">{WEBHOOK_EVENTS.find(e => e.value === ev)?.label || ev}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payload Example */}
      <div className="bg-gray-50 border rounded-lg p-3 space-y-2">
        <span className="text-xs font-medium">Webhook 载荷示例</span>
        <pre className="text-[11px] bg-gray-900 text-green-400 rounded p-3 overflow-x-auto font-mono">{JSON.stringify({
          event: 'task.status_changed',
          timestamp: new Date().toISOString(),
          data: {
            id: 'task-xxx',
            title: '示例任务',
            status: 'in_progress',
            previousStatus: 'todo',
            leaderId: 'member-xxx',
          }
        }, null, 2)}</pre>
      </div>
    </div>
  );
}

// ===== IM 推送管理 =====
export function PushConnectorSection() {
  const { state } = useStore();
  const [configs, setConfigs] = useState<PushConfig[]>(getPushConfigs());
  const [showForm, setShowForm] = useState(false);
  const [formChannel, setFormChannel] = useState<PushChannel>('wechat_work');
  const [formUrl, setFormUrl] = useState('');
  const [formSecret, setFormSecret] = useState('');
  const [testResult, setTestResult] = useState<Record<string, 'sending' | 'ok' | 'fail'>>({});

  const CHANNEL_LABELS: Record<PushChannel, string> = {
    wechat_work: '企业微信',
    dingtalk: '钉钉',
    feishu: '飞书',
    webhook: '通用 Webhook',
  };

  const updateConfigs = (next: PushConfig[]) => {
    setConfigs(next);
    savePushConfigs(next);
  };

  const addConfig = useCallback(() => {
    if (!formUrl.trim()) return;
    const next = [...configs, { channel: formChannel, enabled: true, webhookUrl: formUrl.trim(), secret: formSecret || undefined }];
    updateConfigs(next);
    setFormUrl('');
    setFormSecret('');
    setShowForm(false);
  }, [formChannel, formUrl, formSecret, configs]);

  const removeConfig = useCallback((idx: number) => {
    updateConfigs(configs.filter((_, i) => i !== idx));
  }, [configs]);

  const toggleConfig = useCallback((idx: number) => {
    const next = configs.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c);
    updateConfigs(next);
  }, [configs]);

  const testPush = useCallback(async (idx: number) => {
    const cfg = configs[idx];
    if (!cfg) return;
    const key = String(idx);
    setTestResult(p => ({ ...p, [key]: 'sending' }));
    try {
      const results = await pushNotification({ title: '团队业务中台测试', content: '这是一条来自风险雷达的测试推送消息' }, [cfg.channel]);
      const ok = results.some(r => r.success);
      setTestResult(p => ({ ...p, [key]: ok ? 'ok' : 'fail' }));
    } catch (e) {
      handleError(e, { module: 'IntegrationsTab', operation: 'TEST_PUSH', severity: 'warn' });
      setTestResult(p => ({ ...p, [key]: 'fail' }));
    }
    setTimeout(() => setTestResult(p => { const n = { ...p }; delete n[key]; return n; }), 3000);
  }, [configs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquare size={16} className="text-primary" />
          IM 推送
        </div>
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus size={14} /> 添加
        </button>
      </div>
      <p className="text-xs text-muted-foreground">配置企业微信/钉钉/飞书机器人 Webhook，当事项状态变更或风险预警时自动推送通知。</p>

      {showForm && (
        <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
          <div>
            <label className="text-xs font-medium mb-1 block">推送渠道 *</label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(CHANNEL_LABELS) as [PushChannel, string][]).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setFormChannel(k)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${formChannel === k ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border hover:border-primary/50'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Webhook URL *</label>
            <input type="url" className="w-full text-sm border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring" placeholder={`输入${CHANNEL_LABELS[formChannel]}机器人 Webhook 地址`} value={formUrl} onChange={e => setFormUrl(e.target.value)} />
          </div>
          {formChannel === 'dingtalk' && (
            <div>
              <label className="text-xs font-medium mb-1 block">签名密钥（可选）</label>
              <input type="text" className="w-full text-sm border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring" placeholder="钉钉机器人加签密钥" value={formSecret} onChange={e => setFormSecret(e.target.value)} />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={addConfig} disabled={!formUrl.trim()} className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">添加</button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted">取消</button>
          </div>
        </div>
      )}

      {configs.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-xs">暂未配置 IM 推送渠道，点击「添加」创建</div>
      ) : (
        <div className="space-y-2">
          {configs.map((c, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleConfig(i)} className={`w-8 h-4 rounded-full transition-colors relative ${c.enabled ? 'bg-primary' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-card transition-transform ${c.enabled ? 'left-4' : 'left-0.5'}`} />
                  </button>
                  <span className="text-xs font-medium">{CHANNEL_LABELS[c.channel]}</span>
                  {!c.enabled && <span className="text-[10px] text-muted-foreground">已暂停</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <Tooltip><TooltipTrigger asChild><button onClick={() => testPush(i)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary" aria-label="测试推送">
                    {testResult[String(i)] === 'sending' ? <span className="text-xs animate-pulse">...</span> : testResult[String(i)] === 'ok' ? <CheckCircle2 size={14} className="text-green-500" /> : testResult[String(i)] === 'fail' ? <span className="text-xs text-red-500">x</span> : <Send size={14} />}
                  </button></TooltipTrigger><TooltipContent>测试推送</TooltipContent></Tooltip>
                  <button onClick={() => removeConfig(i)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive" aria-label="删除"><Trash2 size={14} /></button>
                </div>
              </div>
              <code className="text-[10px] font-mono text-muted-foreground block truncate">{c.webhookUrl}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== OAuth 集成 =====
export function OAuthSection() {
  const [statuses, setStatuses] = useState(loadOAuthStatuses());
  const [linkingProvider, setLinkingProvider] = useState<OAuthProvider | null>(null);

  const handleConnect = (provider: OAuthProvider) => {
    setLinkingProvider(provider);
    initiateOAuth(provider);
    // 模拟连接成功（实际需 OAuth 回调）
    setTimeout(() => {
      setStatuses(loadOAuthStatuses());
      setLinkingProvider(null);
    }, 2000);
  };

  const handleDisconnect = (provider: OAuthProvider) => {
    if (!confirm(`确认断开${PROVIDER_LABELS[provider].name}连接？`)) return;
    disconnectOAuth(provider);
    setStatuses(loadOAuthStatuses());
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Link2 size={16} className="text-primary" />
        第三方账号连接
      </div>
      <p className="text-xs text-muted-foreground">连接飞书/钉钉/企业微信，实现数据同步和权限打通。</p>

      <div className="space-y-2">
        {(Object.entries(PROVIDER_LABELS) as [OAuthProvider, { name: string; desc: string }][]).map(([provider, info]) => {
          const status = statuses.find(s => s.provider === provider) || { provider, connected: false };
          return (
            <div key={provider} className="border rounded-lg p-3 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${status.connected ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                {info.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{info.name}</div>
                <div className="text-[10px] text-muted-foreground">{info.desc}</div>
              </div>
              {status.connected ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-green-600 flex items-center gap-0.5"><CheckCircle2 size={10} />已连接</span>
                  <Tooltip><TooltipTrigger asChild><button onClick={() => handleDisconnect(provider)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><Unlink size={12} /></button></TooltipTrigger><TooltipContent>断开连接</TooltipContent></Tooltip>
                </div>
              ) : (
                <button
                  onClick={() => handleConnect(provider)}
                  disabled={linkingProvider === provider}
                  className="text-xs px-3 py-1.5 rounded-lg border border-primary text-primary hover:bg-primary/5 disabled:opacity-50"
                >
                  {linkingProvider === provider ? '连接中...' : '连接'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-gray-50 border rounded-lg p-3">
        <p className="text-[11px] text-muted-foreground"><strong>安全说明</strong>：OAuth 连接使用标准授权码流程，TBH 不会存储第三方密码。连接后可随时断开。当前版本需在系统设置中配置 Client ID 后方可使用。</p>
      </div>
    </div>
  );
}

// ===== Outlook 集成 =====
export function OutlookSection() {
  const { state, dispatch } = useStore();
  const [status, setStatus] = useState(getConnectionStatus());
  const [tokenInput, setTokenInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [expiresInput, setExpiresInput] = useState('3600');
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = useCallback(() => {
    if (!tokenInput.trim()) return;
    setConnecting(true);
    setError('');
    try {
      const input: ManualTokenInput = {
        accessToken: tokenInput.trim(),
        expiresInSeconds: parseInt(expiresInput) || 3600,
        email: emailInput.trim() || undefined,
      };
      connectManualToken(input);
      setStatus(getConnectionStatus());
      setTokenInput('');
      setConnecting(false);
    } catch (e) {
      handleError(e, { module: 'IntegrationsTab', operation: 'OUTLOOK_CONNECT', severity: 'warning' });
      setError('连接失败，请检查 Token 是否有效');
      setConnecting(false);
    }
  }, [tokenInput, emailInput, expiresInput]);

  const handleDisconnect = useCallback(() => {
    if (!confirm('确认断开 Outlook 连接？日历和邮件缓存将被清除。')) return;
    clearToken();
    dispatch({ type: 'CLEAR_OUTLOOK_DATA' });
    setStatus(getConnectionStatus());
  }, [dispatch]);

  const handleSync = useCallback(async () => {
    if (!state.currentUser) return;
    setSyncing(true);
    setError('');
    try {
      const memberId = state.currentUser.id;
      const [events, mails] = await Promise.all([
        fetchCalendarEvents(memberId),
        fetchMailSummary(memberId, 20),
      ]);
      dispatch({ type: 'SET_OUTLOOK_CALENDAR_EVENTS', payload: events });
      dispatch({ type: 'SET_OUTLOOK_MAIL_SUMMARY', payload: mails });
      const newStatus = getConnectionStatus();
      setStatus(newStatus);
    } catch (e) {
      if (e instanceof GraphApiError && e.statusCode === 401) {
        setError('Token 已失效，请重新输入');
        clearToken();
        setStatus(getConnectionStatus());
      } else {
        handleError(e, { module: 'IntegrationsTab', operation: 'OUTLOOK_SYNC', severity: 'warning' });
        setError('同步失败，请稍后重试');
      }
    }
    setSyncing(false);
  }, [state.currentUser, dispatch]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Mail size={16} className="text-primary" />
        Microsoft Outlook
      </div>
      <p className="text-xs text-muted-foreground">连接 Outlook 账号，同步日历事件和邮件摘要到中台。当前支持手动 Token 输入模式（从 Graph Explorer 获取临时 Token）。</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {status.connected ? (
        /* 已连接状态 */
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-700 font-bold text-sm">Out</div>
            <div>
              <div className="text-sm font-medium">已连接 Outlook</div>
              <div className="text-xs text-muted-foreground">{status.connectedEmail || '未知邮箱'}</div>
            </div>
            <CheckCircle2 size={16} className="text-green-500 ml-auto" />
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground bg-gray-50 rounded-lg px-3 py-2">
            <span>Token 过期: {status.expiresAt ? new Date(status.expiresAt).toLocaleString('zh-CN') : '未知'}</span>
            {status.isExpired && <span className="text-amber-600 font-medium">已过期</span>}
          </div>

          {/* 同步统计 */}
          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted-foreground">日历事件: <strong className="text-foreground">{state.outlookCalendarEvents.length}</strong></span>
            <span className="text-muted-foreground">邮件摘要: <strong className="text-foreground">{state.outlookMailSummary.length}</strong></span>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={handleSync} disabled={syncing || status.isExpired} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5">
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} /> {syncing ? '同步中...' : '立即同步'}
            </button>
            <button onClick={handleDisconnect} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive">
              断开连接
            </button>
          </div>

          {status.isExpired && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <p className="text-[11px] text-amber-700"><strong>Token 已过期</strong>：手动模式不支持自动刷新，请断开后重新输入新的 Access Token。</p>
            </div>
          )}
        </div>
      ) : (
        /* 未连接 - 手动 Token 输入 */
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">手动 Token 输入</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">临时方案</span>
          </div>

          <p className="text-[11px] text-muted-foreground">
            从 <a href="https://developer.microsoft.com/graph/graph-explorer" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Graph Explorer</a> 获取 Access Token 后粘贴到下方。
            Token 有效期通常为 1 小时，过期后需重新获取。
          </p>

          <div className="space-y-2">
            <div>
              <label className="text-xs font-medium mb-1 block">Access Token *</label>
              <textarea
                className="w-full text-xs border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring font-mono min-h-[80px]"
                placeholder="粘贴从 Graph Explorer 复制的 Access Token..."
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-1 block">邮箱（可选）</label>
                <input
                  type="email"
                  className="w-full text-xs border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="you@company.com"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">有效期（秒）</label>
                <input
                  type="number"
                  className="w-full text-xs border border-input rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  value={expiresInput}
                  onChange={e => setExpiresInput(e.target.value)}
                  min="300"
                  max="7200"
                />
              </div>
            </div>
          </div>

          <button onClick={handleConnect} disabled={!tokenInput.trim() || connecting} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {connecting ? '连接中...' : '连接 Outlook'}
          </button>
        </div>
      )}

      {/* 获取 Token 教程 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
        <span className="text-xs font-medium text-blue-800">如何获取 Access Token</span>
        <ol className="text-[11px] text-blue-700 space-y-1 list-decimal ml-4">
          <li>打开 <a href="https://developer.microsoft.com/graph/graph-explorer" target="_blank" rel="noopener noreferrer" className="underline">Graph Explorer</a></li>
          <li>登录你的 Microsoft 账号</li>
          <li>在权限面板授权 <code className="bg-blue-100 px-1 rounded">Calendars.Read</code> 和 <code className="bg-blue-100 px-1 rounded">Mail.Read</code></li>
          <li>点击「Access Token」栏旁的复制图标</li>
          <li>粘贴到上方输入框即可</li>
        </ol>
      </div>
    </div>
  );
}

