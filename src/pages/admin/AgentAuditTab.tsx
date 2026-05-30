/**
 * Agent 审计与发现 Tab — Agent 操作审计 + Agent Card 发现 + 协议路由
 *
 * Round 6 — Agent友好度 +1
 * - 增强 Agent 发现面板（A2A Agent Card 展示）
 * - 协议路由状态可视化（MCP/A2A/REST）
 * - 人机协同统计
 */
import { useState, useMemo } from 'react';
import { getAuditStats, readAuditLogs, generateAgentCard, translateGatewayRequest, type AuditLogEntry } from '@/lib/agentGateway';
import { identifyActiveAgents, calcAgentPerformance, calcHumanAgentStats } from '@/lib/agentCollaboration';
import { Bot, Shield, AlertTriangle, CheckCircle2, XCircle, Clock, Activity, BarChart3, Users, RefreshCw, Globe, Server, Route, Zap, UserCheck, TrendingUp } from 'lucide-react';

type AgentTab = 'audit' | 'discovery' | 'collab';

export function AgentAuditTab() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [subTab, setSubTab] = useState<AgentTab>('audit');

  const stats = useMemo(() => getAuditStats(), [refreshKey]);
  const logs = useMemo(() => readAuditLogs(50), [refreshKey]);
  const agents = useMemo(() => identifyActiveAgents(), [refreshKey]);
  const agentCard = useMemo(() => generateAgentCard(), [refreshKey]);
  const humanStats = useMemo(() => calcHumanAgentStats(7), [refreshKey]);

  const statusIcon = (result: string) => {
    if (result === 'success') return <CheckCircle2 size={14} className="text-green-600" />;
    if (result === 'error') return <XCircle size={14} className="text-red-500" />;
    return <AlertTriangle size={14} className="text-amber-500" />;
  };

  const statusLabel: Record<string, string> = { success: '成功', error: '失败', denied: '拒绝' };
  const protocolLabel: Record<string, string> = { mcp: 'MCP', a2a: 'A2A', rest: 'REST' };

  return (
    <div className="space-y-5">
      {/* 概览统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3 border border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Activity size={12} />总操作数</div>
          <div className="text-xl font-bold">{stats.totalOps}</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><CheckCircle2 size={12} className="text-green-600" />成功率</div>
          <div className="text-xl font-bold text-green-600">{stats.successRate}%</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><XCircle size={12} className="text-red-500" />错误/拒绝</div>
          <div className="text-xl font-bold">{stats.errors} / {stats.denied}</div>
        </div>
        <div className="bg-white rounded-xl p-3 border border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Bot size={12} />活跃Agent</div>
          <div className="text-xl font-bold">{agents.length}</div>
        </div>
      </div>

      {/* 子 Tab 切换 */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
        <button onClick={() => setSubTab('audit')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${subTab === 'audit' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Shield size={14} /> 审计日志
        </button>
        <button onClick={() => setSubTab('discovery')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${subTab === 'discovery' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <Globe size={14} /> Agent发现
        </button>
        <button onClick={() => setSubTab('collab')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${subTab === 'collab' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <UserCheck size={14} /> 人机协同
        </button>
      </div>

      {/* 审计日志 Tab */}
      {subTab === 'audit' && (
        <div className="space-y-4">
          {/* Agent 列表 + 绩效 */}
          <div className="bg-white rounded-xl border border-border">
            <div className="flex items-center justify-between px-4 py-2.5 border-b">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Users size={14} />活跃 Agent</h3>
              <button onClick={() => setRefreshKey(k => k + 1)} className="p-1.5 hover:bg-muted rounded"><RefreshCw size={12} /></button>
            </div>
            <div className="divide-y">
              {agents.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">暂无 Agent 操作记录</div>}
              {agents.map(a => {
                const perf = calcAgentPerformance(a.agentId, 7);
                return (
                  <div key={a.agentId} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center"><Bot size={14} className="text-primary" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{a.agentId}</div>
                      <div className="text-[10px] text-muted-foreground">{a.opCount}次操作 · 最近: {new Date(a.lastActive).toLocaleString('zh-CN')}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">{perf.contributionScore}分</div>
                      <div className="text-[10px] text-muted-foreground">贡献度</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs">{perf.successOps}/{perf.totalOps}</div>
                      <div className="text-[10px] text-muted-foreground">成功率</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 工具使用排行 */}
          <div className="bg-white rounded-xl border border-border">
            <div className="px-4 py-2.5 border-b"><h3 className="font-semibold text-sm flex items-center gap-2"><BarChart3 size={14} />工具使用排行</h3></div>
            <div className="p-3 space-y-1.5">
              {stats.topTools.map((t, i) => (
                <div key={t.tool} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-3">{i + 1}</span>
                  <span className="text-xs font-mono flex-1">{t.tool}</span>
                  <div className="w-24 bg-muted rounded-full h-1.5"><div className="bg-primary rounded-full h-1.5" style={{ width: `${Math.min(100, (t.count / (stats.topTools[0]?.count || 1)) * 100)}%` }} /></div>
                  <span className="text-[10px] text-muted-foreground w-6 text-right">{t.count}</span>
                </div>
              ))}
              {stats.topTools.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">暂无数据</div>}
            </div>
          </div>

          {/* 操作日志 */}
          <div className="bg-white rounded-xl border border-border">
            <div className="px-4 py-2.5 border-b"><h3 className="font-semibold text-sm flex items-center gap-2"><Shield size={14} />操作日志（最近50条）</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead><tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-1.5 font-medium">时间</th>
                  <th className="text-left px-3 py-1.5 font-medium">Agent</th>
                  <th className="text-left px-3 py-1.5 font-medium">工具</th>
                  <th className="text-left px-3 py-1.5 font-medium">协议</th>
                  <th className="text-left px-3 py-1.5 font-medium">状态</th>
                  <th className="text-right px-3 py-1.5 font-medium">耗时</th>
                </tr></thead>
                <tbody>
                  {logs.slice().reverse().map(l => (
                    <tr key={l.id} className="border-b hover:bg-muted/20">
                      <td className="px-3 py-1 whitespace-nowrap">{new Date(l.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                      <td className="px-3 py-1 font-mono text-[10px]">{l.agentId.length > 12 ? l.agentId.slice(0, 12) + '...' : l.agentId}</td>
                      <td className="px-3 py-1 font-mono">{l.toolName}</td>
                      <td className="px-3 py-1">{protocolLabel[l.protocol] || l.protocol}</td>
                      <td className="px-3 py-1 flex items-center gap-1">{statusIcon(l.result)}{statusLabel[l.result] || l.result}</td>
                      <td className="px-3 py-1 text-right text-muted-foreground">{l.durationMs}ms</td>
                    </tr>
                  ))}
                  {logs.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">暂无审计日志</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Agent 发现 Tab */}
      {subTab === 'discovery' && (
        <div className="space-y-4">
          {/* 本平台 Agent Card */}
          <div className="bg-white rounded-xl border border-border">
            <div className="px-4 py-2.5 border-b"><h3 className="font-semibold text-sm flex items-center gap-2"><Server size={14} />TBH Agent Card（A2A发现）</h3></div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Bot size={20} className="text-primary" /></div>
                <div>
                  <div className="font-semibold">{agentCard.name}</div>
                  <div className="text-xs text-muted-foreground">{agentCard.description}</div>
                </div>
              </div>
              <div className="text-xs font-semibold text-muted-foreground">可用能力 ({agentCard.capabilities.length})</div>
              <div className="grid grid-cols-2 gap-2">
                {agentCard.capabilities.map(c => (
                  <div key={c.name} className="border rounded-lg p-2.5 space-y-1">
                    <div className="text-xs font-medium font-mono">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground">{c.description}</div>
                    <div className="flex items-center gap-1">
                      <Route size={10} className="text-primary" />
                      <span className="text-[10px] text-primary">{c.protocol}</span>
                      {c.authRequired && <span className="text-[10px] text-amber-600 ml-1">需认证</span>}
                    </div>
                  </div>
                ))}
              </div>
              {/* 协议路由示例 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-xs font-semibold text-blue-700 mb-1.5">协议路由示例</div>
                <div className="space-y-1 text-[11px] text-blue-600">
                  <div className="flex items-center gap-1.5"><span className="px-1 py-0.5 bg-blue-100 rounded text-[10px] font-mono">A2A</span>→<span className="px-1 py-0.5 bg-purple-100 rounded text-[10px] font-mono">MCP</span> A2A任务创建 → MCP create_task</div>
                  <div className="flex items-center gap-1.5"><span className="px-1 py-0.5 bg-purple-100 rounded text-[10px] font-mono">MCP</span>→<span className="px-1 py-0.5 bg-green-100 rounded text-[10px] font-mono">REST</span> MCP list_goals → GET /rest/v1/goals</div>
                </div>
              </div>
            </div>
          </div>

          {/* 外部 Agent 接入 */}
          <div className="bg-white rounded-xl border border-border">
            <div className="px-4 py-2.5 border-b"><h3 className="font-semibold text-sm flex items-center gap-2"><Globe size={14} />外部 Agent 接入</h3></div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">外部 AI Agent 可通过以下协议接入团队业务中台：</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="border rounded-lg p-3 text-center space-y-1">
                  <Zap size={16} className="mx-auto text-amber-500" />
                  <div className="text-xs font-semibold">MCP</div>
                  <div className="text-[10px] text-muted-foreground">stdio / HTTP</div>
                  <code className="text-[9px] block bg-gray-50 rounded px-1 py-0.5 font-mono">mcp-server.mjs</code>
                </div>
                <div className="border rounded-lg p-3 text-center space-y-1">
                  <Globe size={16} className="mx-auto text-blue-500" />
                  <div className="text-xs font-semibold">A2A</div>
                  <div className="text-[10px] text-muted-foreground">Agent-to-Agent</div>
                  <code className="text-[9px] block bg-gray-50 rounded px-1 py-0.5 font-mono">/.well-known/agent.json</code>
                </div>
                <div className="border rounded-lg p-3 text-center space-y-1">
                  <Route size={16} className="mx-auto text-green-500" />
                  <div className="text-xs font-semibold">REST API</div>
                  <div className="text-[10px] text-muted-foreground">Supabase REST</div>
                  <code className="text-[9px] block bg-gray-50 rounded px-1 py-0.5 font-mono">/rest/v1/*</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 人机协同 Tab */}
      {subTab === 'collab' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-3 border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><UserCheck size={12} />人机协同次数</div>
              <div className="text-xl font-bold">{humanStats.totalHandoffs}</div>
            </div>
            <div className="bg-white rounded-xl p-3 border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Bot size={12} />Agent自主完成</div>
              <div className="text-xl font-bold">{humanStats.agentAutonomous}</div>
            </div>
            <div className="bg-white rounded-xl p-3 border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><TrendingUp size={12} />协同效率</div>
              <div className="text-xl font-bold text-green-600">{humanStats.efficiency}%</div>
            </div>
            <div className="bg-white rounded-xl p-3 border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Clock size={12} />平均响应时间</div>
              <div className="text-xl font-bold">{humanStats.avgResponseTime}ms</div>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-[11px] text-blue-700"><strong>人机协同最佳实践</strong>：Agent 负责数据查询/状态更新/预测计算，人类负责策略决策/审批/创造性工作。保持"Agent 30% + 人类 70%"的分工比例可最大化效率。</p>
          </div>
        </div>
      )}
    </div>
  );
}
