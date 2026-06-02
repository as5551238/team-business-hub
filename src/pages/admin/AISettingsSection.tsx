/**
 * AISettingsTab - AI 模型配置面板
 * 集成到管理中心的"设置"Tab 下
 */
import { useState, useEffect, useRef } from 'react';
import { Key, Check, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { loadAIConfig, saveAIConfig, PROVIDER_PRESETS, callLLM } from '@/lib/ai';
import type { AIConfig, AIModelProvider } from '@/lib/ai';
import { inputCls, primaryBtnCls } from './constants';

export function AISettingsSection() {
  const [config, setConfig] = useState<AIConfig>(loadAIConfig);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testError, setTestError] = useState('');
  const [showModelSelect, setShowModelSelect] = useState(false);
  const modelSelectRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭模型选择下拉框
  useEffect(() => {
    if (!showModelSelect) return;
    const handler = (e: MouseEvent) => {
      if (modelSelectRef.current && !modelSelectRef.current.contains(e.target as Node)) setShowModelSelect(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModelSelect]);

  const update = (updates: Partial<AIConfig>) => {
    const next = { ...config, ...updates };
    setConfig(next);
    saveAIConfig(next);
    setTestResult(null);
    setTestError('');
  };

  const handleProviderChange = (provider: AIModelProvider) => {
    const preset = PROVIDER_PRESETS[provider];
    update({ provider, baseUrl: '', model: '' });
  };

  const handleTest = async () => {
    if (!config.apiKey) return;
    setTesting(true);
    setTestResult(null);
    setTestError('');
    try {
      const result = await callLLM('请回复"连接成功"', config);
      if (result) {
        setTestResult('ok');
      } else {
        setTestResult('fail');
        setTestError('模型返回了空响应，请检查模型名称是否正确');
      }
    } catch (err: unknown) {
      setTestResult('fail');
      setTestError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setTesting(false);
    }
  };

  const preset = PROVIDER_PRESETS[config.provider];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Key size={16} className="text-primary" />
        <h3 className="text-sm font-semibold">AI 智能分析</h3>
      </div>
      <p className="text-xs text-muted-foreground">配置大模型 API 后，可启用 AI 深度分析（健康度评估、风险预警、效率分析、改进建议）。支持 DeepSeek 和豆包免费模型。</p>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={config.enabled} onChange={(e) => update({ enabled: e.target.checked })} className="w-4 h-4 rounded border-border" />
          <span className="text-sm">启用 AI 深度分析</span>
        </label>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">模型供应商</label>
        <div className="flex gap-2">
          {(Object.keys(PROVIDER_PRESETS) as AIModelProvider[]).map((p) => (
            <button key={p} onClick={() => handleProviderChange(p)} className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${config.provider === p ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:bg-muted/50'}`}>
              {PROVIDER_PRESETS[p].label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">API Key</label>
        <input type="password" value={config.apiKey} onChange={(e) => update({ apiKey: e.target.value })} placeholder={`输入 ${preset.label} API Key`} className={inputCls} />
        <p className="text-xs text-muted-foreground">
          {config.provider === 'deepseek' ? '前往 platform.deepseek.com 获取 API Key' : '前往火山引擎控制台获取 API Key'}
        </p>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">高级设置</summary>
        <div className="mt-2 space-y-2 pl-2">
          <div className="space-y-1">
            <label className="text-muted-foreground">API 端点</label>
            <input type="text" value={config.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })} placeholder={preset.baseUrl} className={inputCls} />
            {config.provider === 'deepseek' && config.baseUrl && config.baseUrl !== preset.baseUrl && (
              <p className="text-amber-600">提示：DeepSeek 官方端点为 {preset.baseUrl}，自定义端点仅用于私有部署</p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-muted-foreground">模型名称</label>
            <div className="flex gap-2">
              <input type="text" value={config.model} onChange={(e) => update({ model: e.target.value })} placeholder={preset.model} className={inputCls + ' flex-1'} />
              {preset.models && preset.models.length > 0 && (
                <div className="relative" ref={modelSelectRef}>
                  <button type="button" onClick={() => setShowModelSelect(!showModelSelect)} className="px-2 py-1 border border-border rounded-md text-muted-foreground hover:bg-muted/50"><ChevronDown size={14} /></button>
                  {showModelSelect && (
                    <div className="absolute right-0 top-8 z-10 bg-card border border-border rounded-md shadow-lg min-w-[160px]">
                      {preset.models.map((m) => (
                        <button key={m} type="button" onClick={() => { update({ model: m }); setShowModelSelect(false); }} className={`w-full text-left px-3 py-1.5 hover:bg-muted/50 ${(config.model || preset.model) === m ? 'text-primary font-medium' : ''}`}>{m}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {config.provider === 'deepseek' && <p className="text-amber-600">提示：deepseek-chat 将于 2026/07/24 弃用，建议使用 deepseek-v4-flash</p>}
          </div>
        </div>
      </details>

      <div className="flex items-center gap-3">
        <button onClick={handleTest} disabled={!config.apiKey || testing} className={primaryBtnCls + (!config.apiKey || testing ? ' opacity-50 cursor-not-allowed' : '')}>
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {testing ? '测试中...' : '测试连接'}
        </button>
        {testResult === 'ok' && (
          <span className="flex items-center gap-1 text-xs text-green-600"><Check size={14} />连接成功</span>
        )}
        {testResult === 'fail' && (
          <div className="flex-1">
            <span className="flex items-center gap-1 text-xs text-red-600"><AlertCircle size={14} />连接失败</span>
            {testError && <p className="text-xs text-red-500 mt-1 break-all">{testError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
