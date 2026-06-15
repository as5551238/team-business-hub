/**
 * 周报面板 — 展示 AI 生成的周报，支持编辑和导出
 *
 * 三种模式：
 * - 实时生成：从当前 store 数据生成本地周报
 * - AI增强：DeepSeek 增强下周建议
 * - 推送模式：从 push_notifications 读取服务端推送的周报
 *
 * 编辑：summary / nextWeekFocus 可直接编辑
 * 导出：PDF (html2canvas + jsPDF) / PNG (html2canvas)
 */

import React, { useState, useCallback, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import {
  generateWeeklyReportLocal,
  generateWeeklyReportDeep,
} from '@/lib/ai/aiWeeklyReport';
import type {
  WeeklyReport,
  KeyAchievement,
  GoalProgressItem,
  MemberContribution,
  WeeklyRiskSummary,
} from '@/lib/ai/aiWeeklyReport';
import { trackAIReportGeneration } from '@/store/behaviorTracking';
import {
  BarChart3,
  RefreshCw,
  Sparkles,
  Loader2,
  Download,
  FileImage,
  FileText,
  Pencil,
  Check,
  X,
  Trophy,
  Target,
  Users,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WeeklyReportPanelProps {
  className?: string;
}

export function WeeklyReportPanel({ className }: WeeklyReportPanelProps) {
  const { state } = useStore();
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [useLLM, setUseLLM] = useState(false);

  // 编辑状态
  const [editingField, setEditingField] = useState<'summary' | 'nextWeekFocus' | null>(null);
  const [editDraft, setEditDraft] = useState('');

  // 导出状态
  const [exporting, setExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const generateReport = useCallback(async (withLLM: boolean) => {
    setIsLoading(true);
    setUseLLM(withLLM);
    try {
      if (withLLM) {
        const result = await generateWeeklyReportDeep(state);
        setReport(result);
        trackAIReportGeneration('weekly_report', true, true);
      } else {
        const result = generateWeeklyReportLocal(state);
        setReport(result);
        trackAIReportGeneration('weekly_report', false, true);
      }
    } catch {
      trackAIReportGeneration('weekly_report', withLLM, false);
    } finally {
      setIsLoading(false);
    }
  }, [state]);

  // 编辑
  const startEdit = (field: 'summary' | 'nextWeekFocus') => {
    if (!report) return;
    setEditingField(field);
    setEditDraft(report[field]);
  };

  const confirmEdit = () => {
    if (!report || !editingField) return;
    setReport({ ...report, [editingField]: editDraft });
    setEditingField(null);
  };

  const cancelEdit = () => {
    setEditingField(null);
  };

  // 导出 PNG
  const exportPNG = useCallback(async () => {
    if (!contentRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `周报_${report?.periodStart || 'export'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('PNG export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [report]);

  // 导出 PDF
  const exportPDF = useCallback(async () => {
    if (!contentRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
      pdf.save(`周报_${report?.periodStart || 'export'}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [report]);

  // 辅助
  const impactBadge = (impact: string) => {
    switch (impact) {
      case 'high': return 'text-red-600 bg-red-50 dark:bg-red-900/20';
      case 'medium': return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
      default: return 'text-muted-foreground bg-muted';
    }
  };
  const impactLabel = (impact: string) => impact === 'high' ? '高影响' : impact === 'medium' ? '中影响' : '低影响';

  const statusColor = (status: string) => {
    switch (status) {
      case 'on-track': return 'text-emerald-600';
      case 'at-risk': return 'text-yellow-600';
      case 'behind': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };
  const statusLabel = (status: string) => {
    switch (status) {
      case 'on-track': return '正常';
      case 'at-risk': return '有风险';
      case 'behind': return '落后';
      default: return status;
    }
  };

  const gradeColor = (grade: string) => {
    switch (grade) {
      case 'S': return 'text-purple-600 bg-purple-50 dark:bg-purple-900/20';
      case 'A': return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20';
      case 'B': return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20';
      case 'C': return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
      default: return 'text-red-600 bg-red-50 dark:bg-red-900/20';
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">周报</h2>
          {report && (
            <span className="text-[10px] text-muted-foreground">
              {report.periodStart} ~ {report.periodEnd}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => generateReport(false)} disabled={isLoading}>
            {isLoading && !useLLM ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            刷新
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => generateReport(true)} disabled={isLoading}>
            {isLoading && useLLM ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
            AI增强
          </Button>
          {report && (
            <div className="relative ml-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={exporting}>
                <Download className="w-3 h-3 mr-1" />
                {exporting ? '导出中...' : '导出'}
              </Button>
              {!exporting && (
                <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 min-w-[100px]">
                  <button className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted" onClick={exportPNG}>
                    <FileImage className="w-3 h-3" /> PNG图片
                  </button>
                  <button className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted" onClick={exportPDF}>
                    <FileText className="w-3 h-3" /> PDF文件
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!report && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            <BarChart3 className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">点击刷新生成本周周报</p>
            <p className="text-xs opacity-60 mt-1">或使用 AI增强 获取更智能的下周建议</p>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">正在生成...</span>
          </div>
        )}

        {report && !isLoading && (
          <div ref={contentRef} className="px-4 py-3 space-y-4 bg-white dark:bg-background">
            {/* Summary */}
            <Section title="本周概述" icon={<TrendingUp className="w-3 h-3" />}>
              {editingField === 'summary' ? (
                <div className="space-y-1">
                  <textarea
                    className="w-full text-xs border border-border rounded p-2 min-h-[60px] resize-y bg-background"
                    value={editDraft}
                    onChange={e => setEditDraft(e.target.value)}
                  />
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={confirmEdit}>
                      <Check className="w-3 h-3 mr-0.5" /> 保存
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={cancelEdit}>
                      <X className="w-3 h-3 mr-0.5" /> 取消
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-1">
                  <p className="text-xs leading-relaxed flex-1">{report.summary}</p>
                  <button className="p-0.5 text-muted-foreground hover:text-foreground" onClick={() => startEdit('summary')}>
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}
            </Section>

            {/* Key Achievements */}
            {report.keyAchievements.length > 0 && (
              <Section title="关键成果" icon={<Trophy className="w-3 h-3" />}>
                <div className="space-y-1.5">
                  {report.keyAchievements.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-card border border-border">
                      <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0', impactBadge(a.impact))}>
                        {impactLabel(a.impact)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{a.title}</p>
                        <p className="text-[10px] text-muted-foreground">{a.assignee} · {a.completedDate}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Goal Progress */}
            {report.goalProgress.length > 0 && (
              <Section title="目标进度" icon={<Target className="w-3 h-3" />}>
                <div className="space-y-1.5">
                  {report.goalProgress.map(g => (
                    <div key={g.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-card border border-border">
                      <span className={cn('font-medium', statusColor(g.status))}>{statusLabel(g.status)}</span>
                      <span className="flex-1 truncate">{g.title}</span>
                      <span className="text-muted-foreground">
                        {g.startProgress}→{g.endProgress}
                        {g.delta > 0 && <span className="text-emerald-500 ml-1">+{g.delta}%</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Member Contributions */}
            {report.memberContributions.length > 0 && (
              <Section title="团队贡献" icon={<Users className="w-3 h-3" />}>
                <div className="space-y-1">
                  {report.memberContributions.slice(0, 5).map(m => (
                    <div key={m.memberId} className="flex items-center gap-2 text-xs">
                      <span className={cn('inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold', gradeColor(m.grade))}>
                        {m.grade}
                      </span>
                      <span className="flex-1 truncate">{m.name}</span>
                      <span className="text-muted-foreground">{m.tasksCompleted}完成</span>
                      <span className="text-muted-foreground">{Math.round(m.onTimeRate * 100)}%准时</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Risk Summary */}
            {report.riskSummary.totalRisks > 0 && (
              <Section title="风险摘要" icon={<AlertTriangle className="w-3 h-3" />}>
                <div className="space-y-1.5">
                  <div className="flex gap-3 text-xs">
                    <span>总风险: <strong>{report.riskSummary.totalRisks}</strong></span>
                    <span className="text-red-500">严重: <strong>{report.riskSummary.criticalRisks}</strong></span>
                    <span className="text-emerald-500">已解决: <strong>{report.riskSummary.resolvedCount}</strong></span>
                  </div>
                  {report.riskSummary.newRisks.map((r, i) => (
                    <div key={i} className={cn('p-2 rounded text-xs', r.severity === 'critical' ? 'bg-red-50 dark:bg-red-900/20 text-red-600' : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600')}>
                      {r.title}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Next Week Focus */}
            <Section title="下周重点" icon={<Sparkles className="w-3 h-3 text-primary" />}>
              {editingField === 'nextWeekFocus' ? (
                <div className="space-y-1">
                  <textarea
                    className="w-full text-xs border border-border rounded p-2 min-h-[60px] resize-y bg-background"
                    value={editDraft}
                    onChange={e => setEditDraft(e.target.value)}
                  />
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={confirmEdit}>
                      <Check className="w-3 h-3 mr-0.5" /> 保存
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={cancelEdit}>
                      <X className="w-3 h-3 mr-0.5" /> 取消
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-start gap-1">
                    <p className="text-xs leading-relaxed flex-1">{report.nextWeekFocus}</p>
                    <button className="p-0.5 text-muted-foreground hover:text-foreground shrink-0" onClick={() => startEdit('nextWeekFocus')}>
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== 内联子组件 =====

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}
