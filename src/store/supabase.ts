import type { AppState, Goal, Project, Task, Member, SubTask } from '@/types';
import { getSupabaseClient } from '@/supabase/client';
import { STORAGE_KEY, CURRENT_USER_KEY, ensureAppStateDefaults, toCamel, toSnake } from './types';
import { generateAllData } from '@/data/dataGenerator';
import type { Notification, Activity, ItemLink, Category, Template, ScheduleEvent, Note, Comment, ReviewEntry, Bookmark, SavedView } from '@/types';

export function saveLocalStateImmediate(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(CURRENT_USER_KEY, state.currentUser?.id || '');
  } catch {
  }
}

export function loadLocalState(): AppState {
  try {
    // Migrate legacy key (one-time)
    try {
      const legacy = localStorage.getItem('team-business-hub-data');
      if (legacy && !localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, legacy);
        localStorage.removeItem('team-business-hub-data');
      }
    } catch (e) { console.warn('[loadLocalState] legacy key migration failed:', e); }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') return ensureAppStateDefaults(parsed);
    }
  } catch (e) {
    console.error('[loadLocalState] failed to load state:', e);
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
    const [membersRes, goalsRes, projectsRes, tasksRes, notifsRes, actsRes, linksRes, reviewsRes, categoriesRes, templatesRes, scheduleRes, notesRes, commentsRes, tagsRes, bookmarksRes, savedViewsRes] = await Promise.allSettled([
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
      sb.from('bookmarks').select('*').order('created_at'),
      sb.from('saved_views').select('*').order('created_at', { ascending: false }),
    ]);
    const val = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? r.value : null;
    const data = (r: any) => Array.isArray(r?.data) ? r.data : [];
    const membersRes0 = val(membersRes);
    if (membersRes0?.error) { console.error('Supabase fetch error [members]:', membersRes0.error); return null; }
    const allMembers = data(membersRes0).map(toCamel) as Member[];
    let savedUserId: string | null = null;
    try { savedUserId = localStorage.getItem(CURRENT_USER_KEY); } catch {}
    const savedUser = savedUserId ? allMembers.find(m => m.id === savedUserId) : null;
    return ensureAppStateDefaults({
      members: allMembers,
      goals: data(val(goalsRes)).map(toCamel) as Goal[],
      projects: data(val(projectsRes)).map(toCamel) as Project[],
      tasks: data(val(tasksRes)).map(toCamel) as Task[],
      notifications: data(val(notifsRes)).map(toCamel) as Notification[],
      activities: data(val(actsRes)).map(toCamel) as Activity[],
      itemLinks: data(val(linksRes)).map(toCamel) as ItemLink[],
      reviews: data(val(reviewsRes)).map(toCamel) as ReviewEntry[],
      categories: data(val(categoriesRes)).map(toCamel) as Category[],
      templates: data(val(templatesRes)).map(toCamel) as Template[],
      scheduleEvents: data(val(scheduleRes)).map(toCamel) as ScheduleEvent[],
      notes: data(val(notesRes)).map(toCamel) as Note[],
      comments: data(val(commentsRes)).map(toCamel) as Comment[],
      currentUser: savedUser || null,
      tags: data(val(tagsRes)).map(toCamel),
      bookmarks: data(val(bookmarksRes)).map(toCamel) as Bookmark[],
      savedViews: data(val(savedViewsRes)).map(toCamel) as SavedView[],
    });
  } catch (e) { console.error('Supabase fetch failed:', e); return null; }
}

// Module-level write error callback — set by StoreProvider to dispatch ADD_NOTIFICATION
let _onWriteError: ((msg: string) => void) | null = null;
export function setOnWriteError(cb: (msg: string) => void) { _onWriteError = cb; }

async function withRetry(fn: () => Promise<any>, retries = 2): Promise<void> {
  for (let i = 0; i <= retries; i++) {
    try { await fn(); return; } catch (e: any) {
      if (i === retries) {
        console.error('Supabase operation failed after retries:', e);
        _onWriteError?.('数据同步失败，已自动重试。请检查网络后刷新页面。');
        return;
      }
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}

/** Whitelist of DB columns per table — prevents sending unknown columns that cause 400 errors */
const TABLE_COLUMNS: Record<string, Set<string> | null> = {
  goals: new Set(['id','title','description','type','status','parent_id','level','start_date','end_date','owner_id','key_results','progress','created_at','updated_at','leader_id','supporter_ids','canvas_x','canvas_y','priority','tags','category','repeat_cycle','discussion_thread_id','summary']),
  projects: new Set(['id','title','description','goal_id','status','start_date','end_date','owner_id','member_ids','task_count','progress','created_at','updated_at','leader_id','supporter_ids','parent_id','canvas_x','canvas_y','priority','category','repeat_cycle','discussion_thread_id','summary']),
  tasks: new Set(['id','title','description','project_id','goal_id','status','priority','assignee_id','owner_id','due_date','reminder_date','completed_at','subtasks','tags','created_at','updated_at','leader_id','supporter_ids','canvas_x','canvas_y','parent_id','category','repeat_cycle','discussion_thread_id','summary']),
  members: new Set(['id','name','role','department','avatar','email','status','join_date','created_at','updated_at','nickname','phone','wechat_id','permissions']),
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
  bookmarks: new Set(['id','title','url','category','icon','order','created_at']),
  saved_views: new Set(['id','name','type','filters','filter_logic','created_at']),
};

/** Columns that reference other tables via FK — empty strings must become null */
const FK_COLUMNS = new Set(['owner_id','leader_id','supporter_ids','assignee_id','parent_id','goal_id','project_id','member_id','linked_item_id','source_id','target_id','related_id','item_id','created_by','updated_by']);

/** Remove keys not present in DB table schema to avoid PostgREST 400 errors.
 *  Converts empty strings to null only for FK columns (Postgres treats '' as non-null). */
function filterColumns(table: string, snakeData: Record<string, any>): Record<string, any> {
  const allowed = TABLE_COLUMNS[table];
  if (!allowed) return snakeData; // unknown table — pass through (e.g. bookmarks/saved_views)
  const filtered: Record<string, any> = {};
  for (const [k, v] of Object.entries(snakeData)) {
    if (!allowed.has(k)) continue;
    filtered[k] = (v === '' && FK_COLUMNS.has(k)) ? null : v;
  }
  return filtered;
}

export async function supabaseUpsert(table: string, data: Record<string, any> | Record<string, any>[]) {
  const sb = getSupabaseClient();
  if (!sb) return;
  const arr = Array.isArray(data) ? data : [data];
  const snakeData = arr.map(d => filterColumns(table, toSnake(d)));
  await withRetry(async () => {
    for (let i = 0; i < snakeData.length; i += 100) {
      const res = await sb.from(table).upsert(snakeData.slice(i, i + 100), { onConflict: 'id' });
      if (res.error) throw res.error;
    }
  });
}

export async function supabaseUpdate(table: string, id: string, data: Record<string, any>, oldUpdatedAt?: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  await withRetry(async () => {
    let q = sb.from(table).update(filterColumns(table, toSnake(data))).eq('id', id);
    // Optimistic locking (DAT-01): only apply if record hasn't changed since last read
    if (oldUpdatedAt) q = q.eq('updated_at', oldUpdatedAt);
    const res = await q;
    if (res.error) throw res.error;
    // If optimistic lock was specified but no rows affected, data was modified elsewhere
    if (oldUpdatedAt && res.count === 0) {
      console.warn(`[supabaseUpdate] optimistic lock conflict: ${table}/${id}`);
      _onWriteError?.('数据已被其他人修改，请刷新页面后重试。');
    }
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

/** Audit log: fire-and-forget write to activities table (SEC-06).
 *  Skips if no Supabase client or no current user. Never throws. */
export function logActivity(params: { memberId?: string; action: string; targetType: string; targetId: string; targetTitle: string; details?: string }) {
  try {
    const sb = getSupabaseClient();
    if (!sb || !params.memberId) return;
    // Fire-and-forget: don't await, don't block caller
    sb.from('activities').insert({
      member_id: params.memberId,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      target_title: params.targetTitle.slice(0, 200),
      details: (params.details || '').slice(0, 500),
    }).then();
  } catch {}
}
