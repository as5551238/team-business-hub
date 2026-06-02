export type AdminTab = 'team' | 'flow' | 'automation' | 'automaton' | 'toolbox' | 'schedule' | 'integrations' | 'settings' | 'kpi' | 'agent' | 'deploy' | 'riskradar' | 'teamload' | 'mcptools' | 'billing' | 'retro' | 'marketplace' | 'compliance' | 'collab' | 'templates';

export const tabItems: { key: AdminTab; label: string; icon: any }[] = [
  { key: 'team', label: '团队', icon: 'Users' as any },
  { key: 'flow', label: '流程配置', icon: 'GitBranch' as any },
  { key: 'automation', label: '自动化', icon: 'Zap' as any },
  { key: 'kpi', label: 'KPI', icon: 'Target' as any },
  { key: 'riskradar', label: '风险雷达', icon: 'Shield' as any },
  { key: 'agent', label: 'Agent审计', icon: 'Bot' as any },
  { key: 'integrations', label: '集成', icon: 'Globe' as any },
  { key: 'mcptools', label: 'MCP&Agent', icon: 'Bot' as any },
  { key: 'marketplace', label: 'Agent市场', icon: 'Store' as any },
  { key: 'compliance', label: '等保合规', icon: 'ShieldCheck' as any },
  { key: 'collab', label: '实时协作', icon: 'Radio' as any },
  { key: 'templates', label: '模板市场', icon: 'LayoutTemplate' as any },
  { key: 'deploy', label: '部署', icon: 'Server' as any },
  { key: 'toolbox', label: '工具箱', icon: 'Wrench' as any },
  { key: 'schedule', label: '日程', icon: 'Calendar' as any },
  { key: 'settings', label: '设置', icon: 'SettingsIcon' as any },
];

export const roleLabels: Record<string, string> = { admin: '管理员', manager: '负责人', leader: '组长', member: '成员' };
export const roleColors: Record<string, string> = { admin: 'bg-red-100 text-red-700', manager: 'bg-blue-100 text-blue-700', leader: 'bg-purple-100 text-purple-700', member: 'bg-gray-100 text-gray-600' };
export const permissionDesc: Record<string, string> = { admin: '全部权限', manager: '可管理目标和项目，不可管理团队和设置', leader: '可管理目标和项目，不可管理团队和设置', member: '可编辑，不可删除/管理团队/管理设置/导出' };
export const allPermissions = ['goals_view', 'goals_create', 'goals_edit', 'goals_delete', 'goals_manage', 'projects_view', 'projects_create', 'projects_edit', 'projects_delete', 'projects_manage', 'tasks_view', 'tasks_create', 'tasks_edit', 'tasks_delete', 'tasks_manage', 'team_view', 'team_create', 'team_edit', 'team_delete', 'team_manage', 'settings_view', 'settings_create', 'settings_edit', 'settings_delete', 'settings_manage', 'export_view', 'export_create', 'export_edit', 'export_delete', 'export_manage', 'knowledge_view', 'knowledge_create', 'knowledge_edit', 'knowledge_delete', 'knowledge_manage'] as const;
export const permLabels: Record<string, string> = { goals_view: '查看目标', goals_create: '创建目标', goals_edit: '编辑目标', goals_delete: '删除目标', goals_manage: '管理目标', projects_view: '查看项目', projects_create: '创建项目', projects_edit: '编辑项目', projects_delete: '删除项目', projects_manage: '管理项目', tasks_view: '查看任务', tasks_create: '创建任务', tasks_edit: '编辑任务', tasks_delete: '删除任务', tasks_manage: '管理任务', team_view: '查看团队', team_create: '邀请成员', team_edit: '编辑成员', team_delete: '移除成员', team_manage: '管理团队', settings_view: '查看设置', settings_create: '创建配置', settings_edit: '编辑设置', settings_delete: '删除配置', settings_manage: '管理设置', export_view: '查看导出', export_create: '创建导出', export_edit: '编辑导出', export_delete: '删除导出', export_manage: '管理导出', knowledge_view: '查看知识库', knowledge_create: '创建知识', knowledge_edit: '编辑知识', knowledge_delete: '删除知识', knowledge_manage: '管理知识库' };
export const typeLabels: Record<string, string> = { goal: '目标', project: '项目', task: '任务', document: '文档' };
export const typeColors: Record<string, string> = { goal: 'bg-red-100 text-red-700', project: 'bg-blue-100 text-blue-700', task: 'bg-green-100 text-green-700', document: 'bg-purple-100 text-purple-700' };
export const PRESET_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];
export const NOTE_COLORS = ['#ffffff', '#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#f3e8ff', '#ffedd5', '#e2e8f0'];
export const repeatLabels: Record<string, string> = { none: '不重复', daily: '每天', weekly: '每周', biweekly: '每两周', monthly: '每月', quarterly: '每季度', yearly: '每年' };
export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
export const FOLDERS = ['全部', '工作', '个人', '学习', '其他'];
export const periodLabels: Record<string, string> = { day: '日', week: '周', month: '月', quarter: '季', year: '年', custom: '自定义' };

export const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary';
export const btnCls = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-muted transition-colors';
export const primaryBtnCls = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90';

export function getRoleDefaultPermission(role: string, permission: string): boolean {
  if (role === 'admin') return true;
  if (role === 'manager' || role === 'leader') return !['team_manage', 'settings_manage', 'team_delete', 'settings_delete'].includes(permission);
  const forbidden = new Set(['team_manage', 'team_delete', 'settings_manage', 'settings_delete', 'goals_delete', 'projects_delete', 'tasks_delete', 'export_manage', 'knowledge_manage']);
  return !forbidden.has(permission);
}

export interface EditForm { name: string; nickname: string; wechatId: string; phone: string; email: string; role: string; department: string; status: string; }
export function memberToEditForm(m: any): EditForm { return { name: m.name || '', nickname: m.nickname || '', wechatId: m.wechatId || '', phone: m.phone || '', email: m.email || '', role: m.role || 'member', department: m.department || '', status: m.status || 'active' }; }

export interface TForm { title: string; description: string; type: 'goal' | 'project' | 'task' | 'document'; content: string; category: string; isPublic: boolean; }
export const emptyForm: TForm = { title: '', description: '', type: 'task', content: '', category: '', isPublic: false };
export function formFromTemplate(t: any): TForm { return { title: t.title, description: t.description, type: t.type, content: t.content, category: t.category, isPublic: t.isPublic }; }

export interface EvtForm { title: string; description: string; startDate: string; endDate: string; allDay: boolean; color: string; linkedItemId: string; linkedItemType: 'goal' | 'project' | 'task' | null; repeatCycle: string; memberId: string; }
export const emptyEvtForm: EvtForm = { title: '', description: '', startDate: '', endDate: '', allDay: true, color: '#3b82f6', linkedItemId: '', linkedItemType: null, repeatCycle: 'none', memberId: '' };

export interface CalendarDay { date: string; day: number; isCurrentMonth: boolean; isToday: boolean; }
export function getCalendarDays(year: number, month: number): CalendarDay[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const days: CalendarDay[] = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const prevLastDay = new Date(year, month, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = prevLastDay - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ date: dateStr, day: d, isCurrentMonth: false, isToday: dateStr === todayStr });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ date: dateStr, day: d, isCurrentMonth: true, isToday: dateStr === todayStr });
  }
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ date: dateStr, day: d, isCurrentMonth: false, isToday: dateStr === todayStr });
  }
  return days;
}

export interface EmailConfig { enabled: boolean; resendApiKey: string; fromEmail: string; }
export function loadEmailConfig(): EmailConfig {
  try { const s = localStorage.getItem('tbh-email-config'); if (s) { const c = JSON.parse(s); return { enabled: c.enabled || false, resendApiKey: c.resendApiKey || c.smtpUser || '', fromEmail: c.fromEmail || '' }; } } catch {}
  return { enabled: false, resendApiKey: '', fromEmail: '' };
}
export function saveEmailConfig(c: EmailConfig) {
  try { localStorage.setItem('tbh-email-config', JSON.stringify(c)); } catch {}
  // Async sync to database for cron jobs - fire and forget
  syncEmailConfigToDb(c);
}
async function syncEmailConfigToDb(c: EmailConfig) {
  try {
    const { getSupabaseClient } = await import('@/supabase/client');
    const sb = getSupabaseClient();
    if (sb) {
      await sb.from('email_settings').upsert({
        id: 1, enabled: c.enabled, resend_api_key: c.resendApiKey, from_email: c.fromEmail, updated_at: new Date().toISOString()
      });
    }
  } catch {}
}
