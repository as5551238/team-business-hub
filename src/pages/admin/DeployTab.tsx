import { useState, useMemo } from 'react';
import { DEFAULT_DEPLOY_CONFIG, generateDockerCompose, generateEnvFile, generateCaddyfile, generateDeployReadme, exportAllData, downloadExport, type DeployConfig } from '@/lib/deployKit';
import { useStore } from '@/store/useStore';
import { Server, Download, Copy, Check, FileText, Database, Shield } from 'lucide-react';

export function DeployTab() {
  const { state } = useStore();
  const [config, setConfig] = useState<DeployConfig>(DEFAULT_DEPLOY_CONFIG);
  const [copied, setCopied] = useState<string>('');

  const dockerCompose = useMemo(() => generateDockerCompose(config), [config]);
  const envFile = useMemo(() => generateEnvFile(config), [config]);
  const caddyfile = useMemo(() => generateCaddyfile(config), [config]);
  const readme = useMemo(() => generateDeployReadme(config), [config]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 2000); });
  };

  const handleExportData = () => {
    const data = exportAllData(state);
    downloadExport(data);
  };

  const codeBlock = (title: string, filename: string, content: string, blockKey: string) => (
    <div className="bg-white rounded-xl border border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-sm flex items-center gap-2"><FileText size={16} />{title}</h3>
        <button onClick={() => copyToClipboard(content, blockKey)} className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs hover:bg-muted transition-colors">
          {copied === blockKey ? <><Check size={12} className="text-green-600" />已复制</> : <><Copy size={12} />复制</>}
        </button>
      </div>
      <pre className="px-4 py-3 text-xs font-mono overflow-x-auto max-h-64 bg-gray-50 rounded-b-xl">{content}</pre>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 概览 */}
      <div className="bg-white rounded-xl border border-border p-4">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-3"><Server size={16} />私有化部署配置</h3>
        <p className="text-xs text-muted-foreground mb-4">生成 Docker Compose 一键部署配置，15 分钟完成私有化。</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">应用名称</label>
            <input type="text" className="w-full border rounded px-2 py-1.5 text-sm" value={config.appName} onChange={e => setConfig({ ...config, appName: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">域名</label>
            <input type="text" className="w-full border rounded px-2 py-1.5 text-sm" value={config.domain} onChange={e => setConfig({ ...config, domain: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">端口</label>
            <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" value={config.port} onChange={e => setConfig({ ...config, port: parseInt(e.target.value) || 3000 })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Supabase URL</label>
            <input type="text" className="w-full border rounded px-2 py-1.5 text-sm font-mono text-xs" value={config.supabaseUrl} onChange={e => setConfig({ ...config, supabaseUrl: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Supabase Key</label>
            <input type="password" className="w-full border rounded px-2 py-1.5 text-sm font-mono text-xs" value={config.supabaseKey} onChange={e => setConfig({ ...config, supabaseKey: e.target.value })} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.enableSSL} onChange={e => setConfig({ ...config, enableSSL: e.target.checked })} className="rounded" />
              启用 SSL (Caddy)
            </label>
          </div>
        </div>
      </div>

      {/* 配置文件 */}
      {codeBlock('docker-compose.yml', 'docker-compose.yml', dockerCompose, 'docker')}
      {codeBlock('.env', '.env', envFile, 'env')}
      {config.enableSSL && codeBlock('Caddyfile', 'Caddyfile', caddyfile, 'caddy')}
      {codeBlock('部署说明', 'README.md', readme, 'readme')}

      {/* 数据导出 */}
      <div className="bg-white rounded-xl border border-border p-4">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-3"><Database size={16} />数据迁移</h3>
        <p className="text-xs text-muted-foreground mb-3">导出当前所有数据为 JSON 文件，可用于迁移到私有化环境。</p>
        <div className="flex gap-3">
          <button onClick={handleExportData} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90">
            <Download size={14} />导出全部数据
          </button>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          当前数据量: {state.goals.length} 目标 · {state.projects.length} 项目 · {state.tasks.length} 任务 · {state.members.length} 成员
        </div>
      </div>

      {/* 安全提示 */}
      <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-2"><Shield size={16} className="text-amber-600" />安全提示</h3>
        <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
          <li>所有数据存储在你自己的 Supabase 实例中，应用不收集用户行为数据</li>
          <li>建议在 .env 中使用强密码，不要将密钥提交到代码仓库</li>
          <li>启用 SSL 时，Caddy 会自动申请 Let's Encrypt 证书</li>
          <li>API Token 权限粒度控制已内建，可为不同 Agent 配置不同权限</li>
        </ul>
      </div>
    </div>
  );
}
