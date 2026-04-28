-- 团队业务中台数据库 Schema
-- 在 Supabase SQL Editor 中执行此脚本

-- 启用 UUID 扩展
create extension if not exists "uuid-ossp";

-- ==================== 成员表 ====================
create table if not exists members (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  role text not null default 'member' check (role in ('admin', 'manager', 'member')),
  department text not null,
  avatar text not null,
  email text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  join_date text not null,
  created_at timestamptz default now()
);

-- ==================== 目标表 ====================
create table if not exists goals (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  description text,
  type text not null default 'okr' check (type in ('okr', 'kpi', 'milestone')),
  status text not null default 'in_progress' check (status in ('planning', 'in_progress', 'completed', 'paused', 'cancelled')),
  parent_id text references goals(id) on delete cascade,
  level int not null default 0,
  start_date text not null,
  end_date text not null,
  owner_id text references members(id),
  key_results jsonb default '[]'::jsonb,
  progress int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ==================== 项目表 ====================
create table if not exists projects (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  description text,
  goal_id text references goals(id) on delete set null,
  status text not null default 'planning' check (status in ('planning', 'in_progress', 'completed', 'paused', 'cancelled')),
  start_date text not null,
  end_date text not null,
  owner_id text references members(id),
  member_ids jsonb default '[]'::jsonb,
  task_count int not null default 0,
  progress int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
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
  due_date text,
  reminder_date text,
  completed_at timestamptz,
  subtasks jsonb default '[]'::jsonb,
  tags jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
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
  created_at timestamptz default now()
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
  created_at timestamptz default now()
);

-- ==================== 索引 ====================
create index if not exists idx_goals_parent on goals(parent_id);
create index if not exists idx_goals_status on goals(status);
create index if not exists idx_projects_goal on projects(goal_id);
create index if not exists idx_projects_status on projects(status);
create index if not exists idx_tasks_project on tasks(project_id);
create index if not exists idx_tasks_assignee on tasks(assignee_id);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_notifications_member on notifications(member_id);
create index if not exists idx_activities_member on activities(member_id);

-- ==================== Row Level Security ====================
alter table members enable row level security;
alter table goals enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table notifications enable row level security;
alter table activities enable row level security;

-- 简单策略：允许所有操作（适合内部团队中台，通过 URL 控制访问）
create policy "Allow all on members" on members for all using (true) with check (true);
create policy "Allow all on goals" on goals for all using (true) with check (true);
create policy "Allow all on projects" on projects for all using (true) with check (true);
create policy "Allow all on tasks" on tasks for all using (true) with check (true);
create policy "Allow all on notifications" on notifications for all using (true) with check (true);
create policy "Allow all on activities" on activities for all using (true) with check (true);

-- 启用 Realtime
alter publication supabase_realtime add table goals;
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table activities;
