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
    const [membersRes, goalsRes, projectsRes, tasksRes, notifsRes, actsRes, linksRes, reviewsRes, categoriesRes, templatesRes, scheduleRes, notesRes, commentsRes, tagsRes] = await Promise.all([
      sb.from('members').select('*').eq('status', 'active').order('join_date'),
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
      sb.from('tags').select('*').order('created_at'),
    ]);
    // Check all table responses for errors
    const allResults = [membersRes, goalsRes, projectsRes, tasksRes, notifsRes, actsRes, linksRes, reviewsRes, categoriesRes, templatesRes, scheduleRes, notesRes, commentsRes, tagsRes];
    const tableNames = ['members', 'goals', 'projects', 'tasks', 'notifications', 'activities', 'item_links', 'reviews', 'categories', 'templates', 'schedule_events', 'notes', 'comments', 'tags'];
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
      currentUser: savedUser || null,
      tags: (tagsRes.data || []).map(toCamel),
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

/** Whitelist of DB columns per table — prevents sending unknown columns that cause 400 errors */
const TABLE_COLUMNS: Record<string, Set<string> | null> = {
  goals: new Set(['id','title','description','type','status','parent_id','level','start_date','end_date','owner_id','key_results','progress','created_at','updated_at','leader_id','supporter_ids','canvas_x','canvas_y','priority','tags','category','repeat_cycle','discussion_thread_id','summary']),
  projects: new Set(['id','title','description','goal_id','status','start_date','end_date','owner_id','member_ids','task_count','progress','created_at','updated_at','leader_id','supporter_ids','parent_id','canvas_x','canvas_y','priority','category','repeat_cycle','discussion_thread_id','summary']),
  tasks: new Set(['id','title','description','project_id','goal_id','status','priority','assignee_id','owner_id','due_date','reminder_date','completed_at','subtasks','tags','created_at','updated_at','leader_id','supporter_ids','canvas_x','canvas_y','parent_id','category','repeat_cycle','discussion_thread_id','summary']),
  members: new Set(['id','name','role','department','avatar','email','status','join_date','created_at','nickname','phone','wechat_id','permissions']),
  notifications: new Set(['id','type','title','message','related_id','related_type','member_id','read','created_at']),
  activities: new Set(['id','member_id','action','target_type','target_id','target_title','details','created_at']),
  item_links: new Set(['id','source_id','source_type','target_id','target_type','label','created_at']),
  reviews: new Set(['id','period','period_start','period_end','member_id','content','improvements','metrics','created_at','updated_at']),
  categories: new Set(['id','name','color','icon','applies_to','created_at']),
  tags: new Set(['id','name','color','created_at','updated_at']),
  templates: new Set(['id','title','description','type','content','created_by','updated_by','is_public','category','created_at','updated_at']),
  schedule_events: new Set(['id','title','description','start_date','end_date','all_day','color','linked_item_id','linked_item_type','member_id','repeat_cycle','created_at','updated_at']),
  notes: new Set(['id','title','content','folder','color','is_pinned','linked_item_id','linked_item_type','created_by','updated_by','created_at','updated_at']),
  comments: new Set(['id','item_id','item_type','member_id','member_name','content','created_at']),
};

/** Remove keys not present in DB table schema to avoid PostgREST 400 errors.
 *  Also converts empty strings to null so FK checks don't treat '' as a valid member ID. */
function filterColumns(table: string, snakeData: Record<string, any>): Record<string, any> {
  const allowed = TABLE_COLUMNS[table];
  if (!allowed) return snakeData; // unknown table — pass through (e.g. bookmarks/saved_views)
  const filtered: Record<string, any> = {};
  for (const [k, v] of Object.entries(snakeData)) {
    if (!allowed.has(k)) continue;
    // Convert empty string to null (Postgres FK treats '' as a non-null value)
    filtered[k] = v === '' ? null : v;
  }
  return filtered;
}

export async function supabaseUpsert(table: string, data: Record<string, any>[]) {
  const sb = getSupabaseClient();
  if (!sb) return;
  const snakeData = data.map(d => filterColumns(table, toSnake(d)));
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
    const res = await sb.from(table).update(filterColumns(table, toSnake(data))).eq('id', id);
    if (res.error) throw res.error;
  });
}

export async function supabaseInsert(table: string, data: Record<string, any>) {
  const sb = getSupabaseClient();
  if (!sb) return;
  await withRetry(async () => {
    const res = await sb.from(table).upsert(filterColumns(table, toSnake(data)));
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
