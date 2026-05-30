#!/usr/bin/env node
/**
 * TBH CLI — 团队业务中台命令行工具
 *
 * 使用: tbh <command> [options]
 *
 * 核心命令:
 *   tbh task list [--status=done] [--project=xxx]     列出任务
 *   tbh task create --title="xxx" [--priority=high]    创建任务
 *   tbh task update <id> --status=done                 更新任务
 *   tbh task delete <id>                               删除任务
 *   tbh goal list                                      列出目标
 *   tbh goal create --title="xxx" --type=okr           创建目标
 *   tbh project list                                   列出项目
 *   tbh project create --title="xxx"                   创建项目
 *   tbh member list                                    列出成员
 *   tbh analyze critical-path --project=xxx            关键路径
 *   tbh analyze delay-risk <task-id>                   延期预测
 *   tbh analyze bottleneck                             资源瓶颈
 *   tbh analyze recommend-assignee                     推荐责任人
 *   tbh analyze kpi-score <goal-id>                    KPI评分
 *   tbh config token                                   管理API Token
 */

const SUPABASE_URL = 'https://atexvoyvnnuaonvrgzhn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WeMPVE8GNCTOqrE7OZhTIw_WXJaz2Ie';

// ===== HTTP helpers =====

async function api(method: string, table: string, body?: any, query?: Record<string, string>): Promise<any> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
  if (method !== 'GET' && method !== 'DELETE') headers['Prefer'] = 'return=representation';
  const resp = await fetch(url.toString(), { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (resp.status === 204) return null;
  return resp.json();
}

// ===== Parsers =====

function parseArgs(argv: string[]): { command: string; subcommand: string; opts: Record<string, string>; positional: string[] } {
  const args = argv.slice(2);
  const command = args[0] || '';
  const subcommand = args[1] || '';
  const opts: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 2; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const [key, ...val] = args[i].slice(2).split('=');
      opts[key] = val.join('=') || args[++i] || '';
    } else if (args[i].startsWith('-')) {
      opts[args[i].slice(1)] = args[++i] || '';
    } else {
      positional.push(args[i]);
    }
  }
  return { command, subcommand, opts, positional };
}

function formatTable(rows: any[], columns: string[]): string {
  if (rows.length === 0) return '(empty)';
  const widths = columns.map(col => Math.max(col.length, ...rows.map(r => String(r[col] ?? '').length)));
  const header = columns.map((col, i) => col.padEnd(widths[i])).join('  ');
  const sep = widths.map(w => '-'.repeat(w)).join('--');
  const body = rows.map(r => columns.map((col, i) => String(r[col] ?? '').padEnd(widths[i])).join('  ')).join('\n');
  return `${header}\n${sep}\n${body}`;
}

// ===== Commands =====

async function cmdTaskList(opts: Record<string, string>) {
  const query: Record<string, string> = { order: 'created_at.desc', limit: '20' };
  if (opts.status) query.status = `eq.${opts.status}`;
  if (opts.project) query.project_id = `eq.${opts.project}`;
  const data = await api('GET', 'tasks', undefined, query);
  if (!Array.isArray(data)) { console.error('Error:', JSON.stringify(data)); return; }
  console.log(formatTable(data, ['id', 'title', 'status', 'priority', 'due_date']));
}

async function cmdTaskCreate(opts: Record<string, string>) {
  if (!opts.title) { console.error('Error: --title is required'); return; }
  const record: any = { title: opts.title, status: 'todo', priority: opts.priority || 'medium', leader_id: opts.leader || '', project_id: opts.project || null, start_date: opts.start || null, due_date: opts.due || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const data = await api('POST', 'tasks', record);
  console.log('Created:', data?.[0]?.title || data?.title || 'OK');
}

async function cmdTaskUpdate(positional: string[], opts: Record<string, string>) {
  const id = positional[0];
  if (!id) { console.error('Error: task ID required'); return; }
  const updates: any = { updated_at: new Date().toISOString() };
  if (opts.status) { updates.status = opts.status; if (opts.status === 'done') updates.completed_at = new Date().toISOString(); }
  if (opts.title) updates.title = opts.title;
  if (opts.due) updates.due_date = opts.due;
  if (opts.priority) updates.priority = opts.priority;
  await api('PATCH', 'tasks', updates, { id: `eq.${id}` });
  console.log('Updated:', id);
}

async function cmdTaskDelete(positional: string[]) {
  const id = positional[0];
  if (!id) { console.error('Error: task ID required'); return; }
  await api('DELETE', 'tasks', undefined, { id: `eq.${id}` });
  console.log('Deleted:', id);
}

async function cmdGoalList(opts: Record<string, string>) {
  const query: Record<string, string> = { order: 'created_at.desc', limit: '20' };
  if (opts.status) query.status = `eq.${opts.status}`;
  const data = await api('GET', 'goals', undefined, query);
  if (!Array.isArray(data)) { console.error('Error:', JSON.stringify(data)); return; }
  console.log(formatTable(data, ['id', 'title', 'type', 'status', 'progress']));
}

async function cmdGoalCreate(opts: Record<string, string>) {
  if (!opts.title) { console.error('Error: --title is required'); return; }
  const record = { title: opts.title, type: opts.type || 'okr', status: 'todo', priority: opts.priority || 'medium', leader_id: opts.leader || '', start_date: opts.start || '', end_date: opts.end || '', key_results: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const data = await api('POST', 'goals', record);
  console.log('Created:', data?.[0]?.title || data?.title || 'OK');
}

async function cmdProjectList() {
  const data = await api('GET', 'projects', undefined, { order: 'created_at.desc', limit: '20' });
  if (!Array.isArray(data)) { console.error('Error:', JSON.stringify(data)); return; }
  console.log(formatTable(data, ['id', 'title', 'status', 'priority']));
}

async function cmdProjectCreate(opts: Record<string, string>) {
  if (!opts.title) { console.error('Error: --title is required'); return; }
  const record = { title: opts.title, goal_id: opts.goal || null, status: 'todo', priority: opts.priority || 'medium', leader_id: opts.leader || '', start_date: opts.start || '', end_date: opts.end || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const data = await api('POST', 'projects', record);
  console.log('Created:', data?.[0]?.title || data?.title || 'OK');
}

async function cmdMemberList() {
  const data = await api('GET', 'members', undefined, { status: 'eq.active' });
  if (!Array.isArray(data)) { console.error('Error:', JSON.stringify(data)); return; }
  console.log(formatTable(data, ['id', 'name', 'role', 'department']));
}

async function cmdAnalyze(subcommand: string, positional: string[], opts: Record<string, string>) {
  switch (subcommand) {
    case 'critical-path':
    case 'cp': {
      if (!opts.project) { console.error('Error: --project ID required'); return; }
      const tasks = await api('GET', 'tasks', undefined, { project_id: `eq.${opts.project}` });
      console.log(`Project ${opts.project}: ${tasks.length} tasks`);
      console.log('Use MCP get_critical_path tool for CPM calculation');
      break;
    }
    case 'delay-risk': {
      const taskId = positional[0];
      if (!taskId) { console.error('Error: task ID required'); return; }
      console.log(`Use MCP predict_delay tool for task: ${taskId}`);
      break;
    }
    case 'bottleneck': {
      console.log('Use MCP resource_bottleneck tool for team bottleneck analysis');
      break;
    }
    case 'recommend-assignee':
    case 'ra': {
      console.log('Use MCP recommend_assignee tool for assignment recommendation');
      break;
    }
    case 'kpi-score': {
      const goalId = positional[0];
      if (!goalId) { console.error('Error: goal ID required'); return; }
      console.log(`Use MCP calc_kpi_score tool for goal: ${goalId}`);
      break;
    }
    default:
      console.log('Analyze commands: critical-path, delay-risk, bottleneck, recommend-assignee, kpi-score');
  }
}

// ===== Main =====

async function main() {
  const { command, subcommand, opts, positional } = parseArgs(process.argv);

  switch (command) {
    case 'task':
      switch (subcommand) {
        case 'list': case 'ls': await cmdTaskList(opts); break;
        case 'create': case 'add': await cmdTaskCreate(opts); break;
        case 'update': await cmdTaskUpdate(positional, opts); break;
        case 'delete': case 'rm': await cmdTaskDelete(positional); break;
        default: console.log('Usage: tbh task <list|create|update|delete>');
      }
      break;
    case 'goal':
      switch (subcommand) {
        case 'list': case 'ls': await cmdGoalList(opts); break;
        case 'create': case 'add': await cmdGoalCreate(opts); break;
        default: console.log('Usage: tbh goal <list|create>');
      }
      break;
    case 'project':
      switch (subcommand) {
        case 'list': case 'ls': await cmdProjectList(); break;
        case 'create': case 'add': await cmdProjectCreate(opts); break;
        default: console.log('Usage: tbh project <list|create>');
      }
      break;
    case 'member': await cmdMemberList(); break;
    case 'analyze': await cmdAnalyze(subcommand, positional, opts); break;
    case 'help': case '--help': case '-h':
      console.log('TBH CLI — 团队业务中台命令行工具');
      console.log('');
      console.log('Commands:');
      console.log('  tbh task list [--status=done] [--project=ID]');
      console.log('  tbh task create --title="xxx" [--priority=high] [--due=2026-06-30]');
      console.log('  tbh task update <ID> --status=done');
      console.log('  tbh task delete <ID>');
      console.log('  tbh goal list [--status=in_progress]');
      console.log('  tbh goal create --title="xxx" [--type=okr|kpi|milestone]');
      console.log('  tbh project list');
      console.log('  tbh project create --title="xxx"');
      console.log('  tbh member list');
      console.log('  tbh analyze <critical-path|delay-risk|bottleneck|recommend-assignee|kpi-score>');
      break;
    default:
      console.log('Unknown command. Use "tbh help" for usage.');
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
