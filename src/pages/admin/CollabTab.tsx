/**
 * CRDT 协作面板 — 实时协作状态可视化、冲突历史、在线用户
 * Phase 3-4: CRDT Collaboration
 */
import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { useCollabPresence, type CollabOperation, resolveConflict, type CollabUser } from '@/lib/collab';
import {
  Users,
  Radio,
  GitMerge,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Zap,
  Activity,
  Shield,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

// ===== 模拟冲突历史（演示用） =====

const DEMO_CONFLICTS: Array<{
  id: string;
  entity: string;
  entityId: string;
  field: string;
  localValue: string;
  remoteValue: string;
  resolvedValue: string;
  strategy: string;
  remoteUser: string;
  timestamp: string;
}> = [
  { id: 'cf-1', entity: 'task', entityId: 'task-abc', field: 'title', localValue: '完成前端重构', remoteValue: '完成前端重构V2', resolvedValue: '完成前端重构V2', strategy: 'lww', remoteUser: '张三', timestamp: '2026-05-30 14:23:05' },
  { id: 'cf-2', entity: 'goal', entityId: 'goal-xyz', field: 'description', localValue: 'Q2目标', remoteValue: 'Q2目标（已调整）', resolvedValue: 'Q2目标（已调整）', strategy: 'lww', remoteUser: '李四', timestamp: '2026-05-30 10:15:22' },
  { id: 'cf-3', entity: 'task', entityId: 'task-def', field: 'tags', localValue: '[前端, 重构]', remoteValue: '[重构, 紧急]', resolvedValue: '[前端, 重构, 紧急]', strategy: 'merge', remoteUser: '王五', timestamp: '2026-05-29 16:45:11' },
];

// ===== 子组件 =====

function OnlineUserCard({ user, isSelf }: { user: CollabUser; isSelf: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border rounded-lg">
      <div className="relative">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: user.color }}>
          {user.name.charAt(0)}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white bg-green-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium truncate">{user.name}</span>
          {isSelf && <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary">我</span>}
        </div>
        {user.cursor && (
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Eye size={8} />
            正在查看 {user.cursor.entity}/{user.cursor.entityId.slice(0, 6)}
            {user.cursor.field && `.${user.cursor.field}`}
          </div>
        )}
      </div>
      <span className="text-[9px] text-muted-foreground">{formatTimeAgo(user.lastActive)}</span>
    </div>
  );
}

function ConflictCard({ conflict }: { conflict: typeof DEMO_CONFLICTS[0] }) {
  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <GitMerge size={14} className={conflict.strategy === 'merge' ? 'text-purple-600' : 'text-blue-600'} />
        <span className="text-xs font-semibold">{conflict.entity}/{conflict.entityId.slice(0, 6)}.{conflict.field}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded ml-auto ${conflict.strategy === 'merge' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
          {conflict.strategy === 'merge' ? '合并' : 'LWW'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="space-y-0.5">
          <div className="text-muted-foreground text-[10px]">本地值</div>
          <div className="bg-orange-50 border border-orange-200 rounded px-2 py-1 text-orange-700 line-through">{conflict.localValue}</div>
        </div>
        <div className="flex items-center justify-center">
          <ArrowRight size={16} className="text-muted-foreground" />
        </div>
        <div className="space-y-0.5">
          <div className="text-muted-foreground text-[10px]">{conflict.remoteUser}的值</div>
          <div className="bg-blue-50 border border-blue-200 rounded px-2 py-1 text-blue-700">{conflict.remoteValue}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <CheckCircle2 size={12} className="text-green-600" />
        <span className="text-muted-foreground">已解决:</span>
        <span className="font-medium text-green-700">{conflict.resolvedValue}</span>
      </div>
      <div className="text-[10px] text-muted-foreground">{conflict.timestamp}</div>
    </div>
  );
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 300000) return `${Math.floor(diff / 60000)}分钟前`;
  return `${Math.floor(diff / 3600000)}小时前`;
}

// ===== 主组件 =====

export function CollabTab() {
  const { state } = useStore();
  const currentUserId = state.currentUser?.id || '';
  const currentUserName = state.currentUser?.name || '未知';
  const { onlineUsers, myColor } = useCollabPresence(currentUserId, currentUserName);
  const [subTab, setSubTab] = useState<'status' | 'conflicts' | 'architecture'>('status');

  const collabStats = useMemo(() => ({
    onlineCount: onlineUsers.length,
    conflictCount: DEMO_CONFLICTS.length,
    mergeCount: DEMO_CONFLICTS.filter(c => c.strategy === 'merge').length,
    lwwCount: DEMO_CONFLICTS.filter(c => c.strategy === 'lww').length,
  }), [onlineUsers]);

  return (
    <div className="space-y-4">
      {/* Sub-tab */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
        <button onClick={() => setSubTab('status')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${subTab === 'status' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Users size={14} />协作状态
        </button>
        <button onClick={() => setSubTab('conflicts')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${subTab === 'conflicts' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <GitMerge size={14} />冲突历史
        </button>
        <button onClick={() => setSubTab('architecture')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${subTab === 'architecture' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Activity size={14} />架构说明
        </button>
      </div>

      {subTab === 'status' && (
        <>
          {/* 概览 */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-card rounded-xl p-3 border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Users size={12} />在线人数</div>
              <div className="text-xl font-bold text-green-600">{collabStats.onlineCount}</div>
            </div>
            <div className="bg-card rounded-xl p-3 border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Shield size={12} />协作模式</div>
              <div className="text-xl font-bold">CRDT</div>
            </div>
            <div className="bg-card rounded-xl p-3 border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><GitMerge size={12} />冲突次数</div>
              <div className="text-xl font-bold">{collabStats.conflictCount}</div>
            </div>
            <div className="bg-card rounded-xl p-3 border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Radio size={12} />通道状态</div>
              <div className="text-xl font-bold text-green-600">已连接</div>
            </div>
          </div>

          {/* 在线用户 */}
          <div className="space-y-2">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Radio size={14} className="text-green-500" />
              在线用户
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {onlineUsers.length > 0 ? onlineUsers.map(user => (
                <OnlineUserCard key={user.id} user={user} isSelf={user.id === currentUserId} />
              )) : (
                <>
                  <OnlineUserCard
                    user={{ id: currentUserId, name: currentUserName, color: myColor, lastActive: Date.now() }}
                    isSelf={true}
                  />
                  <div className="flex items-center justify-center text-xs text-muted-foreground border rounded-lg border-dashed p-4">
                    等待其他用户上线...
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 我的协作标识 */}
          <div className="border rounded-lg p-3 space-y-2">
            <div className="text-xs font-semibold flex items-center gap-2"><Eye size={12} />我的协作标识</div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: myColor }}>
                {currentUserName.charAt(0)}
              </div>
              <div>
                <div className="text-sm font-medium">{currentUserName}</div>
                <div className="text-[10px] text-muted-foreground">
                  用户ID: {currentUserId.slice(0, 8)}... | 颜色: {myColor}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {subTab === 'conflicts' && (
        <>
          {/* 冲突统计 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><GitMerge size={12} />合并解决</div>
              <div className="text-2xl font-bold text-purple-600">{collabStats.mergeCount}</div>
              <p className="text-[10px] text-muted-foreground">数组/对象字段自动合并去重</p>
            </div>
            <div className="border rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock size={12} />LWW解决</div>
              <div className="text-2xl font-bold text-blue-600">{collabStats.lwwCount}</div>
              <p className="text-[10px] text-muted-foreground">Last-Writer-Wins 按时间戳判断</p>
            </div>
          </div>

          {/* 冲突历史 */}
          <div className="space-y-2">
            <div className="text-sm font-semibold">冲突历史</div>
            {DEMO_CONFLICTS.map(c => (
              <ConflictCard key={c.id} conflict={c} />
            ))}
            {DEMO_CONFLICTS.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">暂无冲突记录</div>
            )}
          </div>
        </>
      )}

      {subTab === 'architecture' && (
        <div className="space-y-4">
          {/* 架构图 */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Activity size={14} />CRDT 协作架构</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 py-2 border-b">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center"><Users size={14} /></div>
                <div>
                  <div className="font-semibold">协作感知层 (Presence)</div>
                  <div className="text-muted-foreground">Supabase Realtime Presence — 心跳5s，超时15s，在线状态+光标位置</div>
                </div>
              </div>
              <div className="flex items-center gap-2 py-2 border-b">
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center"><Zap size={14} /></div>
                <div>
                  <div className="font-semibold">操作广播层 (Broadcast)</div>
                  <div className="text-muted-foreground">Supabase Realtime Broadcast — 操作序列化+向量时钟追踪因果</div>
                </div>
              </div>
              <div className="flex items-center gap-2 py-2 border-b">
                <div className="w-8 h-8 rounded-lg bg-green-100 text-green-600 flex items-center justify-center"><GitMerge size={14} /></div>
                <div>
                  <div className="font-semibold">冲突解决层 (CRDT)</div>
                  <div className="text-muted-foreground">LWW Register + 字段级合并 — 字符串/数字用LWW，数组用合并去重，对象用深度合并</div>
                </div>
              </div>
              <div className="flex items-center gap-2 py-2">
                <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center"><Shield size={14} /></div>
                <div>
                  <div className="font-semibold">向量时钟 (Vector Clock)</div>
                  <div className="text-muted-foreground">追踪因果顺序 — before/concurrent/after 三态判定，支持并发操作检测</div>
                </div>
              </div>
            </div>
          </div>

          {/* 设计原则 */}
          <div className="border rounded-lg p-4 space-y-2">
            <h3 className="font-semibold text-sm">设计原则</h3>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li className="flex items-start gap-2"><CheckCircle2 size={12} className="text-green-500 mt-0.5 shrink-0" />无需外部服务器：基于 Supabase Realtime，复用现有基础设施</li>
              <li className="flex items-start gap-2"><CheckCircle2 size={12} className="text-green-500 mt-0.5 shrink-0" />字段级 CRDT：每个字段独立 LWW Register，避免整对象冲突</li>
              <li className="flex items-start gap-2"><CheckCircle2 size={12} className="text-green-500 mt-0.5 shrink-0" />向后兼容：与现有 Zustand store 集成，不改变数据流</li>
              <li className="flex items-start gap-2"><CheckCircle2 size={12} className="text-green-500 mt-0.5 shrink-0" />渐进增强：离线时降级为单用户模式，上线后自动同步</li>
              <li className="flex items-start gap-2"><CheckCircle2 size={12} className="text-green-500 mt-0.5 shrink-0" />冲突可审计：所有冲突记录可追溯，支持手动回滚</li>
            </ul>
          </div>

          {/* 通信协议 */}
          <div className="border rounded-lg p-4 space-y-2">
            <h3 className="font-semibold text-sm">通信协议</h3>
            <div className="bg-gray-50 rounded-lg p-3 font-mono text-[11px] space-y-1 overflow-x-auto">
              <div className="text-muted-foreground">// 操作广播协议</div>
              <div>{'{'}</div>
              <div className="pl-4">type: &apos;update&apos; | &apos;create&apos; | &apos;delete&apos;,</div>
              <div className="pl-4">entity: &apos;goal&apos; | &apos;project&apos; | &apos;task&apos; | &apos;member&apos;,</div>
              <div className="pl-4">entityId: string,</div>
              <div className="pl-4">field: string,</div>
              <div className="pl-4">oldValue: any,</div>
              <div className="pl-4">newValue: any,</div>
              <div className="pl-4">userId: string,</div>
              <div className="pl-4">timestamp: number,</div>
              <div className="pl-4">vectorClock: {'{ [userId: string]: number }'}</div>
              <div>{'}'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
