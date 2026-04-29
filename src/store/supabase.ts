import type { AppState, Goal, Project, Task, Member, SubTask } from '@/types';
import { getSupabaseClient } from '@/supabase/client';
import { STORAGE_KEY, CURRENT_USER_KEY, ensureAppStateDefaults, toCamel, toSnake } from './types';
import { generateAllData } from '@/data/dataGenerator';
import type { Notification, Activity, ItemLink, Category, Template, ScheduleEvent, Note, Comment, ReviewEntry } from '@/types';

export function saveLocalStateImmediate(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(CURRENT_USER_KEY, state.currentUser?.id || '');
  } catch {
  }
}

export function loadLocalState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') return ensureAppStateDefaults(parsed);
    }
  } catch {
  }
  // 首次初始化：生成空数据（不生成示例数据）
  const emptyState = ensureAppStateDefaults({
    members: [],
    goals: [],
    projects: [],
    tasks: [],
    notifications: [],
    activities: [],
    itemLinks: [],
    reviews: [],
    categories: [],
    tags: [],
    templates: [],
    scheduleEvents: [],
    notes: [],
    comments: [],
    bookmarks: [],
    savedViews: [],
    batchOperations: [],
  });
  saveLocalStateImmediate(emptyState);
  return emptyState;
}

export async function fetchAllFromSupabase(): Promise<AppState | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  try {
    const [membersRes, goalsRes, projectsRes, tasksRes, notifsRes, actsRes, linksRes, reviewsRes, categoriesRes, templatesRes, scheduleRes, notesRes, commentsRes] = await Promise.all([
      sb.from('members').select('*').order('join_date'),
      sb.from('goals').select('*').order('level'),
      sb.from('projects').select('*').order('created_at', { ascending: false }),
      sb.from('tasks').select('*').order('created_at', { ascending: false }),
      sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(100),
      sb.from('activities').select('*').order('created_at', { ascending: false }).limit(100),
      sb.from('item_links').select('*'),
      sb.from('reviews').select('*').order('created_at', { ascending: false }),
      sb.from('categories').select('*').order('created_at'),
      sb.from('templates').select('*').order('created_at', { ascending: false }),
      sb.from('schedule_events').select('*').order('start_date'),
      sb.from('notes').select('*').order('updated_at', { ascending: false }),
      sb.from('comments').select('*').order('created_at', { ascending: false }),
    ]);
    // Check all table responses for errors
    const allResults = [membersRes, goalsRes, projectsRes, tasksRes, notifsRes, actsRes, linksRes, reviewsRes, categoriesRes, templatesRes, scheduleRes, notesRes, commentsRes];
    const tableNames = ['members', 'goals', 'projects', 'tasks', 'notifications', 'activities', 'item_links', 'reviews', 'categories', 'templates', 'schedule_events', 'notes', 'comments'];
    for (let i = 0; i < allResults.length; i++) {
      if (allResults[i].error) { console.error(`Supabase fetch error [${tableNames[i]}]:`, allResults[i].error); }
    }
    if (membersRes.error) { return null; }
    const allMembers = (membersRes.data || []).map(toCamel) as Member[];
    let savedUserId: string | null = null;
    try { savedUserId = localStorage.getItem(CURRENT_USER_KEY); } catch {}
    const savedUser = savedUserId ? allMembers.find(m => m.id === savedUserId) : null;
    return ensureAppStateDefaults({
      members: allMembers,
      goals: (goalsRes.data || []).map(toCamel) as Goal[],
      projects: (projectsRes.data || []).map(toCamel) as Project[],
      tasks: (tasksRes.data || []).map(toCamel) as Task[],
      notifications: (notifsRes.data || []).map(toCamel) as Notification[],
      activities: (actsRes.data || []).map(toCamel) as Activity[],
      itemLinks: (linksRes.data || []).map(toCamel) as ItemLink[],
      reviews: (reviewsRes.data || []).map(toCamel) as ReviewEntry[],
      categories: (categoriesRes.data || []).map(toCamel) as Category[],
      templates: (templatesRes.data || []).map(toCamel) as Template[],
      scheduleEvents: (scheduleRes.data || []).map(toCamel) as ScheduleEvent[],
      notes: (notesRes.data || []).map(toCamel) as Note[],
      comments: (commentsRes.data || []).map(toCamel) as Comment[],
      currentUser: savedUser || (allMembers[0] ? allMembers[0] : null),
      tags: [],
      savedViews: [],
    });
  } catch (e) { console.error('Supabase fetch failed:', e); return null; }
}

async function withRetry(fn: () => Promise<any>, retries = 1): Promise<void> {
  for (let i = 0; i <= retries; i++) {
    try { await fn(); return; } catch (e) {
      if (i === retries) { console.error('Supabase operation failed after retries:', e); return; }
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

export async function supabaseUpsert(table: string, data: Record<string, any>[]) {
  const sb = getSupabaseClient();
  if (!sb) return;
  const snakeData = data.map(d => toSnake(d));
  await withRetry(async () => {
    for (let i = 0; i < snakeData.length; i += 100) {
      const res = await sb.from(table).upsert(snakeData.slice(i, i + 100), { onConflict: 'id' });
      if (res.error) throw res.error;
    }
  });
}

export async function supabaseUpdate(table: string, id: string, data: Record<string, any>) {
  const sb = getSupabaseClient();
  if (!sb) return;
  await withRetry(async () => {
    const res = await sb.from(table).update(toSnake(data)).eq('id', id);
    if (res.error) throw res.error;
  });
}

export async function supabaseInsert(table: string, data: Record<string, any>) {
  const sb = getSupabaseClient();
  if (!sb) return;
  await withRetry(async () => {
    const res = await sb.from(table).insert(toSnake(data));
    if (res.error) throw res.error;
  });
}

export async function supabaseDelete(table: string, id: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  await withRetry(async () => {
    const res = await sb.from(table).delete().eq('id', id);
    if (res.error) throw res.error;
  });
}
