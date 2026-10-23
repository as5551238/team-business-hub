import type { AppState, Goal, Project, Task, Member, SubTask } from '@/types';
import { getSupabaseClient } from '@/supabase/client';
import { STORAGE_KEY, CURRENT_USER_KEY, ensureAppStateDefaults, toCamel, toSnake } from './types';
import type { Notification, Activity, ItemLink, Category, Template, ScheduleEvent, Note, Comment, ReviewEntry, Bookmark, SavedView, Knowledge } from '@/types';
import { initFactoryRulesIfNeeded } from './shared';

// ==== SYNC-01: 通知云端写入规范化层 ====
// 线上数据库 notifications 表 check 约束(实测 2026-10-22):
//   type ∈ {reminder,overdue,assigned,completed,goal_update}
//   related_type ∈ {task,goal,project}
// 本地 UI 使用扩展值(error/sync/mentioned/system/risk_alert/note/knowledge...)语义,
// 本地 state 保留原值; 仅写云端时映射到合法白名单, 防止 400 → 自激通知死循环。
const DB_NOTIFICATION_TYPES = new Set(['reminder', 'overdue', 'assigned', 'completed', 'goal_update']);
const DB_RELATED_TYPES = new Set(['task', 'goal', 'project']);
const NOTIFICATION_TYPE_MAP: Record<string, string> = {
  error: 'goal_update', sync: 'reminder', mentioned: 'assigned', mention: 'assigned',
  system: 'goal_update', risk_alert: 'overdue', info: 'goal_update',
  comment: 'assigned', approval: 'assigned',
};
const RELATED_TYPE_MAP: Record<string, string> = {
  note: 'task', knowledge: 'goal', member: 'task', comment: 'task', sprint: 'goal',
  template: 'task', review: 'goal', activity: 'task', schedule: 'task', bookmark: 'task',
  saved_view: 'task',
};
/** Map local notification values to DB-legal values (camelCase payload stage, idempotent). */
export function normalizeNotificationForDb(n: Record<string, any>): Record<string, any> {
  const type = typeof n.type === 'string' ? n.type : '';
  const rt = typeof n.relatedType === 'string' ? n.relatedType
    : (typeof n.related_type === 'string' ? n.related_type : '');
  return {
    ...n,
    type: DB_NOTIFICATION_TYPES.has(type) ? type : (NOTIFICATION_TYPE_MAP[type] || 'goal_update'),
    relatedType: DB_RELATED_TYPES.has(rt) ? rt : (RELATED_TYPE_MAP[rt] || 'task'),
    // SYNC-08: notifications table requires related_id/team_id NOT NULL —
    // automaton payloads omit them entirely; backfill before column filtering.
    relatedId: n.relatedId !== undefined ? n.relatedId : (n.related_id !== undefined ? n.related_id : ''),
    teamId: n.teamId !== undefined ? n.teamId : (n.team_id !== undefined ? n.team_id : (getCurrentTeamId() || '__default__')),
    read: n.read ?? false,
    createdAt: n.createdAt ?? new Date().toISOString(),
  };
}
/** Apply table-specific normalization before column filtering (camelCase stage). */
function normalizeForDb(table: string, data: Record<string, any>): Record<string, any> {
  return table === 'notifications' ? normalizeNotificationForDb(data) : data;
}

// ==== SYNC-02: 确定性错误分类 ====
/** PostgREST/PG errors that will never succeed on retry (constraints, auth, schema).
 *  Retrying or queuing them wastes requests and feeds the error-notification loop. */
export function isPermanentWriteError(e: unknown): boolean {
  const err = e as { code?: unknown; status?: unknown; message?: unknown } | null;
  if (!err) return false;
  const code = typeof err.code === 'string' ? err.code : '';
  const status = typeof err.status === 'number' ? err.status : 0;
  if ([400, 401, 403, 404, 409, 422].includes(status)) return true;
  if (/^(23|42|53)/.test(code)) return true; // PG: constraint/schema/resource classes
  if (/^PGRST/.test(code)) return true;        // PostgREST application errors
  return false;
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
      if (parsed && typeof parsed === 'object') {
        const recovered = ensureAppStateDefaults(parsed);
        if (Array.isArray(recovered.notifications)) {
          recovered.notifications = recoverPollutedNotifications(recovered.notifications);
        }
        return recovered;
      }
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

/** Current team ID for DB queries — set by StoreProvider on login */
let _currentTeamId: string | null = null;
export function setCurrentTeamId(teamId: string | null) { _currentTeamId = teamId; }
export function getCurrentTeamId(): string | null { return _currentTeamId; }

export async function fetchAllFromSupabase(teamId?: string): Promise<AppState | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const tid = teamId || _currentTeamId || '__default__';
  try {
    const [membersRes, goalsRes, projectsRes, tasksRes, notifsRes, actsRes, linksRes, reviewsRes, categoriesRes, templatesRes, scheduleRes, notesRes, commentsRes, tagsRes, bookmarksRes, savedViewsRes, statusFlowRulesRes, automationRulesRes, sprintsRes, knowledgeRes, teamsRes, teamMembersRes] = await Promise.allSettled([
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
    ]);
    const val = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? r.value : null;
    const data = (r: any) => Array.isArray(r?.data) ? r.data : [];
    const membersRes0 = val(membersRes);
    if (membersRes0?.error) { console.error('Supabase fetch error [members]:', membersRes0.error); return null; }

    // Filter members to those in the current team
    const allMembers = data(membersRes0).map(toCamel) as Member[];
    const teamMemberLinks = data(val(teamMembersRes)).map(toCamel);
    const memberIdsInTeam = new Set(teamMemberLinks.filter((tm: any) => tm.teamId === tid).map((tm: any) => tm.memberId));
    // P2#21 fix: if team_members query failed/empty, fall back to showing all active members
    // (better to show all members than to show zero members)
    const teamMembers = teamMemberLinks.length > 0
      ? allMembers.filter(m => memberIdsInTeam.has(m.id) || m.teamId === tid)
      : allMembers;

    let savedUserId: string | null = null;
    try { savedUserId = localStorage.getItem(CURRENT_USER_KEY); } catch {}
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
  } catch (e) { console.error('Supabase fetch failed:', e); return null; }
}

// Module-level write error callback — set by StoreProvider to dispatch ADD_NOTIFICATION
let _onWriteError: ((msg: string) => void) | null = null;
export function setOnWriteError(cb: (msg: string) => void) { _onWriteError = cb; }

// SYNC-04: storage-warning throttle — "本地存储空间不足" fired on every save when state
// stayed above threshold; each warning was itself an ADD_NOTIFICATION feeding the loop.
const STORAGE_WARN_INTERVAL_MS = 5 * 60 * 1000;
let _lastStorageWarnAt = 0;

export function saveLocalStateImmediate(state: AppState) {
  try {
    const json = JSON.stringify(state);
    // DAT-06: check size before write (localStorage limit ~5-10MB)
    if (json.length > 4 * 1024 * 1024) {
      console.warn(`[saveLocalState] state too large (${(json.length / 1024 / 1024).toFixed(1)}MB), truncating activities/notifications`);
      // arrays are newest-first (fetch order created_at desc / unshift) — keep the head
      const trimmed = { ...state, activities: state.activities.slice(0, 50), notifications: state.notifications.slice(0, 200) };
      const trimmedJson = JSON.stringify(trimmed);
      localStorage.setItem(STORAGE_KEY, trimmedJson.length > json.length ? json : trimmedJson);
      const now = Date.now();
      if (now - _lastStorageWarnAt > STORAGE_WARN_INTERVAL_MS) {
        _lastStorageWarnAt = now;
        _onWriteError?.('本地存储空间不足，已自动清理旧活动记录和通知。');
      }
    } else {
      localStorage.setItem(STORAGE_KEY, json);
    }
    localStorage.setItem(CURRENT_USER_KEY, state.currentUser?.id || '');
  } catch (e) {
    console.error('[saveLocalState] localStorage write failed (possibly full):', e);
  }
}

// SYNC-05: one-time recovery for state polluted by the historical error-notification loop —
// old sessions accumulated thousands of duplicated err-/sync- system notices.
const ERR_NOTIFICATION_KEEP = 10;
function recoverPollutedNotifications(notifications: Notification[]): Notification[] {
  const isSystemErr = (n: Notification) => typeof n.id === 'string' && (n.id.startsWith('err-') || n.id.startsWith('sync-'));
  const errNotifs = notifications.filter(isSystemErr);
  if (errNotifs.length <= ERR_NOTIFICATION_KEEP * 2) return notifications;
  const keptRecent = errNotifs.slice(0, ERR_NOTIFICATION_KEEP);
  const keptSet = new Set(keptRecent.map(n => n.id));
  return notifications.filter(n => !isSystemErr(n) || keptSet.has(n.id));
}

// Failed write queue — persisted to localStorage so tab close doesn't lose data.
interface SerializedWrite {
  table: string;
  operation: 'insert' | 'update' | 'upsert' | 'delete';
  id?: string;
  data?: Record<string, any> | Record<string, any>[];
  oldUpdatedAt?: string;
}
interface PendingWrite { fn: () => Promise<any>; label: string; addedAt: number; version: number; serialized?: SerializedWrite; }
const failedWrites: PendingWrite[] = [];
const PENDING_WRITES_KEY = 'tbh-pending-writes';
const MAX_PENDING_WRITES = 100;
let _writeVersion = 0;
export function bumpWriteVersion() { _writeVersion++; }

// Persist pending writes metadata to localStorage (for crash/tab-close resilience)
// SYNC-06: cap serialized size so the queue itself cannot exhaust localStorage.
const PENDING_META_MAX_BYTES = 512 * 1024;
function persistPendingMeta() {
  try {
    let meta = failedWrites.map(w => ({ label: w.label, addedAt: w.addedAt, version: w.version, serialized: w.serialized }));
    // Drop oldest entries until under cap (old entries are least likely to still matter)
    while (JSON.stringify(meta).length > PENDING_META_MAX_BYTES && meta.length > 0) {
      meta.shift();
      const failedShift = failedWrites.shift();
      if (!failedShift) break;
    }
    localStorage.setItem(PENDING_WRITES_KEY, JSON.stringify(meta));
  } catch {}
}
function loadPendingMeta() {
  try {
    const raw = localStorage.getItem(PENDING_WRITES_KEY);
    if (!raw) return;
    const meta = JSON.parse(raw);
    if (!Array.isArray(meta)) return;
    for (const m of meta) {
      if (failedWrites.length < MAX_PENDING_WRITES) {
        failedWrites.push({ fn: m.serialized ? reconstructWriteFn(m.serialized) : async () => {}, label: m.label, addedAt: m.addedAt, version: m.version, serialized: m.serialized });
      }
    }
  } catch {}
}
loadPendingMeta();

/** Reconstruct a write function from serialized data — enables replay after page reload */
function reconstructWriteFn(sw: SerializedWrite): () => Promise<any> {
  return async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    switch (sw.operation) {
      case 'insert':
      case 'upsert': {
        const arr = Array.isArray(sw.data) ? sw.data : [sw.data!];
        const snakeData = arr.map(d => filterColumns(sw.table, toSnake(d)));
        for (let i = 0; i < snakeData.length; i += 100) {
          const res = await sb.from(sw.table).upsert(snakeData.slice(i, i + 100), { onConflict: 'id' });
          if (res.error) throw res.error;
        }
        break;
      }
      case 'update': {
        let q = sb.from(sw.table).update(filterColumns(sw.table, toSnake(sw.data as Record<string, any>)), { count: 'exact' }).eq('id', sw.id!);
        if (sw.oldUpdatedAt) q = q.eq('updated_at', sw.oldUpdatedAt);
        const res = await q;
        if (res.error) throw res.error;
        break;
      }
      case 'delete': {
        const res = await sb.from(sw.table).delete().eq('id', sw.id!);
        if (res.error) throw res.error;
        break;
      }
    }
  };
}

async function withRetry(fn: () => Promise<any>, retries = 2, label = 'write', serialized?: SerializedWrite): Promise<void> {
  for (let i = 0; i <= retries; i++) {
    try { await fn(); _writeVersion++; return; } catch (e: unknown) {
      // SYNC-02: deterministic errors (constraint violations, schema/auth) can never succeed
      // on retry — don't retry, don't queue, and critically don't fire a user notification
      // (that path is what created the error-notification infinite loop).
      if (isPermanentWriteError(e)) {
        console.error(`Supabase ${label} permanent failure (will not retry/queue):`, e);
        return;
      }
      if (i === retries) {
        console.error(`Supabase ${label} failed after retries:`, e);
        // Queue for replay on reconnect instead of silently losing data
        if (failedWrites.length < MAX_PENDING_WRITES) {
          failedWrites.push({ fn, label, addedAt: Date.now(), version: _writeVersion, serialized });
          persistPendingMeta();
        }
        _onWriteError?.('数据同步失败，已自动重试。请检查网络后刷新页面。');
        return;
      }
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}

/** Replay all queued failed writes — called when connection is restored */
export async function replayFailedWrites(): Promise<void> {
  if (failedWrites.length === 0) return;
  const batch = failedWrites.splice(0, failedWrites.length);
  persistPendingMeta(); // Clear persisted list since we're replaying
  if (import.meta.env.DEV) console.log(`[Supabase] Replaying ${batch.length} queued writes...`);
  for (const pw of batch) {
    // Skip writes from stale versions — newer writes may have already made this obsolete
    if (pw.version < _writeVersion) {
      if (import.meta.env.DEV) console.log(`[Supabase] Skipping stale write for ${pw.label} (v${pw.version} < v${_writeVersion})`);
      continue;
    }
    try { await pw.fn(); } catch (e) {
      console.error(`[Supabase] Replay failed for ${pw.label}:`, e);
      // SYNC-02: permanent failures (e.g. constraint violations) must not re-enter the queue,
      // otherwise every "online" event replays them forever.
      if (!isPermanentWriteError(e) && failedWrites.length < MAX_PENDING_WRITES) {
        failedWrites.push({ ...pw, addedAt: Date.now(), version: _writeVersion });
        persistPendingMeta();
      }
    }
  }
}

/** Whitelist of DB columns per table — prevents sending unknown columns that cause 400 errors */
const TABLE_COLUMNS: Record<string, Set<string> | null> = {
  goals: new Set(['id','title','description','type','status','parent_id','level','start_date','end_date','owner_id','key_results','progress','created_at','updated_at','leader_id','supporter_ids','canvas_x','canvas_y','priority','tags','category','repeat_cycle','discussion_thread_id','summary','tracking_records','attachments','selected_kr_ids','team_id','deleted_at','app_type','approval_status','dual_track']),
  projects: new Set(['id','title','description','goal_id','status','start_date','end_date','owner_id','member_ids','task_count','progress','created_at','updated_at','leader_id','supporter_ids','parent_id','canvas_x','canvas_y','priority','tags','category','repeat_cycle','discussion_thread_id','summary','tracking_records','attachments','team_id','deleted_at','app_type']),
  tasks: new Set(['id','title','description','project_id','goal_id','status','priority','assignee_id','owner_id','start_date','due_date','reminder_date','completed_at','subtasks','tags','created_at','updated_at','leader_id','supporter_ids','canvas_x','canvas_y','parent_id','category','repeat_cycle','discussion_thread_id','summary','tracking_records','attachments','blocked_by','sprint_id','team_id','deleted_at','app_type','kr_id']),
  members: new Set(['id','name','role','department','avatar','email','status','join_date','created_at','updated_at','nickname','phone','wechat_id','permissions','team_id']),
  notifications: new Set(['id','type','title','message','related_id','related_type','member_id','read','created_at','team_id']),
  activities: new Set(['id','member_id','action','target_type','target_id','target_title','details','created_at','team_id']),
  behavior_events: new Set(['id','user_id','event_type','entity_type','entity_id','metadata','created_at']),
  item_links: new Set(['id','source_id','source_type','target_id','target_type','label','created_at','team_id']),
  reviews: new Set(['id','period','period_start','period_end','member_id','content','improvements','metrics','created_at','updated_at','team_id']),
  categories: new Set(['id','name','color','icon','applies_to','created_at','team_id']),
  tags: new Set(['id','name','color','created_at','updated_at','team_id']),
  templates: new Set(['id','title','description','type','content','created_by','updated_by','is_public','category','created_at','updated_at','team_id']),
  schedule_events: new Set(['id','title','description','start_date','end_date','all_day','color','linked_item_id','linked_item_type','member_id','repeat_cycle','created_at','updated_at','team_id']),
  notes: new Set(['id','title','content','folder','color','is_pinned','linked_item_id','linked_item_type','created_by','updated_by','created_at','updated_at','category','tags','team_id']),
  comments: new Set(['id','item_id','item_type','member_id','member_name','content','created_at','mentioned_member_ids','is_read','follow_up_required','follow_up_status','team_id']),
  bookmarks: new Set(['id','title','url','category','icon','order','member_id','created_at','team_id']),
  saved_views: new Set(['id','name','type','filters','filter_logic','member_id','updated_at','created_at','team_id']),
  status_flow_rules: new Set(['id','item_type','from_status','to_status','allowed_roles','auto_actions','enabled','name','created_at','updated_at','team_id']),
  automation_rules: new Set(['id','name','enabled','item_type','trigger','condition','actions','created_at','updated_at','team_id']),
  sprints: new Set(['id','name','start_date','end_date','goal_ids','status','created_at','updated_at','team_id']),
  knowledge: new Set(['id','title','content','category','tags','status','assignee_id','priority','due_date','metadata','visibility','member_id','related_items','color','created_at','updated_at','team_id']),
  teams: new Set(['id','name','description','avatar','invite_code','owner_id','settings','created_at','updated_at']),
  team_members: new Set(['id','team_id','member_id','role','permissions','joined_at']),
};

/** Columns that reference other tables via FK — empty strings must become null.
 *  NOTE: related_id is NOT here — in the DB it is plain text NOT NULL (no FK),
 *  and nulling '' would violate the constraint (SYNC-08). */
const FK_COLUMNS = new Set(['owner_id','leader_id','supporter_ids','assignee_id','parent_id','goal_id','project_id','member_id','linked_item_id','source_id','target_id','item_id','created_by','updated_by']);

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
  const snakeData = arr.map(d => filterColumns(table, toSnake(normalizeForDb(table, d))));
  await withRetry(async () => {
    for (let i = 0; i < snakeData.length; i += 100) {
      const res = await sb.from(table).upsert(snakeData.slice(i, i + 100), { onConflict: 'id' });
      if (res.error) throw res.error;
    }
  }, 2, `upsert:${table}`, { table, operation: 'upsert', data });
}

export async function supabaseUpdate(table: string, id: string, data: Record<string, any>, oldUpdatedAt?: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  await withRetry(async () => {
    let q = sb.from(table).update(filterColumns(table, toSnake(normalizeForDb(table, data))), { count: 'exact' }).eq('id', id);
    // Optimistic locking (DAT-01): only apply if record hasn't changed since last read
    if (oldUpdatedAt) q = q.eq('updated_at', oldUpdatedAt);
    const res = await q;
    if (res.error) throw res.error;
    // If optimistic lock was specified but no rows affected, data was modified elsewhere
    if (oldUpdatedAt && res.count === 0) {
      console.warn(`[supabaseUpdate] optimistic lock conflict: ${table}/${id}`);
      _onWriteError?.('数据已被其他人修改，请刷新页面后重试。');
    }
  }, 2, `update:${table}/${id}`, { table, operation: 'update', id, data, oldUpdatedAt });
}

export async function supabaseInsert(table: string, data: Record<string, any>) {
  const sb = getSupabaseClient();
  if (!sb) return;
  await withRetry(async () => {
    const res = await sb.from(table).upsert(filterColumns(table, toSnake(normalizeForDb(table, data))), { onConflict: 'id' });
    if (res.error) throw res.error;
  }, 2, `insert:${table}`, { table, operation: 'insert', data });
}

/** SYNC-03: fire-and-forget write for system error notifications. Failures are logged only —
 *  never surfaced via _onWriteError, because dispatching a new error notification for a failed
 *  error-notification write is the exact self-exciting loop we must break. */
export async function supabaseInsertSilent(table: string, data: Record<string, any>) {
  const sb = getSupabaseClient();
  if (!sb) return;
  try {
    const res = await sb.from(table).upsert(filterColumns(table, toSnake(normalizeForDb(table, data))), { onConflict: 'id' });
    if (res.error) throw res.error;
  } catch (e) {
    console.warn(`[Supabase] silent ${table} write failed (not retried, no user notification):`, e);
  }
}

export async function supabaseDelete(table: string, id: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  await withRetry(async () => {
    const res = await sb.from(table).delete().eq('id', id);
    if (res.error) throw res.error;
  }, 2, `delete:${table}/${id}`, { table, operation: 'delete', id });
}

/** Audit log: fire-and-forget write to activities table (SEC-06).
 *  Skips if no Supabase client or no current user. Never throws.
 *  SYNC-07: DB check constraint only allows target_type in ('task','goal','project');
 *  callers pass Chinese labels ("任务") or state keys ("notifications") — normalize here. */
const ACTIVITY_TARGET_TYPE_MAP: Record<string, string> = {
  '任务': 'task', '目标': 'goal', '项目': 'project',
  task: 'task', goal: 'goal', project: 'project',
  // state-key style values (reducer MERGE_STATE conflict logging passes raw keys)
  notifications: 'task', notification: 'task', activities: 'task', activity: 'task',
  comments: 'task', comment: 'task', tags: 'task', tag: 'task', member: 'task',
  members: 'task', savedViews: 'task', bookmarks: 'task', itemLinks: 'task',
  scheduleEvents: 'task', templates: 'task', categories: 'task', sprints: 'goal',
  knowledge: 'goal', notes: 'goal', note: 'goal', reviews: 'goal',
};
export function logActivity(params: { memberId?: string; action: string; targetType: string; targetId: string; targetTitle: string; details?: string }) {
  try {
    const sb = getSupabaseClient();
    if (!sb || !params.memberId) return;
    const targetType = ACTIVITY_TARGET_TYPE_MAP[params.targetType] || 'task';
    // Fire-and-forget: don't await, don't block caller
    sb.from('activities').insert({
      member_id: params.memberId,
      action: params.action,
      target_type: targetType,
      target_id: params.targetId,
      target_title: params.targetTitle.slice(0, 200),
      details: (params.details || '').slice(0, 500),
    }).then(() => {}, () => {});
  } catch {}
}
