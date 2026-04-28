export type AdminTab = 'team' | 'toolbox' | 'schedule' | 'settings';

export const tabItems: { key: AdminTab; label: string; icon: any }[] = [
  { key: 'team', label: '团队', icon: 'Users' as any },
  { key: 'toolbox', label: '工具箱', icon: 'Wrench' as any },
  { key: 'schedule', label: '日程', icon: 'Calendar' as any },
  { key: 'settings', label: '设置', icon: 'SettingsIcon' as any },
];

export const roleLabels: Record<string, string> = { admin: '管理员', manager: '负责人', member: '成员' };
export const roleColors: Record<string, string> = { admin: 'bg-red-100 text-red-700', manager: 'bg-blue-100 text-blue-700', member: 'bg-gray-100 text-gray-600' };
export const permissionDesc: Record<string, string> = { admin: '全部权限', manager: '可管理目标和项目，不可管理团队和设置', member: '仅查看权限' };
export const allPermissions = ['view_goals', 'edit_goals', 'delete_goals', 'view_projects', 'edit_projects', 'delete_projects', 'view_tasks', 'edit_tasks', 'delete_tasks', 'manage_team', 'manage_settings', 'export_data'] as const;
export const permLabels: Record<string, string> = { view_goals: '查看目标', edit_goals: '编辑目标', delete_goals: '删除目标', view_projects: '查看项目', edit_projects: '编辑项目', delete_projects: '删除项目', view_tasks: '查看任务', edit_tasks: '编辑任务', delete_tasks: '删除任务', manage_team: '管理团队', manage_settings: '管理设置', export_data: '导出数据' };
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
  if (role === 'manager') return !['manage_team', 'manage_settings'].includes(permission);
  return ['view_goals', 'view_projects', 'view_tasks'].includes(permission);
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

export interface EmailConfig { enabled: boolean; smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string; fromEmail: string; }
export function loadEmailConfig(): EmailConfig {
  try { const s = localStorage.getItem('tbh-email-config'); if (s) return JSON.parse(s); } catch {}
  return { enabled: false, smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', fromEmail: '' };
}
export function saveEmailConfig(c: EmailConfig) { localStorage.setItem('tbh-email-config', JSON.stringify(c)); }

export function loadWechatGroupConfig(): { webhookUrl: string } {
  try { const s = localStorage.getItem('tbh-wechat-group-config'); if (s) return JSON.parse(s); } catch {}
  return { webhookUrl: '' };
}
export function saveWechatGroupConfig(c: { webhookUrl: string }) { localStorage.setItem('tbh-wechat-group-config', JSON.stringify(c)); }
