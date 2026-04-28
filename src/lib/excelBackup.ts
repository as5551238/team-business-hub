import * as XLSX from 'xlsx';
import type { BackupData, Member, Goal, Project, Task, Notification, Activity, ItemLink, Tag, Category, Template, ScheduleEvent, Note, ReviewEntry } from '@/types';

interface FlatMember extends Omit<Member, 'permissions'> { permissions: string; }
interface FlatGoal extends Omit<Goal, 'keyResults' | 'tags' | 'supporterIds' | 'attachments' | 'trackingRecords' | 'selectedKRIds'> { keyResults: string; tags: string; supporterIds: string; attachments: string; trackingRecords: string; selectedKRIds: string; }
interface FlatProject extends Omit<Project, 'tags' | 'supporterIds' | 'attachments' | 'trackingRecords'> { tags: string; supporterIds: string; attachments: string; trackingRecords: string; }
interface FlatTask extends Omit<Task, 'tags' | 'subtasks' | 'supporterIds' | 'attachments' | 'trackingRecords'> { tags: string; subtasks: string; supporterIds: string; attachments: string; trackingRecords: string; }

function arrStr(val: any): string {
  if (!val) return '';
  return Array.isArray(val) ? JSON.stringify(val) : String(val);
}

function parseArr(val: any): any[] {
  if (!val || val === '') return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

export function exportToExcel(data: BackupData): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  const members: FlatMember[] = data.members.map(m => ({ ...m, permissions: JSON.stringify(m.permissions || []) }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(members), '成员');

  const goals: FlatGoal[] = data.goals.map(g => ({
    id: g.id, title: g.title, description: g.description || '', status: g.status, priority: g.priority,
    parentId: g.parentId || '', leaderId: g.leaderId, progress: g.progress,
    dueDate: g.dueDate || '', startDate: g.startDate || '', category: g.category || '',
    tags: arrStr(g.tags), keyResults: arrStr(g.keyResults), supporterIds: arrStr(g.supporterIds),
    attachments: arrStr(g.attachments), trackingRecords: arrStr(g.trackingRecords),
    selectedKRIds: arrStr(g.selectedKRIds), repeatCycle: g.repeatCycle || '',
    discussionThreadId: g.discussionThreadId || '', summary: g.summary || '',
    level: g.level || 0, createdAt: g.createdAt, updatedAt: g.updatedAt,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(goals), '目标');

  const projects: FlatProject[] = data.projects.map(p => ({
    id: p.id, title: p.title, description: p.description || '', status: p.status, priority: p.priority,
    goalId: p.goalId || '', leaderId: p.leaderId, progress: p.progress, taskCount: p.taskCount || 0,
    dueDate: p.dueDate || '', startDate: p.startDate || '', category: p.category || '',
    tags: arrStr(p.tags), supporterIds: arrStr(p.supporterIds),
    attachments: arrStr(p.attachments), trackingRecords: arrStr(p.trackingRecords),
    repeatCycle: p.repeatCycle || '', discussionThreadId: p.discussionThreadId || '',
    summary: p.summary || '', createdAt: p.createdAt, updatedAt: p.updatedAt,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projects), '项目');

  const tasks: FlatTask[] = data.tasks.map(t => ({
    id: t.id, title: t.title, description: t.description || '', status: t.status, priority: t.priority,
    projectId: t.projectId || '', parentId: t.parentId || '', leaderId: t.leaderId,
    dueDate: t.dueDate || '', startDate: t.startDate || '', category: t.category || '',
    tags: arrStr(t.tags), subtasks: arrStr(t.subtasks), supporterIds: arrStr(t.supporterIds),
    attachments: arrStr(t.attachments), trackingRecords: arrStr(t.trackingRecords),
    repeatCycle: t.repeatCycle || '', discussionThreadId: t.discussionThreadId || '',
    summary: t.summary || '', completedAt: t.completedAt || '', createdAt: t.createdAt, updatedAt: t.updatedAt,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tasks), '任务');

  const cats = data.categories.map(c => ({ ...c, appliesTo: JSON.stringify(c.appliesTo || []) }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cats), '分类');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.tags), '标签');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.notifications), '通知');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.activities), '动态');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.itemLinks), '关联');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.templates), '模板');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.scheduleEvents), '日程');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.notes), '笔记');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.reviews), '复盘');

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

export function importFromExcel(buffer: ArrayBuffer): BackupData | null {
  try {
    const wb = XLSX.read(buffer, { type: 'array' });
    const getSheet = (name: string) => {
      const sheet = wb.Sheets[name];
      return sheet ? XLSX.utils.sheet_to_json(sheet) : [];
    };

    const members = getSheet('成员').map((m: any) => ({
      ...m, permissions: parseArr(m.permissions), role: m.role || 'member',
      avatar: m.avatar || '', status: m.status || 'active',
    }));

    const goals = getSheet('目标').map((g: any) => ({
      ...g, tags: parseArr(g.tags), keyResults: parseArr(g.keyResults),
      supporterIds: parseArr(g.supporterIds), attachments: parseArr(g.attachments),
      trackingRecords: parseArr(g.trackingRecords), selectedKRIds: parseArr(g.selectedKRIds),
      parentId: g.parentId || null, progress: g.progress || 0, level: g.level || 0,
      repeatCycle: g.repeatCycle || 'none', discussionThreadId: g.discussionThreadId || null,
      summary: g.summary || '', priority: g.priority || 'medium', status: g.status || 'todo',
    }));

    const projects = getSheet('项目').map((p: any) => ({
      ...p, tags: parseArr(p.tags), supporterIds: parseArr(p.supporterIds),
      attachments: parseArr(p.attachments), trackingRecords: parseArr(p.trackingRecords),
      repeatCycle: p.repeatCycle || 'none', discussionThreadId: p.discussionThreadId || null,
      summary: p.summary || '', priority: p.priority || 'medium', status: p.status || 'planning',
    }));

    const tasks = getSheet('任务').map((t: any) => ({
      ...t, tags: parseArr(t.tags), subtasks: parseArr(t.subtasks),
      supporterIds: parseArr(t.supporterIds), attachments: parseArr(t.attachments),
      trackingRecords: parseArr(t.trackingRecords), parentId: t.parentId || null,
      repeatCycle: t.repeatCycle || 'none', discussionThreadId: t.discussionThreadId || null,
      summary: t.summary || '', priority: t.priority || 'medium', status: t.status || 'todo',
      category: t.category || '',
    }));

    const categories = getSheet('分类').map((c: any) => ({
      ...c, appliesTo: parseArr(c.appliesTo), color: c.color || '#6366f1', icon: c.icon || 'tag',
    }));

    const tags = getSheet('标签').map((t: any) => ({ ...t, color: t.color || '#6366f1' }));

    if (members.length === 0) return null;

    return {
      version: '3.0', exportedAt: new Date().toISOString(),
      members: members as Member[], goals: goals as Goal[], projects: projects as Project[],
      tasks: tasks as Task[], notifications: getSheet('通知') as Notification[],
      activities: getSheet('动态') as Activity[], itemLinks: getSheet('关联') as ItemLink[],
      tags: tags as Tag[], categories: categories as Category[],
      templates: getSheet('模板') as Template[], scheduleEvents: getSheet('日程') as ScheduleEvent[],
      notes: getSheet('笔记') as Note[], reviews: getSheet('复盘') as ReviewEntry[],
    };
  } catch (e) {
    console.error('Excel import error:', e);
    return null;
  }
}

export function importFromJSON(text: string): BackupData | null {
  try {
    const json = JSON.parse(text);
    if (!json.members || !json.goals || !json.projects || !json.tasks) return null;
    return json as BackupData;
  } catch { return null; }
}
