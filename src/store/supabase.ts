import { handleError } from '@/lib/errorHandler';
import type { AppState, Goal, Project, Task, Member, SubTask } from '@/types';
import { getSupabaseClient } from '@/supabase/client';
import { STORAGE_KEY, CURRENT_USER_KEY, ensureAppStateDefaults, toCamel, toSnake } from './types';
import type { Notification, Activity, ItemLink, Category, Template, ScheduleEvent, Note, Comment, ReviewEntry, Bookmark, SavedView, Knowledge, NotificationPreference } from '@/types';
import { initFactoryRulesIfNeeded } from './shared';

export function saveLocalStateImmediate(state: AppState) {
  try {
    const json = JSON.stringify(state);
    // DAT-06: check size before write (localStorage limit ~5-10MB)
    if (json.length > 4 * 1024 * 1024) {
      console.warn(`[saveLocalState] state too large (${(json.length / 1024 / 1024).toFixed(1)}MB), truncating activities/notifications`);
      const trimmed = { ...state, activities: state.activities.slice(0, 50), notifications: state.notifications.slice(0, 100) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(STORAGE_KEY, json);
    }
    localStorage.setItem(CURRENT_USER_KEY, state.currentUser?.id || '');
  } catch (e) {
    handleError(e, { module: 'store', operation: 'LS_WRITE_STATE', severity: 'debug' });
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
    } catch (e) { handleError(e, { module: 'store', operation: 'LS_MIGRATE_LEGACY', severity: 'debug' }); }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') return ensureAppStateDefaults(parsed);
    }
  } catch (e) {
    handleError(e, { module: 'store', operation: 'LS_LOAD_STATE', severity: 'debug' });
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

/** Current team ID for DB queries — set by StoreProvider on login */
let _currentTeamId: string | null = null;
export function setCurrentTeamId(teamId: string | null) { _currentTeamId = teamId; }
export function getCurrentTeamId(): string | null { return _currentTeamId; }

export async function fetchAllFromSupabase(teamId?: string): Promise<AppState | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const tid = teamId || _currentTeamId || '__default__';
  try {
    const [membersRes, goalsRes, projectsRes, tasksRes, notifsRes, actsRes, linksRes, reviewsRes, categoriesRes, templatesRes, scheduleRes, notesRes, commentsRes, tagsRes, bookmarksRes, savedViewsRes, statusFlowRulesRes, automationRulesRes, sprintsRes, knowledgeRes, teamsRes, teamMembersRes, notifPrefsRes] = await Promise.allSettled([
      sb.from('members').select('*').eq('status', 'active').order('join_date'),
      sb.from('goals').select('*').eq('team_id', tid).order('level'),
      sb.from('projects').select('*').eq('team_id', tid).order('created_at', { ascending: false }),
      sb.from('tasks').select('*').eq('team_id', tid).order('created_at', { ascending: false }),
      sb.from('notifications').select('*').eq('team_id', tid).order('created_at', { ascending: false }).limit(100),
      sb.from('activities').select('*').eq('team_id', tid).order('created_at', { ascending: false }).limit(100),
      sb.from('item_links').select('*').eq('team_id', tid),
      sb.from('reviews').select('*').eq('team_id', tid).order('created_at', { ascending: false }),
      sb.from('categories').select('*').eq('team_id', tid).order('created_at'),
      sb.from('templates').select('*').eq('team_id', tid).order('created_at', { ascending: false }),
      sb.from('schedule_events').select('*').eq('team_id', tid).order('start_date'),
      sb.from('notes').select('*').eq('team_id', tid).order('updated_at', { ascending: false }),
      sb.from('comments').select('*').eq('team_id', tid).order('created_at', { ascending: false }),
      sb.from('tags').select('*').eq('team_id', tid).order('created_at'),
      sb.from('bookmarks').select('*').eq('team_id', tid).order('created_at'),
      sb.from('saved_views').select('*').eq('team_id', tid).order('created_at', { ascending: false }),
      sb.from('status_flow_rules').select('*').eq('team_id', tid).order('created_at'),
      sb.from('automation_rules').select('*').eq('team_id', tid).order('created_at', { ascending: false }),
      sb.from('sprints').select('*').eq('team_id', tid).order('created_at', { ascending: false }),
      sb.from('knowledge').select('*').eq('team_id', tid).order('updated_at', { ascending: false }),
      sb.from('teams').select('*').order('created_at'),
      sb.from('team_members').select('*'),
      sb.from('notification_preferences').select('*').eq('team_id', tid),
    ]);
    const val = (r: PromiseSettledResult<unknown>) => r.status === 'fulfilled' ? r.value : null;
    const data = (r: { data?: unknown } | null) => Array.isArray(r?.data) ? r.data : [];
    const membersRes0 = val(membersRes);
    if (membersRes0?.error) { console.error('Supabase fetch error [members]:', membersRes0.error); return null; }

    // Filter members to those in the current team
    const allMembers = data(membersRes0).map(toCamel) as Member[];
    const teamMemberLinks = data(val(teamMembersRes)).map(toCamel);
    const memberIdsInTeam = new Set(teamMemberLinks.filter((tm: { teamId: string }) => tm.teamId === tid).map((tm: { memberId: string }) => tm.memberId));
    const teamMembers = allMembers.filter(m => memberIdsInTeam.has(m.id) || m.teamId === tid);

    let savedUserId: string | null = null;
    try { savedUserId = localStorage.getItem(CURRENT_USER_KEY); } catch (e) { handleError(e, { module: 'store', operation: 'LS_READ_USER', severity: 'debug' }); }
    const savedUser = savedUserId ? teamMembers.find(m => m.id === savedUserId) : null;

    return ensureAppStateDefaults({
      members: teamMembers,
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
      notificationPreferences: data(val(notifPrefsRes)).map(toCamel) as NotificationPreference[],
      currentUser: savedUser || null,
      tags: data(val(tagsRes)).map(toCamel),
      bookmarks: data(val(bookmarksRes)).map(toCamel) as Bookmark[],
      savedViews: data(val(savedViewsRes)).map(toCamel) as SavedView[],
      statusFlowRules: data(val(statusFlowRulesRes)).map(toCamel),
      automationRules: initFactoryRulesIfNeeded(data(val(automationRulesRes)).map(toCamel)),
      sprints: data(val(sprintsRes)).map(toCamel),
      knowledge: data(val(knowledgeRes)).map(toCamel) as Knowledge[],
      teams: data(val(teamsRes)).map(toCamel),
      teamMembers: teamMemberLinks,
      currentTeamId: tid,
    });
  } catch (e) { handleError(e, { module: 'store', operation: 'DB_FETCH_ALL', severity: 'error' }); return null; }
}

// Module-level write error callback — set by StoreProvider to dispatch ADD_NOTIFICATION
let _onWriteError: ((msg: string) => void) | null = null;
export function setOnWriteError(cb: (msg: string) => void) { _onWriteError = cb; }

// S3-1a: Conflict callback — set by StoreProvider to fetch latest & dispatch REALTIME_UPSERT
let _onConflict: ((table: string, id: string) => void) | null = null;
export function setOnConflict(cb: (table: string, id: string) => void) { _onConflict = cb; }

// Failed write queue — persisted to localStorage so tab close doesn't lose data.
// S3-1c: SerializedWriteOp for cross-page replay
interface SerializedWriteOp {
  op: 'update' | 'insert' | 'delete' | 'upsert';
  table: string;
  id?: string;           // for update/delete
  data?: Record<string, unknown>;  // for update/insert
  dataArray?: Record<string, unknown>[];  // for upsert (batch)
  oldUpdatedAt?: string;  // for optimistic lock replay
}
interface PendingWrite { fn: () => Promise<unknown>; label: string; addedAt: number; version: number; serialized?: SerializedWriteOp; }
const failedWrites: PendingWrite[] = [];
const PENDING_WRITES_KEY = 'tbh-pending-writes';
const MAX_PENDING_WRITES = 100;
let _writeVersion = 0;
export function bumpWriteVersion() { _writeVersion++; }

// S3-1c: Auto-retry interval (30s)
let _retryIntervalId: ReturnType<typeof setInterval> | null = null;
export function startAutoRetry() {
  if (_retryIntervalId) return;
  _retryIntervalId = setInterval(() => {
    if (failedWrites.length > 0) replayFailedWrites();
  }, 30000);
}
export function stopAutoRetry() {
  if (_retryIntervalId) { clearInterval(_retryIntervalId); _retryIntervalId = null; }
}

// Persist pending writes metadata to localStorage (for crash/tab-close resilience)
// S3-1c: includes serialized op for cross-page replay
function persistPendingMeta() {
  try {
    const meta = failedWrites.map(w => ({ label: w.label, addedAt: w.addedAt, version: w.version, serialized: w.serialized }));
    localStorage.setItem(PENDING_WRITES_KEY, JSON.stringify(meta));
  } catch (e) { handleError(e, { module: 'store', operation: 'LS_WRITE_PENDING', severity: 'debug' }); }
}
function loadPendingMeta() {
  try {
    const raw = localStorage.getItem(PENDING_WRITES_KEY);
    if (!raw) return;
    const meta = JSON.parse(raw);
    if (!Array.isArray(meta)) return;
    // S3-1c: Reconstruct fn from serialized op for cross-page replay
    for (const m of meta) {
      if (failedWrites.length >= MAX_PENDING_WRITES) break;
      const fn = reconstructFn(m.serialized);
      failedWrites.push({ fn, label: m.label || 'unknown', addedAt: m.addedAt || Date.now(), version: m.version || 0, serialized: m.serialized });
    }
    // Auto-start retry if there are pending writes
    if (failedWrites.length > 0) startAutoRetry();
  } catch (e) { handleError(e, { module: 'store', operation: 'LS_LOAD_PENDING', severity: 'debug' }); }
}

/** S3-1c: Reconstruct a Supabase write function from a serialized operation */
function reconstructFn(sop: SerializedWriteOp | undefined): () => Promise<unknown> {
  if (!sop) return async () => {};
  const sb = getSupabaseClient();
  if (!sb) return async () => {};
  switch (sop.op) {
    case 'update':
      return async () => {
        let q = sb.from(sop.table).update(filterColumns(sop.table, sop.data || {}), { count: 'exact' }).eq('id', sop.id || '');
        if (sop.oldUpdatedAt) q = q.eq('updated_at', sop.oldUpdatedAt);
        const res = await q;
        if (res.error) throw res.error;
      };
    case 'insert':
      return async () => {
        const res = await sb.from(sop.table).upsert(filterColumns(sop.table, toSnake(sop.data || {})), { onConflict: 'id' });
        if (res.error) throw res.error;
      };
    case 'delete':
      return async () => {
        const res = await sb.from(sop.table).delete().eq('id', sop.id || '');
        if (res.error) throw res.error;
      };
    case 'upsert':
      return async () => {
        const snakeData = (sop.dataArray || []).map(d => filterColumns(sop.table, toSnake(d)));
        for (let i = 0; i < snakeData.length; i += 100) {
          const res = await sb.from(sop.table).upsert(snakeData.slice(i, i + 100), { onConflict: 'id' });
          if (res.error) throw res.error;
        }
      };
    default:
      return async () => {};
  }
}
loadPendingMeta();

async function withRetry(fn: () => Promise<unknown>, retries = 2, label = 'write', serialized?: SerializedWriteOp): Promise<void> {
  for (let i = 0; i <= retries; i++) {
    try { await fn(); _writeVersion++; return; } catch (e: unknown) {
      if (i === retries) {
        handleError(e, { module: 'store', operation: `DB_WRITE_${label.toUpperCase()}` as 'DB_WRITE_GOALS', severity: 'error' });
        // Queue for replay on reconnect instead of silently losing data
        if (failedWrites.length < MAX_PENDING_WRITES) {
          failedWrites.push({ fn, label, addedAt: Date.now(), version: _writeVersion, serialized });
          persistPendingMeta();
          // S3-1c: auto-start retry timer
          startAutoRetry();
        }
        _onWriteError?.('数据同步失败，已自动重试。请检查网络后刷新页面。');
        return;
      }
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}

/** Replay all queued failed writes — called when connection is restored or by auto-retry timer */
export async function replayFailedWrites(): Promise<void> {
  if (failedWrites.length === 0) return;
  const batch = failedWrites.splice(0, failedWrites.length);
  persistPendingMeta(); // Clear persisted list since we're replaying
  for (const pw of batch) {
    // Skip writes from stale versions — newer writes may have already made this obsolete
    if (pw.version < _writeVersion) {continue;
    }
    try { await pw.fn(); _writeVersion++; } catch (e) {
      handleError(e, { module: 'store', operation: 'DB_WRITE_REPLAY', severity: 'error' });
      if (failedWrites.length < MAX_PENDING_WRITES) {
        failedWrites.push({ ...pw, addedAt: Date.now(), version: _writeVersion });
        persistPendingMeta();
      }
    }
  }
  // S3-1c: stop auto-retry if queue is now empty
  if (failedWrites.length === 0) stopAutoRetry();
}

/** Whitelist of DB columns per table — prevents sending unknown columns that cause 400 errors */
const TABLE_COLUMNS: Record<string, Set<string> | null> = {
  goals: new Set(['id','title','description','type','status','parent_id','level','start_date','end_date','owner_id','key_results','progress','created_at','updated_at','leader_id','supporter_ids','canvas_x','canvas_y','priority','tags','category','repeat_cycle','discussion_thread_id','summary','tracking_records','attachments','selected_kr_ids','team_id','deleted_at']),
  projects: new Set(['id','title','description','goal_id','status','start_date','end_date','owner_id','member_ids','task_count','progress','created_at','updated_at','leader_id','supporter_ids','parent_id','canvas_x','canvas_y','priority','tags','category','repeat_cycle','discussion_thread_id','summary','tracking_records','attachments','team_id','deleted_at']),
  tasks: new Set(['id','title','description','project_id','goal_id','status','priority','assignee_id','owner_id','start_date','due_date','reminder_date','completed_at','subtasks','tags','created_at','updated_at','leader_id','supporter_ids','canvas_x','canvas_y','parent_id','category','repeat_cycle','discussion_thread_id','summary','tracking_records','attachments','blocked_by','sprint_id','team_id','deleted_at']),
  members: new Set(['id','name','role','department','avatar','email','status','join_date','created_at','updated_at','nickname','phone','wechat_id','permissions','team_id']),
  notifications: new Set(['id','type','title','message','related_id','related_type','member_id','read','created_at','team_id','level']),
  notification_preferences: new Set(['id','member_id','item_id','item_type','muted','created_at','team_id']),
  activities: new Set(['id','member_id','action','target_type','target_id','target_title','details','created_at','team_id']),
  behavior_events: new Set(['id','user_id','event_type','entity_type','entity_id','metadata','created_at']),
  item_links: new Set(['id','source_id','source_type','target_id','target_type','label','created_at','team_id']),
  reviews: new Set(['id','period','period_start','period_end','member_id','content','improvements','metrics','created_at','updated_at','team_id']),
  categories: new Set(['id','name','color','icon','applies_to','created_at','updated_at','team_id']),
  tags: new Set(['id','name','color','created_at','updated_at','team_id']),
  templates: new Set(['id','title','description','type','content','created_by','updated_by','is_public','category','created_at','updated_at','team_id']),
  schedule_events: new Set(['id','title','description','start_date','end_date','all_day','color','linked_item_id','linked_item_type','member_id','repeat_cycle','created_at','updated_at','team_id']),
  notes: new Set(['id','title','content','folder','color','is_pinned','linked_item_id','linked_item_type','created_by','updated_by','created_at','updated_at','category','tags','team_id']),
  comments: new Set(['id','item_id','item_type','member_id','member_name','content','created_at','mentioned_member_ids','is_read','follow_up_required','follow_up_status','team_id','parent_id','attachments']),
  bookmarks: new Set(['id','title','url','category','icon','order','member_id','created_at','updated_at','team_id']),
  saved_views: new Set(['id','name','type','filters','filter_logic','member_id','updated_at','created_at','team_id']),
  status_flow_rules: new Set(['id','from_status','to_status','allowed_roles','auto_actions','created_at','updated_at','team_id']),
  automation_rules: new Set(['id','name','enabled','item_type','trigger','condition','actions','created_at','updated_at','team_id']),
  sprints: new Set(['id','name','start_date','end_date','goal_ids','status','created_at','updated_at','team_id']),
  knowledge: new Set(['id','title','content','tags','member_id','related_items','created_at','updated_at','team_id']),
  teams: new Set(['id','name','description','avatar','invite_code','owner_id','settings','created_at','updated_at']),
  team_members: new Set(['id','team_id','member_id','role','permissions','joined_at']),
};

/** Columns that reference other tables via FK — empty strings must become null */
const FK_COLUMNS = new Set(['owner_id','leader_id','supporter_ids','assignee_id','parent_id','goal_id','project_id','member_id','linked_item_id','source_id','target_id','related_id','item_id','created_by','updated_by']);

/** Remove keys not present in DB table schema to avoid PostgREST 400 errors.
 *  Converts empty strings to null only for FK columns (Postgres treats '' as non-null). */
function filterColumns(table: string, snakeData: Record<string, unknown>): Record<string, unknown> {
  const allowed = TABLE_COLUMNS[table];
  if (!allowed) return snakeData; // unknown table — pass through (e.g. bookmarks/saved_views)
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(snakeData)) {
    if (!allowed.has(k)) continue;
    filtered[k] = (v === '' && FK_COLUMNS.has(k)) ? null : v;
  }
  return filtered;
}

export async function supabaseUpsert(table: string, data: Record<string, unknown> | Record<string, unknown>[]) {
  const sb = getSupabaseClient();
  if (!sb) return;
  const arr = Array.isArray(data) ? data : [data];
  const snakeData = arr.map(d => filterColumns(table, toSnake(d)));
  // S3-1c: serialize write intent for cross-page replay
  const serialized: SerializedWriteOp = { op: 'upsert', table, dataArray: arr };
  await withRetry(async () => {
    for (let i = 0; i < snakeData.length; i += 100) {
      const res = await sb.from(table).upsert(snakeData.slice(i, i + 100), { onConflict: 'id' });
      if (res.error) throw res.error;
    }
  }, 2, `upsert_${table}`, serialized);
}

export async function supabaseUpdate(table: string, id: string, data: Record<string, unknown>, oldUpdatedAt?: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  // S3-1c: serialize write intent for cross-page replay
  const serialized: SerializedWriteOp = { op: 'update', table, id, data, oldUpdatedAt };
  await withRetry(async () => {
    let q = sb.from(table).update(filterColumns(table, toSnake(data)), { count: 'exact' }).eq('id', id);
    // Optimistic locking (DAT-01): only apply if record hasn't changed since last read
    if (oldUpdatedAt) q = q.eq('updated_at', oldUpdatedAt);
    const res = await q;
    if (res.error) throw res.error;
    // If optimistic lock was specified but no rows affected, data was modified elsewhere
    if (oldUpdatedAt && res.count === 0) {
      console.warn(`[supabaseUpdate] optimistic lock conflict: ${table}/${id}`);
      _onWriteError?.('数据已被其他人修改，正在刷新最新数据…');
      // S3-1a: Auto-rollback — fetch latest version and notify store
      _onConflict?.(table, id);
    }
  }, 2, `update_${table}`, serialized);
}

export async function supabaseInsert(table: string, data: Record<string, unknown>) {
  const sb = getSupabaseClient();
  if (!sb) return;
  // S3-1c: serialize write intent for cross-page replay
  const serialized: SerializedWriteOp = { op: 'insert', table, data };
  await withRetry(async () => {
    const res = await sb.from(table).upsert(filterColumns(table, toSnake(data)), { onConflict: 'id' });
    if (res.error) throw res.error;
  }, 2, `insert_${table}`, serialized);
}

export async function supabaseDelete(table: string, id: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  // S3-1c: serialize write intent for cross-page replay
  const serialized: SerializedWriteOp = { op: 'delete', table, id };
  await withRetry(async () => {
    const res = await sb.from(table).delete().eq('id', id);
    if (res.error) throw res.error;
  }, 2, `delete_${table}`, serialized);
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
    }).catch(() => {});
  } catch (e) { handleError(e, { module: 'store', operation: 'LOG_ACTIVITY', severity: 'debug' }); }
}
