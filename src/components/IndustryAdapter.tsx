// P2: 行业适配器 — 行业选择 + 模板预览 + 一键适配
import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { Building2, Check, Wand2, RefreshCw, Tag, Target, BarChart3, AlertTriangle } from 'lucide-react';
import { trackBehavior } from '@/store/behaviorTracking';

interface IndustryTemplate {
  key: string;
  name: string;
  icon: string;
  description: string;
  goalCategories: Array<{ name: string; icon: string }>;
  taskTags: string[];
  kpiTemplates: Array<{ name: string; unit: string; direction: string }>;
  riskFactors: string[];
}

interface DetectionResult {
  detectedIndustry: string;
  confidence: number;
  scores: Record<string, number>;
}

const INDUSTRIES = [
  { key: 'internet', name: '互联网/软件', icon: '💻' },
  { key: 'manufacturing', name: '制造业', icon: '🏭' },
  { key: 'finance', name: '金融', icon: '🏦' },
  { key: 'education', name: '教育', icon: '🎓' },
  { key: 'healthcare', name: '医疗健康', icon: '🏥' },
  { key: 'retail', name: '零售/消费', icon: '🛍' },
];

function TemplatePreview({ template }: { template: IndustryTemplate }) {
  return (
    <div className="space-y-3 text-xs">
      <p className="text-muted-foreground">{template.description}</p>
      <div>
        <div className="flex items-center gap-1 font-semibold text-muted-foreground mb-1"><Target size={11} />目标分类 ({template.goalCategories.length})</div>
        <div className="flex flex-wrap gap-1">
          {template.goalCategories.map(c => <span key={c.name} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">{c.icon} {c.name}</span>)}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-1 font-semibold text-muted-foreground mb-1"><Tag size={11} />任务标签 ({template.taskTags.length})</div>
        <div className="flex flex-wrap gap-1">
          {template.taskTags.map(t => <span key={t} className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px]">{t}</span>)}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-1 font-semibold text-muted-foreground mb-1"><BarChart3 size={11} />KPI指标 ({template.kpiTemplates.length})</div>
        <div className="flex flex-wrap gap-1">
          {template.kpiTemplates.map(k => <span key={k.name} className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px]">{k.name}({k.unit}) {k.direction === 'up' ? '↑' : '↓'}</span>)}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-1 font-semibold text-muted-foreground mb-1"><AlertTriangle size={11} />风险因子 ({template.riskFactors.length})</div>
        <div className="flex flex-wrap gap-1">
          {template.riskFactors.map(r => <span key={r} className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px]">{r}</span>)}
        </div>
      </div>
    </div>
  );
}

export default function IndustryAdapter() {
  const { state } = useStore();
  const [currentIndustry, setCurrentIndustry] = useState<string | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<IndustryTemplate | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const loadIndustry = useCallback(async () => {
    const sb = (await import('@/supabase/client')).getSupabaseClient();
    if (!sb) return;
    try {
      const { data } = await sb.from('team_industry_profile').select('*').limit(1).single();
      if (data) setCurrentIndustry(data.industry_key);
    } catch {}
  }, []);

  const detectIndustry = useCallback(async () => {
    const sb = (await import('@/supabase/client')).getSupabaseClient();
    if (!sb || !state.currentUser?.teamId) return;
    setLoading(true);
    try {
      const { data } = await sb.rpc('detect_industry', { p_team_id: state.currentUser.teamId });
      if (data) setDetection(data as DetectionResult);
    } catch {}
    setLoading(false);
  }, [state.currentUser?.teamId]);

  const loadTemplate = useCallback(async (key: string) => {
    const sb = (await import('@/supabase/client')).getSupabaseClient();
    if (!sb) return;
    try {
      const { data } = await sb.rpc('get_industry_template', { p_industry_key: key });
      if (data) setPreviewTemplate(data as IndustryTemplate);
    } catch {}
  }, []);

  const applyIndustry = useCallback(async (key: string) => {
    const sb = (await import('@/supabase/client')).getSupabaseClient();
    if (!sb || !state.currentUser?.teamId) return;
    setLoading(true);
    try {
      const industry = INDUSTRIES.find(i => i.key === key);
      await sb.from('team_industry_profile').upsert({
        team_id: state.currentUser.teamId,
        industry_key: key,
        industry_name: industry?.name || key,
        confirmed_by: state.currentUser.id,
        confirmed_at: new Date().toISOString(),
      }, { onConflict: 'team_id' });
      setCurrentIndustry(key);
      trackBehavior({ type: 'INDUSTRY_SELECTED', payload: { industryKey: key } } as any);
    } catch {}
    setLoading(false);
  }, [state.currentUser]);

  useEffect(() => { loadIndustry(); detectIndustry(); }, [loadIndustry, detectIndustry]);

  const currentLabel = currentIndustry ? INDUSTRIES.find(i => i.key === currentIndustry)?.name : null;
  const detectedLabel = detection?.detectedIndustry && detection.detectedIndustry !== 'general'
    ? INDUSTRIES.find(i => i.key === detection.detectedIndustry)?.name : null;

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-indigo-500" />
          <span className="text-sm font-semibold">行业适配</span>
          {currentLabel && (
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
              {INDUSTRIES.find(i => i.key === currentIndustry)?.icon} {currentLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {loading && <RefreshCw size={12} className="animate-spin text-muted-foreground" />}
          <svg width="12" height="12" viewBox="0 0 12 12" className={`text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}>
            <path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          {currentIndustry ? (
            <div className="flex items-center gap-2 text-xs">
              <Check size={14} className="text-emerald-500" />
              <span className="text-muted-foreground">当前行业：</span>
              <span className="font-medium">{INDUSTRIES.find(i => i.key === currentIndustry)?.icon} {currentLabel}</span>
              <button onClick={() => { setCurrentIndustry(null); setSelectedIndustry(null); setPreviewTemplate(null); }} className="ml-auto text-muted-foreground hover:text-foreground text-[10px]">切换</button>
            </div>
          ) : detectedLabel ? (
            <div className="flex items-center gap-2 text-xs bg-blue-50 text-blue-700 rounded-lg px-3 py-2">
              <Wand2 size={14} />
              <span>智能识别：<strong>{INDUSTRIES.find(i => i.key === detection!.detectedIndustry)?.icon} {detectedLabel}</strong>（置信度 {detection!.confidence}%）</span>
              <button onClick={() => applyIndustry(detection!.detectedIndustry)} className="ml-auto text-blue-600 hover:text-blue-800 font-medium text-[10px]">采用</button>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">选择您的行业，获取专属目标分类、任务标签和KPI模板</div>
          )}

          {(!currentIndustry || selectedIndustry) && (
            <div className="grid grid-cols-3 gap-2">
              {INDUSTRIES.map(ind => (
                <button key={ind.key}
                  onClick={() => { setSelectedIndustry(ind.key); loadTemplate(ind.key); }}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs transition-all ${
                    selectedIndustry === ind.key ? 'border-primary bg-primary/5 ring-1 ring-primary/20' :
                    'border-border hover:border-primary/30 hover:bg-muted/20'
                  }`}
                >
                  <span className="text-lg">{ind.icon}</span>
                  <span className="font-medium text-[10px]">{ind.name}</span>
                </button>
              ))}
            </div>
          )}

          {previewTemplate && selectedIndustry && !currentIndustry && (
            <div className="space-y-3">
              <TemplatePreview template={previewTemplate} />
              <button
                onClick={() => applyIndustry(selectedIndustry)}
                disabled={loading}
                className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? '应用中...' : `采用 ${previewTemplate.name} 模板`}
              </button>
            </div>
          )}

          {currentIndustry && previewTemplate && (
            <TemplatePreview template={previewTemplate} />
          )}

          {currentIndustry && !previewTemplate && (
            <button onClick={() => loadTemplate(currentIndustry)} className="text-xs text-primary hover:underline">查看模板详情</button>
          )}
        </div>
      )}
    </div>
  );
}
