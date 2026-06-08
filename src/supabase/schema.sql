-- ============================================================
-- 团队业务中台 数据库 Schema (V2 — 安全加固版)
-- 在 Supabase SQL Editor 中执行此脚本
-- 变更记录: RLS from using(true) → team_id隔离+角色权限
-- ============================================================

-- 启用必要扩展
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";  -- 用于字段加密

-- ==================== 辅助函数 ====================

/** 获取当前请求的团队ID (由前端通过 set_config 设置) */
create or replace function app_current_team_id()
returns text as $$
  select current_setting('app.current_team_id', true);
$$ language sql stable;

/** 获取当前请求的用户ID (由前端通过 set_config 设置) */
create or replace function app_current_user_id()
returns text as $$
  select current_setting('app.current_user_id', true);
$$ language sql stable;

/** 判断当前用户是否为指定团队的成员 */
create or replace function is_team_member(tid text)
returns boolean as $$
  select exists (
    select 1 from team_members
    where team_id = tid
      and member_id = app_current_user_id()
  );
$$ language sql stable security definer;

/** 判断当前用户在指定团队中的角色 */
create or replace function user_role_in_team(tid text)
returns text as $$
  select tm.role from team_members tm
  where tm.team_id = tid
    and tm.member_id = app_current_user_id()
  limit 1;
$$ language sql stable security definer;

/** 判断当前用户是否为团队管理员 */
create or replace function is_team_admin(tid text)
returns boolean as $$
  select user_role_in_team(tid) in ('admin', 'manager');
$$ language sql stable security definer;

-- ==================== 团队表 ====================
create table if not exists teams (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  description text,
  avatar text not null default '',
  invite_code text not null default gen_random_uuid()::text,
  owner_id text,
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ==================== 团队-成员关联表 ====================
create table if not exists team_members (
  id text primary key default gen_random_uuid()::text,
  team_id text not null references teams(id) on delete cascade,
  member_id text not null references members(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'manager', 'leader', 'member')),
  permissions jsonb default '[]'::jsonb,
  joined_at timestamptz default now(),
  unique(team_id, member_id)
);

-- ==================== 成员表 ====================
create table if not exists members (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  role text not null default 'member' check (role in ('admin', 'manager', 'leader', 'member')),
  department text not null default '',
  avatar text not null default '',
  email text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  join_date text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  nickname text default '',
  phone text default '',
  wechat_id text default '',
  permissions jsonb default '[]'::jsonb,
  team_id text
);

-- ==================== 目标表 ====================
create table if not exists goals (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  description text,
  type text not null default 'okr' check (type in ('okr', 'kpi', 'milestone')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'blocked', 'cancelled')),
  parent_id text references goals(id) on delete cascade,
  level int not null default 0,
  start_date text not null,
  end_date text not null,
  owner_id text references members(id),
  key_results jsonb default '[]'::jsonb,
  progress int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  leader_id text references members(id),
  supporter_ids jsonb default '[]'::jsonb,
  canvas_x numeric default 0,
  canvas_y numeric default 0,
  priority text default 'medium',
  tags jsonb default '[]'::jsonb,
  category text default '',
  repeat_cycle text,
  discussion_thread_id text,
  summary text,
  tracking_records jsonb default '[]'::jsonb,
  attachments jsonb default '[]'::jsonb,
  selected_kr_ids jsonb default '[]'::jsonb,
  team_id text not null,
  season_id text,
  strategy_level text check (strategy_level is null or strategy_level in ('vision', 'annual', 'quarter')),
  deleted_at timestamptz
);

-- ==================== OKR周期/Season表 ====================
create table if not exists okr_seasons (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  type text not null default 'quarter' check (type in ('quarter', 'annual', 'custom')),
  start_date text not null,
  end_date text not null,
  status text not null default 'draft' check (status in ('draft', 'planning', 'executing', 'scoring', 'reviewing', 'closed')),
  team_id text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ==================== 项目表 ====================
create table if not exists projects (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  description text,
  goal_id text references goals(id) on delete set null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'blocked', 'cancelled')),
  start_date text not null,
  end_date text not null,
  owner_id text references members(id),
  member_ids jsonb default '[]'::jsonb,
  task_count int not null default 0,
  progress int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  leader_id text references members(id),
  supporter_ids jsonb default '[]'::jsonb,
  parent_id text,
  canvas_x numeric default 0,
  canvas_y numeric default 0,
  priority text default 'medium',
  tags jsonb default '[]'::jsonb,
  category text default '',
  repeat_cycle text,
  discussion_thread_id text,
  summary text,
  tracking_records jsonb default '[]'::jsonb,
  attachments jsonb default '[]'::jsonb,
  team_id text not null,
  deleted_at timestamptz
);

-- ==================== 任务表 ====================
create table if not exists tasks (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  description text,
  project_id text references projects(id) on delete set null,
  goal_id text references goals(id) on delete set null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'blocked', 'cancelled')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  assignee_id text references members(id),
  owner_id text references members(id),
  start_date text,
  due_date text,
  reminder_date text,
  completed_at timestamptz,
  subtasks jsonb default '[]'::jsonb,
  tags jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  leader_id text references members(id),
  supporter_ids jsonb default '[]'::jsonb,
  canvas_x numeric default 0,
  canvas_y numeric default 0,
  parent_id text,
  category text default '',
  repeat_cycle text,
  discussion_thread_id text,
  summary text,
  tracking_records jsonb default '[]'::jsonb,
  attachments jsonb default '[]'::jsonb,
  blocked_by jsonb default '[]'::jsonb,
  sprint_id text,
  story_points integer default 0,
  team_id text not null,
  deleted_at timestamptz
);

-- ==================== 通知表 ====================
create table if not exists notifications (
  id text primary key default gen_random_uuid()::text,
  type text not null check (type in ('reminder', 'overdue', 'assigned', 'completed', 'goal_update')),
  title text not null,
  message text not null,
  related_id text not null,
  related_type text not null check (related_type in ('task', 'goal', 'project')),
  member_id text references members(id),
  read boolean not null default false,
  level text default 'info',
  created_at timestamptz default now(),
  team_id text not null
);

-- ==================== 活动记录表 ====================
create table if not exists activities (
  id text primary key default gen_random_uuid()::text,
  member_id text references members(id),
  action text not null,
  target_type text not null check (target_type in ('task', 'goal', 'project')),
  target_id text not null,
  target_title text not null,
  details text,
  created_at timestamptz default now(),
  team_id text not null
);

-- ==================== 关联链接表 ====================
create table if not exists item_links (
  id text primary key default gen_random_uuid()::text,
  source_id text not null,
  source_type text not null,
  target_id text not null,
  target_type text not null,
  label text default '',
  created_at timestamptz default now(),
  team_id text not null
);

-- ==================== 复盘表 ====================
create table if not exists reviews (
  id text primary key default gen_random_uuid()::text,
  period text not null,
  period_start text,
  period_end text,
  member_id text references members(id),
  content text,
  improvements jsonb default '[]'::jsonb,
  metrics jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  team_id text not null
);

-- ==================== 分类表 ====================
create table if not exists categories (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  color text default '#6366f1',
  icon text default '',
  applies_to text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  team_id text not null
);

-- ==================== 标签表 ====================
create table if not exists tags (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  color text default '#6366f1',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  team_id text not null
);

-- ==================== 模板表 ====================
create table if not exists templates (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  description text,
  type text default '',
  content jsonb default '{}'::jsonb,
  created_by text references members(id),
  updated_by text references members(id),
  is_public boolean default false,
  category text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  team_id text not null
);

-- ==================== 日程事件表 ====================
create table if not exists schedule_events (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  description text,
  start_date text not null,
  end_date text not null,
  all_day boolean default false,
  color text default '#6366f1',
  linked_item_id text,
  linked_item_type text,
  member_id text references members(id),
  repeat_cycle text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  team_id text not null
);

-- ==================== 笔记表 ====================
create table if not exists notes (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  content text,
  folder text default '',
  color text default '#ffffff',
  is_pinned boolean default false,
  linked_item_id text,
  linked_item_type text,
  created_by text references members(id),
  updated_by text references members(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  category text default '',
  tags jsonb default '[]'::jsonb,
  team_id text not null
);

-- ==================== 评论表 ====================
create table if not exists comments (
  id text primary key default gen_random_uuid()::text,
  item_id text not null,
  item_type text not null,
  member_id text references members(id),
  member_name text default '',
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  mentioned_member_ids jsonb default '[]'::jsonb,
  is_read boolean default false,
  follow_up_required boolean default false,
  follow_up_status text default '',
  parent_id text,
  attachments jsonb default '[]'::jsonb,
  team_id text not null
);

-- ==================== 书签表 ====================
create table if not exists bookmarks (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  url text not null,
  category text default '',
  icon text default '',
  "order" int default 0,
  member_id text references members(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  team_id text not null
);

-- ==================== 保存视图表 ====================
create table if not exists saved_views (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  type text default '',
  filters jsonb default '{}'::jsonb,
  filter_logic text default 'and',
  member_id text references members(id),
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  team_id text not null
);

-- ==================== 状态流转规则表 ====================
create table if not exists status_flow_rules (
  id text primary key default gen_random_uuid()::text,
  from_status text not null,
  to_status text not null,
  allowed_roles jsonb default '[]'::jsonb,
  auto_actions jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  team_id text not null
);

-- ==================== 自动化规则表 ====================
create table if not exists automation_rules (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  enabled boolean default true,
  item_type text default '',
  trigger jsonb default '{}'::jsonb,
  condition jsonb default '{}'::jsonb,
  actions jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  team_id text not null
);

-- ==================== Sprint表 ====================
create table if not exists sprints (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  start_date text not null,
  end_date text not null,
  goal_ids jsonb default '[]'::jsonb,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  team_id text not null
);

-- ==================== 知识库表 ====================
create table if not exists knowledge (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  content text,
  tags jsonb default '[]'::jsonb,
  member_id text references members(id),
  related_items jsonb default '[]'::jsonb,
  color text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  team_id text not null
);

-- ==================== 通知偏好表 ====================
create table if not exists notification_preferences (
  id text primary key default gen_random_uuid()::text,
  member_id text not null references members(id) on delete cascade,
  item_id text not null,
  item_type text not null,
  muted boolean not null default false,
  created_at timestamptz default now(),
  team_id text not null,
  unique(member_id, item_id, item_type)
);

-- ==================== 行为事件表 ====================
create table if not exists behavior_events (
  id text primary key default gen_random_uuid()::text,
  member_id text references members(id),
  event_type text not null,
  event_data jsonb default '{}'::jsonb,
  session_id text,
  created_at timestamptz default now(),
  team_id text not null
);

-- ==================== 团队行业画像表 ====================
create table if not exists team_industry_profile (
  id text primary key default gen_random_uuid()::text,
  team_id text not null unique references teams(id) on delete cascade,
  industry text default '',
  sub_industry text default '',
  company_size text default '',
  preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ==================== 邮件设置表 ====================
create table if not exists email_settings (
  id text primary key default gen_random_uuid()::text,
  team_id text not null unique references teams(id) on delete cascade,
  sender_email text not null default '',
  sender_name text not null default '',
  api_key text default '',
  enabled boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ==================== 审计日志表 ====================
create table if not exists audit_logs (
  id text primary key default gen_random_uuid()::text,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  performed_by text,
  team_id text,
  created_at timestamptz default now()
);

-- ==================== 功能开关表 ====================
create table if not exists feature_flags (
  key text primary key,
  enabled boolean not null default false,
  team_ids jsonb default '[]'::jsonb,
  description text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- 审计日志只能插入，不能删除或更新
alter table audit_logs enable row level security;
create policy "Audit logs: team members can read" on audit_logs
  for select using (team_id = app_current_team_id() and is_team_member(team_id));
create policy "Audit logs: system insert only" on audit_logs
  for insert with check (true);  -- 触发器写入，允许系统插入
create policy "Audit logs: no update" on audit_logs
  for update using (false) with check (false);
create policy "Audit logs: no delete" on audit_logs
  for delete using (false);

-- 功能开关：团队成员可读，admin可写
alter table feature_flags enable row level security;
create policy "Feature flags: authenticated read" on feature_flags
  for select using (true);
create policy "Feature flags: admin can insert" on feature_flags
  for insert with check (is_team_admin(app_current_team_id()));
create policy "Feature flags: admin can update" on feature_flags
  for update using (is_team_admin(app_current_team_id()));

-- ==================== 索引 ====================
create index if not exists idx_goals_parent on goals(parent_id);
create index if not exists idx_goals_status on goals(status);
create index if not exists idx_goals_team on goals(team_id);
create index if not exists idx_projects_goal on projects(goal_id);
create index if not exists idx_projects_status on projects(status);
create index if not exists idx_projects_team on projects(team_id);
create index if not exists idx_tasks_project on tasks(project_id);
create index if not exists idx_tasks_assignee on tasks(assignee_id);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_team on tasks(team_id);
create index if not exists idx_notifications_member on notifications(member_id);
create index if not exists idx_notifications_team on notifications(team_id);
create index if not exists idx_activities_member on activities(member_id);
create index if not exists idx_activities_team on activities(team_id);
create index if not exists idx_team_members_team on team_members(team_id);
create index if not exists idx_team_members_member on team_members(member_id);
create index if not exists idx_audit_logs_team on audit_logs(team_id);
create index if not exists idx_audit_logs_table on audit_logs(table_name);

-- ==================== Row Level Security ====================
-- 核心原则：团队隔离 + 角色权限
-- 所有策略基于 app_current_team_id() 和 app_current_user_id()

-- === members 表 ===
alter table members enable row level security;

create policy "Members: team members can read" on members
  for select using (
    -- 成员可看到同团队成员
    team_id = app_current_team_id()
    or id in (
      select tm.member_id from team_members tm
      where tm.team_id = app_current_team_id()
    )
  );

create policy "Members: admin can insert" on members
  for insert with check (
    is_team_admin(app_current_team_id())
  );

create policy "Members: self or admin can update" on members
  for update using (
    id = app_current_user_id()
    or is_team_admin(app_current_team_id())
  );

create policy "Members: admin can delete" on members
  for delete using (
    is_team_admin(app_current_team_id())
  );

-- === teams 表 ===
alter table teams enable row level security;

create policy "Teams: members can read their teams" on teams
  for select using (
    id = app_current_team_id()
    or owner_id = app_current_user_id()
    or id in (
      select tm.team_id from team_members tm
      where tm.member_id = app_current_user_id()
    )
  );

create policy "Teams: owner can update" on teams
  for update using (
    owner_id = app_current_user_id()
  );

create policy "Teams: owner can delete" on teams
  for delete using (
    owner_id = app_current_user_id()
  );

-- === team_members 表 ===
alter table team_members enable row level security;

create policy "Team members: team members can read" on team_members
  for select using (
    team_id = app_current_team_id()
  );

create policy "Team members: admin can insert" on team_members
  for insert with check (
    is_team_admin(team_id)
  );

create policy "Team members: admin can update" on team_members
  for update using (
    is_team_admin(team_id)
  );

create policy "Team members: admin can delete" on team_members
  for delete using (
    is_team_admin(team_id)
  );

-- === goals 表 ===
alter table goals enable row level security;

create policy "Goals: team members can read" on goals
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Goals: team members can insert" on goals
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Goals: team members can update" on goals
  for update using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Goals: admin can delete" on goals
  for delete using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

-- === projects 表 ===
alter table projects enable row level security;

create policy "Projects: team members can read" on projects
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Projects: team members can insert" on projects
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Projects: team members can update" on projects
  for update using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Projects: admin can delete" on projects
  for delete using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

-- === tasks 表 ===
alter table tasks enable row level security;

create policy "Tasks: team members can read" on tasks
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Tasks: team members can insert" on tasks
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Tasks: team members can update" on tasks
  for update using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Tasks: admin can delete" on tasks
  for delete using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

-- === notifications 表 ===
alter table notifications enable row level security;

create policy "Notifications: team members can read own" on notifications
  for select using (
    team_id = app_current_team_id()
    and (member_id = app_current_user_id() or is_team_admin(team_id))
  );

create policy "Notifications: system can insert" on notifications
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Notifications: owner or admin can update" on notifications
  for update using (
    team_id = app_current_team_id()
    and (member_id = app_current_user_id() or is_team_admin(team_id))
  );

create policy "Notifications: admin can delete" on notifications
  for delete using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

-- === activities 表 ===
alter table activities enable row level security;

create policy "Activities: team members can read" on activities
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Activities: team members can insert" on activities
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

-- activities 表不可更新和删除（审计性质）
create policy "Activities: no update" on activities
  for update using (false) with check (false);
create policy "Activities: no delete" on activities
  for delete using (false);

-- === item_links 表 ===
alter table item_links enable row level security;

create policy "Item links: team members can read" on item_links
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Item links: team members can insert" on item_links
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Item links: team members can update" on item_links
  for update using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Item links: admin can delete" on item_links
  for delete using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

-- === reviews 表 ===
alter table reviews enable row level security;

create policy "Reviews: team members can read" on reviews
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Reviews: team members can insert" on reviews
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Reviews: owner or admin can update" on reviews
  for update using (
    team_id = app_current_team_id()
    and (member_id = app_current_user_id() or is_team_admin(team_id))
  );

-- === categories 表 ===
alter table categories enable row level security;

create policy "Categories: team members can read" on categories
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Categories: team members can insert" on categories
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Categories: team members can update" on categories
  for update using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Categories: admin can delete" on categories
  for delete using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

-- === tags 表 ===
alter table tags enable row level security;

create policy "Tags: team members can read" on tags
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Tags: team members can insert" on tags
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Tags: team members can update" on tags
  for update using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Tags: admin can delete" on tags
  for delete using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

-- === templates 表 ===
alter table templates enable row level security;

create policy "Templates: team members can read" on templates
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Templates: team members can insert" on templates
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Templates: owner or admin can update" on templates
  for update using (
    team_id = app_current_team_id()
    and (created_by = app_current_user_id() or is_team_admin(team_id))
  );

-- === schedule_events 表 ===
alter table schedule_events enable row level security;

create policy "Schedule events: team members can read" on schedule_events
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Schedule events: team members can insert" on schedule_events
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Schedule events: owner or admin can update" on schedule_events
  for update using (
    team_id = app_current_team_id()
    and (member_id = app_current_user_id() or is_team_admin(team_id))
  );

create policy "Schedule events: admin can delete" on schedule_events
  for delete using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

-- === notes 表 ===
alter table notes enable row level security;

create policy "Notes: team members can read" on notes
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Notes: team members can insert" on notes
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Notes: owner or admin can update" on notes
  for update using (
    team_id = app_current_team_id()
    and (created_by = app_current_user_id() or is_team_admin(team_id))
  );

-- === comments 表 ===
alter table comments enable row level security;

create policy "Comments: team members can read" on comments
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Comments: team members can insert" on comments
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Comments: author or admin can update" on comments
  for update using (
    team_id = app_current_team_id()
    and (member_id = app_current_user_id() or is_team_admin(team_id))
  );

-- === bookmarks 表 ===
alter table bookmarks enable row level security;

create policy "Bookmarks: team members can read" on bookmarks
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Bookmarks: team members can insert" on bookmarks
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Bookmarks: owner or admin can update" on bookmarks
  for update using (
    team_id = app_current_team_id()
    and (member_id = app_current_user_id() or is_team_admin(team_id))
  );

-- === saved_views 表 ===
alter table saved_views enable row level security;

create policy "Saved views: team members can read" on saved_views
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Saved views: team members can insert" on saved_views
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Saved views: owner or admin can update" on saved_views
  for update using (
    team_id = app_current_team_id()
    and (member_id = app_current_user_id() or is_team_admin(team_id))
  );

-- === status_flow_rules 表 ===
alter table status_flow_rules enable row level security;

create policy "Status flow rules: team members can read" on status_flow_rules
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Status flow rules: admin can write" on status_flow_rules
  for insert with check (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

create policy "Status flow rules: admin can update" on status_flow_rules
  for update using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

create policy "Status flow rules: admin can delete" on status_flow_rules
  for delete using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

-- === automation_rules 表 ===
alter table automation_rules enable row level security;

create policy "Automation rules: team members can read" on automation_rules
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Automation rules: admin can write" on automation_rules
  for insert with check (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

create policy "Automation rules: admin can update" on automation_rules
  for update using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

create policy "Automation rules: admin can delete" on automation_rules
  for delete using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

-- === sprints 表 ===
alter table sprints enable row level security;

create policy "Sprints: team members can read" on sprints
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Sprints: team members can insert" on sprints
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Sprints: team members can update" on sprints
  for update using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Sprints: admin can delete" on sprints
  for delete using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

-- === okr_seasons 表 ===
alter table okr_seasons enable row level security;

create policy "OKR Seasons: team members can read" on okr_seasons
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "OKR Seasons: team members can insert" on okr_seasons
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "OKR Seasons: team members can update" on okr_seasons
  for update using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "OKR Seasons: admin can delete" on okr_seasons
  for delete using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

-- === knowledge 表 ===
alter table knowledge enable row level security;

create policy "Knowledge: team members can read" on knowledge
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Knowledge: team members can insert" on knowledge
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Knowledge: owner or admin can update" on knowledge
  for update using (
    team_id = app_current_team_id()
    and (member_id = app_current_user_id() or is_team_admin(team_id))
  );

-- ==================== R2: 预算与成本管理 ====================

-- === budgets 表 ===
create table if not exists budgets (
  id text primary key default gen_random_uuid()::text,
  project_id text references projects(id) on delete set null,
  season_id text references okr_seasons(id) on delete set null,
  name text not null,
  total_amount numeric not null default 0,
  currency text not null default 'CNY',
  status text not null default 'draft',
  items jsonb not null default '[]'::jsonb,
  approved_by text,
  team_id text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table budgets enable row level security;

create policy "Budgets: team members can read" on budgets
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Budgets: team members can insert" on budgets
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Budgets: admin or manager can update" on budgets
  for update using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

create policy "Budgets: admin can delete" on budgets
  for delete using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

create trigger audit_budgets after insert or update or delete on budgets
  for each row execute function audit_trigger_func();

-- === cost_entries 表 ===
create table if not exists cost_entries (
  id text primary key default gen_random_uuid()::text,
  budget_id text not null references budgets(id) on delete cascade,
  project_id text references projects(id) on delete set null,
  task_id text references tasks(id) on delete set null,
  category text not null default 'other',
  amount numeric not null default 0,
  description text not null default '',
  recorded_by text,
  recorded_at timestamptz default now(),
  approved_by text,
  status text not null default 'pending',
  team_id text not null,
  created_at timestamptz default now()
);

alter table cost_entries enable row level security;

create policy "Cost entries: team members can read" on cost_entries
  for select using (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Cost entries: team members can insert" on cost_entries
  for insert with check (
    team_id = app_current_team_id() and is_team_member(team_id)
  );

create policy "Cost entries: admin or manager can update" on cost_entries
  for update using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

create policy "Cost entries: admin can delete" on cost_entries
  for delete using (
    team_id = app_current_team_id() and is_team_admin(team_id)
  );

create trigger audit_cost_entries after insert or update or delete on cost_entries
  for each row execute function audit_trigger_func();

-- ==================== R3: 绩效与有效性 ====================

create table if not exists performance_reviews (
  id text primary key default gen_random_uuid()::text,
  season_id text references okr_seasons(id) on delete set null,
  reviewee_id text not null references members(id),
  status text not null default 'pending',
  self_review jsonb,
  peer_reviews jsonb not null default '[]'::jsonb,
  manager_review jsonb,
  direct_report_reviews jsonb not null default '[]'::jsonb,
  ai_summary text,
  final_score numeric,
  team_id text not null,
  created_at timestamptz default now(),
  completed_at timestamptz
);

alter table performance_reviews enable row level security;
create policy "Perf reviews: team members can read" on performance_reviews for select using (team_id = app_current_team_id() and is_team_member(team_id));
create policy "Perf reviews: admin can insert" on performance_reviews for insert with check (team_id = app_current_team_id() and is_team_admin(team_id));
create policy "Perf reviews: admin can update" on performance_reviews for update using (team_id = app_current_team_id() and is_team_admin(team_id));
create policy "Perf reviews: admin can delete" on performance_reviews for delete using (team_id = app_current_team_id() and is_team_admin(team_id));

create table if not exists effectiveness_metrics (
  id text primary key default gen_random_uuid()::text,
  goal_id text not null references goals(id) on delete cascade,
  business_value numeric not null default 0,
  effort_hours numeric not null default 0,
  impact_score numeric not null default 0,
  roi numeric,
  measured_at timestamptz default now(),
  team_id text not null
);

alter table effectiveness_metrics enable row level security;
create policy "Eff metrics: team members can read" on effectiveness_metrics for select using (team_id = app_current_team_id() and is_team_member(team_id));
create policy "Eff metrics: admin can write" on effectiveness_metrics for insert with check (team_id = app_current_team_id() and is_team_admin(team_id));
create policy "Eff metrics: admin can update" on effectiveness_metrics for update using (team_id = app_current_team_id() and is_team_admin(team_id));

create table if not exists ai_suggestions (
  id text primary key default gen_random_uuid()::text,
  source_type text not null default 'review',
  source_id text,
  content text not null,
  status text not null default 'suggested',
  adopted_at timestamptz,
  outcome_rating numeric,
  outcome_note text,
  team_id text not null,
  created_at timestamptz default now()
);

alter table ai_suggestions enable row level security;
create policy "AI suggestions: team members can read" on ai_suggestions for select using (team_id = app_current_team_id() and is_team_member(team_id));
create policy "AI suggestions: team members can insert" on ai_suggestions for insert with check (team_id = app_current_team_id() and is_team_member(team_id));
create policy "AI suggestions: admin can update" on ai_suggestions for update using (team_id = app_current_team_id() and is_team_admin(team_id));

create table if not exists review_knowledge (
  id text primary key default gen_random_uuid()::text,
  source_session_id text not null,
  pattern text not null,
  context text not null default '',
  related_patterns jsonb not null default '[]'::jsonb,
  ai_extracted boolean not null default false,
  team_id text not null,
  created_at timestamptz default now()
);

alter table review_knowledge enable row level security;
create policy "Review knowledge: team members can read" on review_knowledge for select using (team_id = app_current_team_id() and is_team_member(team_id));
create policy "Review knowledge: admin can insert" on review_knowledge for insert with check (team_id = app_current_team_id() and is_team_admin(team_id));

-- ==================== R4: 产能与DSTE ====================

create table if not exists capacity_plans (
  id text primary key default gen_random_uuid()::text,
  period text not null,
  available_hours numeric not null default 0,
  planned_hours numeric not null default 0,
  forecast_hours numeric not null default 0,
  gap numeric not null default 0,
  team_id text not null,
  created_at timestamptz default now()
);

alter table capacity_plans enable row level security;
create policy "Capacity: team members can read" on capacity_plans for select using (team_id = app_current_team_id() and is_team_member(team_id));
create policy "Capacity: admin can write" on capacity_plans for insert with check (team_id = app_current_team_id() and is_team_admin(team_id));

create table if not exists dste_phases (
  id text primary key default gen_random_uuid()::text,
  season_id text references okr_seasons(id) on delete cascade,
  phase text not null,
  status text not null default 'not_started',
  ai_auto_progress boolean not null default false,
  completed_at timestamptz,
  checklist jsonb not null default '[]'::jsonb,
  team_id text not null
);

alter table dste_phases enable row level security;
create policy "DSTE: team members can read" on dste_phases for select using (team_id = app_current_team_id() and is_team_member(team_id));
create policy "DSTE: admin can write" on dste_phases for insert with check (team_id = app_current_team_id() and is_team_admin(team_id));

create table if not exists business_values (
  id text primary key default gen_random_uuid()::text,
  goal_id text not null references goals(id) on delete cascade,
  input_cost numeric not null default 0,
  output_value numeric not null default 0,
  roi numeric not null default 0,
  value_stream text not null default '',
  measured_at timestamptz default now(),
  team_id text not null
);

alter table business_values enable row level security;
create policy "BV: team members can read" on business_values for select using (team_id = app_current_team_id() and is_team_member(team_id));
create policy "BV: admin can write" on business_values for insert with check (team_id = app_current_team_id() and is_team_admin(team_id));

-- ==================== 审计触发器 ====================

/** 通用审计日志触发器函数 */
create or replace function audit_trigger_func()
returns trigger as $$
declare
  tid text;
begin
  -- 获取team_id（优先从NEW，DELETE时从OLD）
  if tg_op = 'DELETE' then
    tid := coalesce(old.team_id, app_current_team_id());
  else
    tid := coalesce(new.team_id, app_current_team_id());
  end if;

  insert into audit_logs (table_name, record_id, action, old_data, new_data, performed_by, team_id)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    app_current_user_id(),
    tid
  );
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

-- 为核心业务表创建审计触发器
create trigger audit_goals after insert or update or delete on goals
  for each row execute function audit_trigger_func();

create trigger audit_projects after insert or update or delete on projects
  for each row execute function audit_trigger_func();

create trigger audit_tasks after insert or update or delete on tasks
  for each row execute function audit_trigger_func();

create trigger audit_members after insert or update or delete on members
  for each row execute function audit_trigger_func();

create trigger audit_team_members after insert or update or delete on team_members
  for each row execute function audit_trigger_func();

-- ==================== members 表自动更新触发器 ====================

create or replace function update_members_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger members_updated_at before update on members
  for each row execute function update_members_timestamp();

-- ==================== 启用 Realtime ====================
alter publication supabase_realtime add table goals;
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table activities;
alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table members;
alter publication supabase_realtime add table item_links;
alter publication supabase_realtime add table reviews;
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table templates;
alter publication supabase_realtime add table schedule_events;
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table tags;
alter publication supabase_realtime add table bookmarks;
alter publication supabase_realtime add table saved_views;
alter publication supabase_realtime add table status_flow_rules;
alter publication supabase_realtime add table automation_rules;
alter publication supabase_realtime add table sprints;
alter publication supabase_realtime add table okr_seasons;
alter publication supabase_realtime add table budgets;
alter publication supabase_realtime add table cost_entries;
alter publication supabase_realtime add table performance_reviews;
alter publication supabase_realtime add table effectiveness_metrics;
alter publication supabase_realtime add table ai_suggestions;
alter publication supabase_realtime add table knowledge;
alter publication supabase_realtime add table notification_preferences;

-- ==================== 附件存储桶 ====================
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', true) on conflict (id) do nothing;

-- 附件桶存储策略：认证用户才能上传，公开读取
create policy "Allow public read on attachments" on storage.objects
  for select using (bucket_id = 'attachments');

create policy "Allow authenticated upload on attachments" on storage.objects
  for insert with check (
    bucket_id = 'attachments'
    and auth.role() = 'authenticated'
  );

create policy "Allow authenticated update on attachments" on storage.objects
  for update using (
    bucket_id = 'attachments'
    and auth.role() = 'authenticated'
  );

create policy "Allow authenticated delete on attachments" on storage.objects
  for delete using (
    bucket_id = 'attachments'
    and auth.role() = 'authenticated'
  );

-- ==================== 设置当前用户上下文的RPC ====================

/** 前端登录后调用此函数设置当前用户的团队和身份上下文 */
create or replace function set_app_context(p_team_id text, p_user_id text)
returns void as $$
begin
  perform set_config('app.current_team_id', p_team_id, false);
  perform set_config('app.current_user_id', p_user_id, false);
end;
$$ language plpgsql security definer;

-- ==================== 成员表敏感字段脱敏视图 ====================

create or replace view members_safe as
select
  id, name, role, department, avatar, status, join_date,
  created_at, updated_at, nickname, permissions, team_id,
  -- 脱敏字段：非admin只能看前1位+后1位+***
  case
    when user_role_in_team(coalesce(team_id, app_current_team_id())) in ('admin', 'manager')
    then email
    else overlay(email placing '***' from 2 for length(email) - 2)
  end as email,
  case
    when user_role_in_team(coalesce(team_id, app_current_team_id())) in ('admin', 'manager')
    then phone
    else case when length(phone) >= 4
         then overlay(phone placing '****' from 4 for length(phone) - 4)
         else '****'
    end
  end as phone,
  wechat_id
from members;

-- ==================== 付费订阅系统 ====================

create table if not exists subscriptions (
  id text primary key default gen_random_uuid()::text,
  team_id text not null references teams(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'pro', 'enterprise')),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled', 'trialing')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz default now(),
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_subscriptions_team on subscriptions(team_id);
create unique index idx_subscriptions_team_active on subscriptions(team_id) where status = 'active';

alter table subscriptions enable row level security;
create policy "SUB: team members can read own" on subscriptions for select using (team_id = app_current_team_id() and is_team_member(team_id));
create policy "SUB: admin can manage" on subscriptions for all using (team_id = app_current_team_id() and is_team_admin(team_id));

-- Auto-update updated_at
create or replace function subscriptions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
create trigger trg_subscriptions_updated_at
  before update on subscriptions
  for each row execute function subscriptions_updated_at();

-- ==================== installed_agents — Agent安装记录 ====================

create table if not exists installed_agents (
  id text primary key default gen_random_uuid()::text,
  agent_id text not null,
  team_id text not null,
  member_id text not null,
  installed_at timestamptz default now(),
  unique(agent_id, team_id, member_id)
);

create index idx_installed_agents_team on installed_agents(team_id);

alter table installed_agents enable row level security;
create policy "IA: team members can read own" on installed_agents for select using (team_id = app_current_team_id() and is_team_member(team_id));
create policy "IA: team members can insert" on installed_agents for insert with check (team_id = app_current_team_id() and is_team_member(team_id));
create policy "IA: admin can delete" on installed_agents for delete using (team_id = app_current_team_id() and is_team_admin(team_id));

-- ==================== get_team_tier() — 供 RLS 和 RPC 使用 ====================

create or replace function get_team_tier(p_team_id text)
returns text as $$
declare
  v_tier text;
begin
  select tier into v_tier from subscriptions where team_id = p_team_id and status = 'active' limit 1;
  return coalesce(v_tier, 'free');
end;
$$ language plpgsql security definer stable;

-- ==================== 付费功能 RLS 增量策略 ====================

-- automation_rules: free 不可创建
create policy "AR: paid teams only insert" on automation_rules for insert with check (
  team_id = app_current_team_id() and is_team_admin(team_id)
  and get_team_tier(team_id) != 'free'
);

-- status_flow_rules (审批流): free 不可创建
create policy "SFR: paid teams only insert" on status_flow_rules for insert with check (
  team_id = app_current_team_id() and is_team_admin(team_id)
  and get_team_tier(team_id) != 'free'
);

-- performance_reviews: free 不可创建 (高级权限)
create policy "PR: paid teams only insert" on performance_reviews for insert with check (
  team_id = app_current_team_id() and is_team_member(team_id)
  and get_team_tier(team_id) != 'free'
);

-- ==================== call_llm_proxy — LLM代理RPC ====================
-- pg_net 0.20+: http_post returns bigint, response in net._http_response table

create or replace function call_llm_proxy(p_url text, p_body text, p_api_key text)
returns text as $$
declare
  v_request_id bigint;
  v_status_code integer;
  v_content text;
  v_error_msg text;
  v_attempt integer := 0;
begin
  v_request_id := net.http_post(
    url := p_url,
    body := p_body::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || p_api_key
    ),
    timeout_milliseconds := 30000
  );
  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 6 then
      return json_build_object('error', 'proxy_timeout', 'hint', 'CORS直连应可用')::text;
    end if;
    perform pg_sleep(0.5);
    select status_code, content, error_msg
      into v_status_code, v_content, v_error_msg
      from net._http_response
      where id = v_request_id;
    if found then
      if v_status_code is not null then
        if v_status_code >= 200 and v_status_code < 300 then
          return v_content;
        else
          return json_build_object(
            'error', 'api_error',
            'status_code', v_status_code,
            'body', left(v_content, 500)
          )::text;
        end if;
      elsif v_error_msg is not null then
        return json_build_object('error', v_error_msg)::text;
      end if;
    end if;
  end loop;
end;
$$ language plpgsql security definer;

-- ==================== AI调用计数 — 服务端校验基础 ====================

create table if not exists ai_call_logs (
  id text primary key default gen_random_uuid()::text,
  team_id text not null,
  user_id text not null,
  call_date date not null default current_date,
  call_count integer not null default 1,
  created_at timestamptz default now(),
  unique(team_id, user_id, call_date)
);

alter table ai_call_logs enable row level security;
create policy "AL: team members can read own" on ai_call_logs for select using (team_id = app_current_team_id());
create policy "AL: system can write" on ai_call_logs for insert with check (true);
create policy "AL: system can update" on ai_call_logs for update using (true);

-- RPC: 检查并递增 AI 调用计数
create or replace function check_and_increment_ai_call(p_team_id text, p_user_id text, p_limit integer)
returns jsonb as $$
declare
  v_count integer;
  v_allowed boolean;
begin
  select call_count into v_count from ai_call_logs
    where team_id = p_team_id and user_id = p_user_id and call_date = current_date;

  if not found then
    insert into ai_call_logs (team_id, user_id, call_date, call_count) values (p_team_id, p_user_id, current_date, 1);
    return jsonb_build_object('allowed', true, 'count', 1, 'limit', p_limit);
  end if;

  v_allowed := v_count < p_limit;
  if v_allowed then
    update ai_call_logs set call_count = call_count + 1
      where team_id = p_team_id and user_id = p_user_id and call_date = current_date;
  end if;

  return jsonb_build_object('allowed', v_allowed, 'count', v_count + case when v_allowed then 1 else 0 end, 'limit', p_limit);
end;
$$ language plpgsql security definer;

-- ==================== team_settings — 团队级配置KV存储 ====================

create table if not exists team_settings (
  id text primary key default gen_random_uuid()::text,
  team_id text not null,
  key text not null,
  value jsonb not null default '{}',
  updated_at timestamptz default now(),
  unique(team_id, key)
);

create index idx_team_settings_team on team_settings(team_id);

alter table team_settings enable row level security;
create policy "TS: team members can read" on team_settings for select using (team_id = app_current_team_id() and is_team_member(team_id));
create policy "TS: admin can manage" on team_settings for all using (team_id = app_current_team_id() and is_team_admin(team_id));

-- ==================== oauth_tokens — OAuth令牌安全存储 ====================

create table if not exists oauth_tokens (
  id text primary key default gen_random_uuid()::text,
  team_id text not null,
  member_id text not null,
  provider text not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  connected_email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(team_id, member_id, provider)
);

create index idx_oauth_tokens_team_member on oauth_tokens(team_id, member_id);

alter table oauth_tokens enable row level security;
create policy "OT: owner can read" on oauth_tokens for select using (team_id = app_current_team_id() and member_id = app_current_user_id());
create policy "OT: owner can insert" on oauth_tokens for insert with check (team_id = app_current_team_id() and member_id = app_current_user_id());
create policy "OT: owner can update" on oauth_tokens for update using (team_id = app_current_team_id() and member_id = app_current_user_id());
create policy "OT: owner can delete" on oauth_tokens for delete using (team_id = app_current_team_id() and member_id = app_current_user_id());

-- ==================== api_tokens — REST API令牌安全存储 ====================

create table if not exists api_tokens (
  id text primary key default gen_random_uuid()::text,
  team_id text not null,
  name text not null,
  token_hash text not null,
  token_prefix text not null,
  permissions jsonb not null default '[]',
  created_at timestamptz default now(),
  created_by text,
  last_used_at timestamptz
);

create index idx_api_tokens_team on api_tokens(team_id);
create index idx_api_tokens_hash on api_tokens(token_hash);

alter table api_tokens enable row level security;
create policy "AT: team members can read" on api_tokens for select using (team_id = app_current_team_id() and is_team_member(team_id));
create policy "AT: admin can manage" on api_tokens for all using (team_id = app_current_team_id() and is_team_admin(team_id));
