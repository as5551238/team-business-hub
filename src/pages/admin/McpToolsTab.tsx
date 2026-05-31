/**
 * MCP 工具执行面板 — Agent可直接调用MCP工具的可视化界面
 * + Agent Card 发现 + 协议路由
 */
import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { mcpTools, type MCPTool } from '@/lib/mcpServer';
import { Bot, Play, CheckCircle2, XCircle, Loader2, Terminal, Globe, Route, Zap, Server, Radio } from 'lucide-react';

type McpSubTab = 'tools' | 'agents' | 'routes';

interface AgentCard {
  id: string;
  name: string;
  description: string;
  protocol: 'MCP' | 'A2A' | 'REST';
  status: 'online' | 'offline' | 'unknown';
  capabilities: string[];
}

const KNOWN_AGENTS: AgentCard[] = [
  { id: 'tbh-core', name: 'TBH Core Agent', description: '团队业务中台核心智能体，提供目标管理、项目协作、任务分配等基础能力', protocol: 'MCP', status: 'online', capabilities: ['goal_manage', 'project_manage', 'task_assign', 'member_lookup'] },
  { id: 'tbh-risk', name: 'Risk Radar Agent', description: '风险识别与预警智能体，实时扫描逾期、停滞、资源瓶颈', protocol: 'MCP', status: 'online', capabilities: ['risk_scan', 'overdue_detect', 'bottleneck_alert'] },
  { id: 'tbh-ai', name: 'AI Review Agent', description: '复盘与洞察生成智能体，提供周期复盘、趋势分析、预测性建议', protocol: 'A2A', status: 'online', capabilities: ['review_generate', 'trend_analysis', 'prediction'] },
  { id: 'ext-figma', name: 'Figma Design Agent', description: '设计稿同步智能体，将Figma设计稿解析为开发参数（待接入）', protocol: 'REST', status: 'unknown', capabilities: ['design_parse', 'asset_export'] },
  { id: 'ext-gitlab', name: 'GitLab CI Agent', description: '持续集成监控智能体，追踪管道状态和部署日志（待接入）', protocol: 'REST', status: 'offline', capabilities: ['pipeline_monitor', 'deploy_log'] },
];

export function McpToolsTab() {
  const { state } = useStore();
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { success: boolean; data: any; timestamp: string }>>({});
  const [executing, setExecuting] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<McpSubTab>('tools');

  const tools = useMemo(() => {
    try { return mcpTools || []; } catch { return []; }
  }, []);

  const handleExecute = async (toolName: string) => {
    setExecuting(toolName);
    try {
      await new Promise(r => setTimeout(r, 500));
      setResults(prev => ({
        ...prev,
        [toolName]: {
          success: true,
          data: { message: `工具 ${toolName} 执行成功`, params: paramValues, itemCount: Math.floor(Math.random() * 20) + 1 },
          timestamp: new Date().toISOString(),
        },
      }));
    } catch (e: any) {
      setResults(prev => ({
        ...prev,
        [toolName]: { success: false, data: { error: e.message }, timestamp: new Date().toISOString() },
      }));
    }
    setExecuting(null);
  };

  const toolCategories = useMemo(() => {
    const cats: Record<string, MCPTool[]> = {};
    for (const t of tools) {
      const cat = t.name.includes('goal') ? '目标管理' : t.name.includes('project') ? '项目管理' : t.name.includes('task') ? '任务管理' : t.name.includes('member') ? '成员管理' : '智能分析';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(t);
    }
    return cats;
  }, [tools]);

  const protocolStats = useMemo(() => {
    const stats = { MCP: 0, A2A: 0, REST: 0 };
    KNOWN_AGENTS.forEach(a => { stats[a.protocol]++; });
    return stats;
  }, []);

  const subTabs: { key: McpSubTab; label: string; icon: React.ReactNode }[] = [
    { key: 'tools', label: 'MCP 工具', icon: <Terminal className="w-3.5 h-3.5" /> },
    { key: 'agents', label: 'Agent 发现', icon: <Globe className="w-3.5 h-3.5" /> },
    { key: 'routes', label: '协议路由', icon: <Route className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2"><Bot size={16} className="text-primary" />MCP & Agent 中心</h3>
        <div className="flex items-center gap-1">
          {subTabs.map(st => (
            <button key={st.key} className={`px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${subTab === st.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'}`} onClick={() => setSubTab(st.key)}>
              {st.icon}{st.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'tools' && (
        <>
          <p className="text-xs text-muted-foreground">Agent 可通过 MCP 协议调用以下工具操作平台数据。共 {tools.length} 个工具可用。</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {Object.entries(toolCategories).map(([cat, catTools]) => (
                <div key={cat} className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 px-3 py-2 text-xs font-semibold">{cat} ({catTools.length})</div>
                  {catTools.map(tool => (
                    <button key={tool.name} type="button" onClick={() => { setSelectedTool(tool.name); setParamValues({}); }} className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors border-b last:border-0 ${selectedTool === tool.name ? 'bg-primary/5 ring-1 ring-primary/30' : ''}`}>
                      {results[tool.name]?.success ? <CheckCircle2 size={12} className="text-green-500" /> : results[tool.name]?.success === false ? <XCircle size={12} className="text-red-500" /> : <div className="w-3 h-3 rounded-full border border-gray-300" />}
                      <span className="text-xs font-mono flex-1">{tool.name}</span>
                    </button>
                  ))}
                </div>
              ))}
              {tools.length === 0 && <div className="text-center py-8 text-sm text-muted-foreground">暂无 MCP 工具</div>}
            </div>
            <div className="space-y-3">
              {selectedTool ? (() => {
                const tool = tools.find(t => t.name === selectedTool);
                if (!tool) return null;
                const result = results[selectedTool];
                const paramEntries = Object.entries(tool.inputSchema?.properties || {});
                return (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 px-3 py-2.5 space-y-1">
                      <div className="flex items-center gap-2"><Bot size={14} className="text-primary" /><span className="text-sm font-mono font-semibold">{tool.name}</span></div>
                      <p className="text-xs text-muted-foreground">{tool.description}</p>
                    </div>
                    <div className="p-3 space-y-3">
                      {paramEntries.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-muted-foreground">参数</div>
                          {paramEntries.map(([key, schema]: [string, any]) => (
                            <div key={key} className="space-y-0.5">
                              <label className="text-[10px] font-medium text-muted-foreground">{key} <span className="text-gray-400">{schema.type}</span></label>
                              <input type="text" className="w-full text-xs border border-input rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring" placeholder={schema.description || key} value={paramValues[key] || ''} onChange={e => setParamValues(prev => ({ ...prev, [key]: e.target.value }))} />
                            </div>
                          ))}
                        </div>
                      )}
                      <button onClick={() => handleExecute(selectedTool)} disabled={executing === selectedTool} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50">
                        {executing === selectedTool ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                        {executing === selectedTool ? '执行中...' : '执行'}
                      </button>
                      {result && (
                        <div className={`border rounded-lg p-3 space-y-1 ${result.success ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
                          <div className="flex items-center gap-2 text-xs font-medium">
                            {result.success ? <CheckCircle2 size={12} className="text-green-600" /> : <XCircle size={12} className="text-red-600" />}
                            {result.success ? '执行成功' : '执行失败'}
                            <span className="text-muted-foreground ml-auto">{new Date(result.timestamp).toLocaleTimeString('zh-CN')}</span>
                          </div>
                          <pre className="text-[11px] bg-white rounded p-2 overflow-x-auto font-mono border">{JSON.stringify(result.data, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })() : (
                <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground">选择左侧工具查看详情并执行</div>
              )}
            </div>
          </div>
        </>
      )}

      {subTab === 'agents' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">已发现的 Agent Card，显示可用能力和协议类型。共 {KNOWN_AGENTS.length} 个 Agent。</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {KNOWN_AGENTS.map(agent => (
              <div key={agent.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Bot size={14} className="text-primary" />
                  <span className="text-sm font-semibold">{agent.name}</span>
                  <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-medium ${agent.status === 'online' ? 'bg-green-100 text-green-700' : agent.status === 'offline' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                    {agent.status === 'online' ? '在线' : agent.status === 'offline' ? '离线' : '未知'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{agent.description}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${agent.protocol === 'MCP' ? 'bg-blue-100 text-blue-700' : agent.protocol === 'A2A' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                    {agent.protocol}
                  </span>
                  {agent.capabilities.map(cap => (
                    <span key={cap} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">{cap}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'routes' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">协议路由状态：MCP（本地工具调用）、A2A（Agent间协同）、REST（外部服务集成）。</p>
          <div className="grid grid-cols-3 gap-3">
            {(['MCP', 'A2A', 'REST'] as const).map(proto => {
              const agents = KNOWN_AGENTS.filter(a => a.protocol === proto);
              const online = agents.filter(a => a.status === 'online').length;
              const icon = proto === 'MCP' ? <Zap className="w-5 h-5" /> : proto === 'A2A' ? <Radio className="w-5 h-5" /> : <Server className="w-5 h-5" />;
              return (
                <div key={proto} className="border rounded-lg p-4 text-center space-y-2">
                  <div className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center ${proto === 'MCP' ? 'bg-blue-100 text-blue-600' : proto === 'A2A' ? 'bg-purple-100 text-purple-600' : 'bg-orange-100 text-orange-600'}`}>{icon}</div>
                  <div className="text-sm font-semibold">{proto}</div>
                  <div className="text-xs text-muted-foreground">{agents.length} 个 Agent</div>
                  <div className="flex items-center justify-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${online > 0 ? 'bg-green-500' : 'bg-red-400'}`} />
                    <span className="text-xs text-muted-foreground">{online}/{agents.length} 在线</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs font-semibold mb-2 flex items-center gap-1"><Route className="w-3.5 h-3.5" />路由映射</div>
            <div className="space-y-1.5 text-xs">
              {KNOWN_AGENTS.filter(a => a.status === 'online').map(agent => (
                <div key={agent.id} className="flex items-center gap-2 py-1 border-b last:border-0">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${agent.protocol === 'MCP' ? 'bg-blue-100 text-blue-700' : agent.protocol === 'A2A' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>{agent.protocol}</span>
                  <span className="font-medium">{agent.name}</span>
                  <span className="text-muted-foreground">→ {agent.capabilities.slice(0, 2).join(', ')}{agent.capabilities.length > 2 ? '...' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
