import { useState, useMemo, useRef, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { usePermissions } from '@/store/hooks';
import { Users, Plus, Shield, Briefcase, Mail, Calendar, Trash2, ChevronDown, ChevronUp, Edit2, Save, X, Phone, MessageCircle, User, Copy, RefreshCw, Check, Search } from 'lucide-react';
import type { MemberRole, Permission, PermissionModule, Member } from '@/types';
import { inputCls, roleLabels, roleColors, permissionDesc, allPermissions, getRoleDefaultPermission, memberToEditForm, type EditForm } from './constants';
import { handleError } from '@/lib/errorHandler';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { gatedAction, checkLimit } from '@/lib/featureGating';
import { getPlanName } from '@/lib/featureGating';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { SimpleSelect } from '@/components/ui/simple-select';

export function TeamTab() {
  const { state, dispatch } = useStore();
  const { members = [], tasks = [], projects = [], currentUser } = state;
  const { isAdmin, can: hasPermission } = usePermissions();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', nickname: '', wechatId: '', phone: '', email: '', role: 'member', department: '', status: 'active' });
  const [addForm, setAddForm] = useState({ name: '', nickname: '', wechatId: '', phone: '', email: '', role: 'member' as MemberRole, department: '' });
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const addDialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(showAddDialog, () => setShowAddDialog(false), addDialogRef);

  const currentTeam = state.teams.find(t => t.id === state.currentTeamId);

  async function copyInviteCode() {
    if (!currentTeam?.inviteCode) return;
    try { await navigator.clipboard.writeText(currentTeam.inviteCode); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) { handleError(e, { module: 'TeamTab', operation: 'COPY_INVITE', severity: 'debug' }); }
  }

  async function regenerateInviteCode() {
    if (!currentTeam || !isAdmin) return;
    if (!confirm('确定要重新生成邀请码？旧邀请码将失效。')) return;
    setRegenerating(true);
    try {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const newCode = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const { getSupabaseClient } = await import('@/supabase/client');
      const sb = getSupabaseClient();
      if (sb) {
        await sb.from('teams').update({ invite_code: newCode, updated_at: new Date().toISOString() }).eq('id', currentTeam.id);
        dispatch({ type: 'MERGE_STATE', payload: { teams: state.teams.map(t => t.id === currentTeam.id ? { ...t, inviteCode: newCode } : t) } });
      }
    } catch (e) { console.error('Failed to regenerate invite code:', e); }
    setRegenerating(false);
  }

  const activeMembers = members.filter(m => m.status === 'active');
  const inactiveMembers = members.filter(m => m.status === 'inactive');
  const filteredActive = useMemo(() => {
    if (!memberSearch.trim()) return activeMembers;
    const q = memberSearch.trim().toLowerCase();
    return activeMembers.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.nickname && m.nickname.toLowerCase().includes(q)) ||
      (m.email && m.email.toLowerCase().includes(q)) ||
      (m.department && m.department.toLowerCase().includes(q)) ||
      m.role.toLowerCase().includes(q)
    );
  }, [activeMembers, memberSearch]);
  const filteredInactive = useMemo(() => {
    if (!memberSearch.trim()) return inactiveMembers;
    const q = memberSearch.trim().toLowerCase();
    return inactiveMembers.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.nickname && m.nickname.toLowerCase().includes(q)) ||
      (m.email && m.email.toLowerCase().includes(q)) ||
      (m.department && m.department.toLowerCase().includes(q))
    );
  }, [inactiveMembers, memberSearch]);
  const deptStats = members.reduce<Record<string, number>>((acc, m) => { acc[m.department] = (acc[m.department] || 0) + 1; return acc; }, {});

  const memberStatsMap = useMemo(() => {
    const map = new Map<string, { total: number; done: number; active: number; rate: number; lead: number; support: number }>();
    for (const m of members) {
      const leadTasks = tasks.filter(t => t.leaderId === m.id);
      const supportTasks = tasks.filter(t => (t.supporterIds ?? []).includes(m.id) && t.leaderId !== m.id);
      const all = [...leadTasks, ...supportTasks];
      const done = all.filter(t => t.status === 'done').length;
      const active = all.filter(t => t.status !== 'done' && t.status !== 'cancelled').length;
      const lead = projects.filter(p => p.leaderId === m.id && p.status !== 'done' && p.status !== 'cancelled').length;
      const support = projects.filter(p => (p.supporterIds ?? []).includes(m.id) && p.leaderId !== m.id && p.status !== 'done' && p.status !== 'cancelled').length;
      map.set(m.id, { total: all.length, done, active, rate: all.length > 0 ? Math.round((done / all.length) * 100) : 0, lead, support });
    }
    return map;
  }, [members, tasks, projects]);

  function getMemberTaskStats(memberId: string) { return memberStatsMap.get(memberId) || { total: 0, done: 0, active: 0, rate: 0 }; }
  function getMemberProjectCount(memberId: string) { const s = memberStatsMap.get(memberId); return s ? { lead: s.lead, support: s.support } : { lead: 0, support: 0 }; }
  function handleDeleteMember(id: string, name: string) {
    if (!isAdmin) return;
    if (!confirm(`确定要删除成员「${name}」吗？此操作不可撤销。`)) return;
    dispatch({ type: 'DELETE_MEMBER', payload: id });
    if (selectedMember === id) setSelectedMember(null);
    if (editingId === id) setEditingId(null);
  }
  function handleToggleStatus(member: { id: string; status: string }) {
    dispatch({ type: 'UPDATE_MEMBER', payload: { id: member.id, updates: { status: member.status === 'active' ? 'inactive' as const : 'active' as const } } });
  }
  function startEditing(member: Member) { setEditingId(member.id); setEditForm(memberToEditForm(member)); }
  function cancelEditing() { setEditingId(null); }
  function saveEditing() {
    if (!editingId || !editForm.name.trim()) return;
    const updates: Partial<Member> = { name: editForm.name.trim(), nickname: editForm.nickname.trim(), wechatId: editForm.wechatId.trim(), phone: editForm.phone.trim(), email: editForm.email.trim(), role: editForm.role, department: editForm.department.trim() || '未分配', status: editForm.status as 'active' | 'inactive', avatar: editForm.name.trim().slice(0, 2) };
    const originalMember = state.members.find(m => m.id === editingId);
    if (originalMember && originalMember.role !== editForm.role) updates.permissions = [];
    dispatch({ type: 'UPDATE_MEMBER', payload: { id: editingId, updates } });
    setEditingId(null);
  }

  const PERM_MOD_LABELS: Record<string, string> = { goals: '目标', projects: '项目', tasks: '任务', team: '团队', settings: '设置', export: '导出', knowledge: '知识库' };
  const ACTION_LABELS: Record<string, string> = { view: '查看', create: '创建', edit: '编辑', delete: '删除', manage: '管理' };

  function renderMemberCard(member: Member, isActive: boolean) {
    const stats = getMemberTaskStats(member.id);
    const projCount = getMemberProjectCount(member.id);
    const isSelected = selectedMember === member.id;
    const canEdit = currentUser?.id === member.id || hasPermission('team_manage');
    const isEditing = editingId === member.id;
    return (
      <div key={member.id} className={`hover:bg-muted/30 transition-colors ${!isActive ? 'opacity-60' : ''}`}>
        <div className="px-5 py-4 flex items-center gap-4 cursor-pointer" onClick={() => setSelectedMember(isSelected ? null : member.id)}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${member.id === currentUser?.id ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>{member.avatar}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{member.name}</span>
              {member.nickname && <span className="text-xs text-muted-foreground">({member.nickname})</span>}
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${roleColors[member.role]}`}>{roleLabels[member.role]}</span>
              {member.id === currentUser?.id && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">当前</span>}
              {member.status === 'inactive' && <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">已停用</span>}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Briefcase size={10} /> {member.department}</span>
              <span className="flex items-center gap-1"><Mail size={10} /> {member.email}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-center flex-shrink-0">
            <div><div className="text-sm font-bold">{projCount.lead + projCount.support}</div><div className="text-xs text-muted-foreground">项目</div></div>
            <div><div className="text-sm font-bold text-blue-600">{stats.active}</div><div className="text-xs text-muted-foreground">进行中</div></div>
            <div><div className="text-sm font-bold text-green-600">{stats.done}</div><div className="text-xs text-muted-foreground">已完成</div></div>
            {isSelected ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
          </div>
        </div>
        {isSelected && (
          <div className="px-5 pb-4 ml-14 animate-slide-up space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <div className="bg-muted/50 rounded-lg p-3"><div className="text-xs text-muted-foreground">加入日期</div><div className="font-medium mt-0.5 flex items-center gap-1"><Calendar size={12} /> {member.joinDate}</div></div>
              <div className="bg-muted/50 rounded-lg p-3"><div className="text-xs text-muted-foreground">主导项目</div><div className="font-medium mt-0.5">{projCount.lead}</div></div>
              <div className="bg-muted/50 rounded-lg p-3"><div className="text-xs text-muted-foreground">支持项目</div><div className="font-medium mt-0.5">{projCount.support}</div></div>
              <div className="bg-muted/50 rounded-lg p-3"><div className="text-xs text-muted-foreground">活跃任务</div><div className="font-medium mt-0.5">{stats.active}</div></div>
              <div className="bg-muted/50 rounded-lg p-3"><div className="text-xs text-muted-foreground">完成率</div><div className="font-medium mt-0.5">{stats.rate}%</div></div>
            </div>
            {isEditing ? (
              <div className="space-y-3 border border-primary/20 rounded-lg p-4 bg-primary/5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-muted-foreground mb-1">姓名 *</label><input className={inputCls} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div><label className="block text-xs font-medium text-muted-foreground mb-1">昵称</label><input className={inputCls} value={editForm.nickname} onChange={e => setEditForm(f => ({ ...f, nickname: e.target.value }))} /></div>
                  <div><label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><MessageCircle size={12} /> 微信号</label><input className={inputCls} value={editForm.wechatId} onChange={e => setEditForm(f => ({ ...f, wechatId: e.target.value }))} /></div>
                  <div><label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Phone size={12} /> 手机号</label><input className={inputCls} value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
                  <div><label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Mail size={12} /> 邮箱</label><input type="email" className={inputCls} value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div><label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Briefcase size={12} /> 部门</label><input className={inputCls} value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))} /></div>
                   <div><label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><Shield size={12} /> 角色</label>
                    <SimpleSelect value={editForm.role} onValueChange={v => setEditForm(f => ({ ...f, role: v as MemberRole }))} options={[{ value: 'member', label: '成员' }, { value: 'manager', label: '负责人' }, { value: 'leader', label: '组长' }, { value: 'admin', label: '管理员' }]} className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                   <div><label className="block text-xs font-medium text-muted-foreground mb-1">状态</label>
                    <SimpleSelect value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))} options={[{ value: 'active', label: '活跃' }, { value: 'inactive', label: '已停用' }]} className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90" onClick={e => { e.stopPropagation(); saveEditing(); }}><Save size={14} /> 保存</button>
                  <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-muted" onClick={e => { e.stopPropagation(); cancelEditing(); }}><X size={14} /> 取消</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 text-muted-foreground"><User size={14} className="flex-shrink-0" /><span>姓名：</span><span className="text-foreground font-medium">{member.name}</span></div>
                  {member.nickname && <div className="flex items-center gap-2 text-muted-foreground"><User size={14} className="flex-shrink-0" /><span>昵称：</span><span className="text-foreground font-medium">{member.nickname}</span></div>}
                  {member.wechatId && <div className="flex items-center gap-2 text-muted-foreground"><MessageCircle size={14} className="flex-shrink-0" /><span>微信：</span><span className="text-foreground font-medium">{isAdmin ? member.wechatId : member.wechatId.slice(0, 2) + '****'}</span></div>}
                  {member.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone size={14} className="flex-shrink-0" /><span>手机：</span><span className="text-foreground font-medium">{isAdmin ? member.phone : member.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}</span></div>}
                  <div className="flex items-center gap-2 text-muted-foreground"><Mail size={14} className="flex-shrink-0" /><span>邮箱：</span><span className="text-foreground font-medium">{isAdmin ? member.email : (member.email ? member.email.replace(/(.{2}).*(.@.*)/, '$1***$2') : '')}</span></div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Briefcase size={14} className="flex-shrink-0" /><span>部门：</span><span className="text-foreground font-medium">{member.department}</span></div>
                </div>
                <div><div className="text-xs font-medium text-muted-foreground mb-1">权限说明</div><span className={`text-xs px-1.5 py-0.5 rounded ${roleColors[member.role]}`}><Shield size={10} className="inline mr-1" />{permissionDesc[member.role]}</span></div>
                {canEdit && <button onClick={() => startEditing(member)} className="text-xs px-3 py-1.5 rounded-lg border border-primary text-primary hover:bg-primary/5 font-medium flex items-center gap-1"><Edit2 size={12} /> 编辑信息</button>}
                {hasPermission('team_manage') && <button onClick={e => { e.stopPropagation(); handleDeleteMember(member.id, member.name); }} className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1"><Trash2 size={12} /> 删除成员</button>}
              </div>
            )}
            {isAdmin && selectedMember === member.id && member.role !== 'admin' && (
              <div className="pt-3 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Shield size={12} /> 权限管理</h4>
                  <button onClick={e => { e.stopPropagation(); dispatch({ type: 'UPDATE_MEMBER', payload: { id: member.id, updates: { permissions: [] } } }); }} className="text-[10px] text-muted-foreground hover:text-foreground">恢复默认</button>
                </div>
                {(['goals', 'projects', 'tasks', 'team', 'settings', 'export', 'knowledge'] as PermissionModule[]).map(mod => {
                  const modPerms = (allPermissions as readonly string[]).filter(p => p.startsWith(mod + '_'));
                  const effectivePerms = member.permissions?.length ? member.permissions : (allPermissions as readonly string[]).filter(p => getRoleDefaultPermission(member.role, p));
                  const allChecked = modPerms.every(p => effectivePerms.includes(p as Permission));
                  const noneChecked = modPerms.every(p => !effectivePerms.includes(p as Permission));
                  return (
                    <div key={mod} className="mb-2 border border-border/50 rounded-lg p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <input type="checkbox" className="rounded" ref={el => { if (el) el.indeterminate = !allChecked && !noneChecked; }} checked={allChecked} onChange={e => { e.stopPropagation(); const current = member.permissions?.length ? [...member.permissions] : (allPermissions as readonly string[]).filter(p => getRoleDefaultPermission(member.role, p)); const newP = allChecked ? current.filter((p: string) => !modPerms.includes(p)) : [...new Set([...current, ...modPerms])]; dispatch({ type: 'UPDATE_MEMBER', payload: { id: member.id, updates: { permissions: newP } } }); }} />
                        <span className="text-xs font-semibold">{PERM_MOD_LABELS[mod] || mod}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 ml-5">
                        {modPerms.map(perm => {
                          const action = perm.split('_')[1];
                          return (
                            <label key={perm} className="flex items-center gap-1 cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                              <input type="checkbox" className="rounded" checked={effectivePerms.includes(perm as Permission)} onChange={e => { e.stopPropagation(); const cur = member.permissions?.length ? [...member.permissions] : (allPermissions as readonly string[]).filter(p => getRoleDefaultPermission(member.role, p)); const newP = cur.includes(perm as Permission) ? cur.filter((p: string) => p !== perm) : [...cur, perm]; dispatch({ type: 'UPDATE_MEMBER', payload: { id: member.id, updates: { permissions: newP } } }); }} />
                              <span>{ACTION_LABELS[action] || action}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h2 className="text-lg font-bold">团队管理</h2><p className="text-sm text-muted-foreground mt-0.5">管理团队成员与协作分工</p></div>
        {isAdmin && <button onClick={() => setShowAddDialog(true)} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90"><Plus size={16} /> 添加成员</button>}
      </div>

      {isAdmin && currentTeam && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Shield size={18} className="text-primary" /></div>
              <div>
                <div className="text-sm font-semibold">{currentTeam.name} - 邀请码</div>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-lg font-mono font-bold tracking-widest text-primary bg-card px-3 py-0.5 rounded border border-primary/20">{currentTeam.inviteCode || '未生成'}</code>
                  <Tooltip><TooltipTrigger asChild><button onClick={copyInviteCode} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                    {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} className="text-muted-foreground" />}
                  </button></TooltipTrigger><TooltipContent>复制</TooltipContent></Tooltip>
                </div>
              </div>
            </div>
            <button onClick={regenerateInviteCode} disabled={regenerating} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50">
              <RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} /> 重新生成
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm"><p className="text-sm text-muted-foreground">团队总人数</p><p className="text-2xl font-bold mt-1">{members.length}</p></div>
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm"><p className="text-sm text-muted-foreground">活跃成员</p><p className="text-2xl font-bold mt-1 text-green-600">{activeMembers.length}</p></div>
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm"><p className="text-sm text-muted-foreground">部门数</p><p className="text-2xl font-bold mt-1">{Object.keys(deptStats).length}</p></div>
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm"><p className="text-sm text-muted-foreground">人均任务</p><p className="text-2xl font-bold mt-1">{activeMembers.length > 0 ? (tasks.length / activeMembers.length).toFixed(1) : 0}</p></div>
      </div>
      <div className="bg-card rounded-xl border border-border shadow-sm p-5">
        <h3 className="font-semibold text-sm mb-4">部门分布</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(deptStats).map(([dept, count]) => <div key={dept} className="bg-muted/50 rounded-lg p-3 text-center"><div className="text-lg font-bold">{count}</div><div className="text-xs text-muted-foreground">{dept}</div></div>)}
        </div>
      </div>
      {currentUser && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center text-lg font-bold">{currentUser.avatar}</div>
            <div className="flex-1">
              <div className="font-semibold">{currentUser.name} {currentUser.nickname && <span className="text-muted-foreground font-normal">({currentUser.nickname})</span>}</div>
              <div className="text-xs text-muted-foreground">{currentUser.department} · {roleLabels[currentUser.role]}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{currentUser.phone} · {currentUser.email}</div>
            </div>
            <button onClick={() => setSelectedMember(currentUser.id)} className="text-xs px-3 py-1.5 rounded-lg border border-primary text-primary hover:bg-primary/5">编辑我的信息</button>
          </div>
        </div>
      )}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border"><h3 className="font-semibold text-sm flex items-center gap-2"><Users size={16} className="text-primary" />成员列表</h3></div>
        <div className="px-5 py-3 border-b border-border">
          <div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input className="w-full pl-8 pr-3 py-1.5 text-xs border border-input rounded-lg bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary/20" placeholder="搜索成员姓名、昵称、邮箱、部门..." value={memberSearch} onChange={e => setMemberSearch(e.target.value)} /></div>
        </div>
        <div className="divide-y divide-border">
          {filteredActive.map(m => renderMemberCard(m, true))}
          {filteredInactive.length > 0 && <div className="px-5 py-3 bg-muted/30"><div className="text-xs font-medium text-muted-foreground mb-2">已停用</div>{filteredInactive.map(m => renderMemberCard(m, false))}</div>}
          {filteredActive.length === 0 && filteredInactive.length === 0 && <div className="px-5 py-8 text-center text-muted-foreground text-sm">{memberSearch ? '没有匹配的成员' : '暂无成员'}</div>}
        </div>
      </div>
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowAddDialog(false)} role="presentation" />
          <div ref={addDialogRef} className="relative bg-card rounded-xl shadow-xl border border-border w-full max-w-md animate-slide-up" role="dialog" aria-modal="true" aria-label="成员编辑">
            <div className="px-6 py-4 border-b border-border"><h3 className="font-semibold">添加成员</h3></div>
            <div className="px-6 py-4 space-y-4">
              <div><label className="block text-sm font-medium mb-1">姓名 *</label><input className={inputCls} placeholder="输入成员姓名" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><label className="block text-sm font-medium mb-1">昵称</label><input className={inputCls} placeholder="输入昵称" value={addForm.nickname} onChange={e => setAddForm(f => ({ ...f, nickname: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1 flex items-center gap-1"><MessageCircle size={14} /> 微信号</label><input className={inputCls} placeholder="微信号" value={addForm.wechatId} onChange={e => setAddForm(f => ({ ...f, wechatId: e.target.value }))} /></div>
                <div><label className="block text-sm font-medium mb-1 flex items-center gap-1"><Phone size={14} /> 手机号</label><input className={inputCls} placeholder="手机号" value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1 flex items-center gap-1"><Mail size={14} /> 邮箱</label><input type="email" className={inputCls} placeholder="email@example.com" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                 <div><label className="block text-sm font-medium mb-1">角色</label>
                  <SimpleSelect value={addForm.role} onValueChange={v => setAddForm(f => ({ ...f, role: v as MemberRole }))} options={[{ value: 'member', label: '成员' }, { value: 'manager', label: '负责人' }, { value: 'admin', label: '管理员' }]} className="w-full border border-border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div><label className="block text-sm font-medium mb-1">部门</label><input className={inputCls} placeholder="默认 SQ Team" value={addForm.department} onChange={e => setAddForm(f => ({ ...f, department: e.target.value }))} /></div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted" onClick={() => setShowAddDialog(false)}>取消</button>
              <button className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => {
                if (!addForm.name.trim()) return;
                const teamId = state.currentTeamId ?? '';
                const allowed = gatedAction('maxMembers', teamId, state.subscriptions ?? [], activeMembers.length);
                if (!allowed) {
                  const info = checkLimit('maxMembers', teamId, state.subscriptions ?? [], activeMembers.length);
                  alert(`当前${getPlanName(info.tier)}最多支持 ${info.max} 名成员，请升级到专业版或企业版以添加更多成员。`);
                  return;
                }
                dispatch({ type: 'ADD_MEMBER', payload: { name: addForm.name.trim(), nickname: addForm.nickname.trim(), wechatId: addForm.wechatId.trim(), phone: addForm.phone.trim(), email: addForm.email.trim(), role: addForm.role, department: addForm.department.trim() || 'SQ Team', avatar: addForm.name.trim().slice(0, 2), status: 'active', permissions: [] } });
                setShowAddDialog(false);
                setAddForm({ name: '', nickname: '', wechatId: '', phone: '', email: '', role: 'member', department: '' });
              }}>添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
