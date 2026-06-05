import React, { useState } from 'react';
import { useStore } from '@/store/useStore';
import type { Goal, KeyResult, KrTrack, Task } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, FolderKanban, CheckSquare, Square } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { genId } from '@/store/utils';
import { useAppNavigate } from '@/lib/routes';
import { Section, STATUS_MAP } from './detail-shared';
import { calcDualTrack, calcKpiKrScore, getKpiStatusColor, getKpiStatusLabel } from '@/lib/kpiScoring';

interface DetailKRsProps {
  goal: Goal;
  canEdit: boolean;
  updateItem: (updates: Record<string, unknown>) => void;
}

export function DetailKRs({ goal, canEdit, updateItem }: DetailKRsProps) {
  const { state, dispatch } = useStore();
  const { goToItem } = useAppNavigate();
  const [editingKrId, setEditingKrId] = useState<string | null>(null);
  const [krDraft, setKrDraft] = useState<Partial<KeyResult>>({});
  const [showAddProject, setShowAddProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');

  function handleAddKR() {
    if ((goal.keyResults || []).length >= 5) return;
    const kr: KeyResult = { id: genId('kr'), title: '新关键结果', targetValue: 100, currentValue: 0, unit: '%', selected: true };
    updateItem({ keyResults: [...goal.keyResults, kr] });
  }

  function handleUpdateKR(krId: string, updates: Partial<KeyResult>) {
    const newKRs = goal.keyResults.map(kr => kr.id === krId ? { ...kr, ...updates } : kr);
    const extraUpdates: Record<string, unknown> = { keyResults: newKRs };
    if ('selected' in updates) {
      const selectedIds = newKRs.filter(kr => kr.selected).map(kr => kr.id);
      extraUpdates.selectedKRIds = selectedIds;
    }
    updateItem(extraUpdates);
  }

  function handleDeleteKR(krId: string) {
    if (!confirm('确认删除此关键结果？')) return;
    const newKRs = goal.keyResults.filter(kr => kr.id !== krId);
    updateItem({ keyResults: newKRs, selectedKRIds: (goal.selectedKRIds || []).filter(id => id !== krId) });
  }

  function handleAddProject() {
    if (!newProjectTitle.trim()) return;
    dispatch({ type: 'ADD_PROJECT', payload: { title: newProjectTitle.trim(), goalId: goal.id, parentId: null, status: 'todo', priority: 'medium', leaderId: state.currentUser?.id || '', supporterIds: [], tags: [], description: '', startDate: '', endDate: '', category: '', attachments: [], trackingRecords: [], repeatCycle: 'none' as const, taskCount: 0 } });
    setNewProjectTitle('');
    setShowAddProject(false);
  }

  
  function handleExportReport() {
    const krs = goal.keyResults ?? [];
    const dualTrack = calcDualTrack(krs);
    const report = {
      goal: { title: goal.title, type: goal.type, status: goal.status, progress: goal.progress },
      keyResults: krs,
      dualTrack,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = goal.title + '-report.json'; a.click();
    URL.revokeObjectURL(url);
  }

return (
    <>
      <Section title="关键结果">
        <div className="space-y-3">
          {(goal.keyResults || []).map(kr => {
            const pct = kr.targetValue > 0 ? Math.min(100, Math.round((kr.currentValue / kr.targetValue) * 100)) : 0;
            const linkedTasks = state.tasks.filter((t: Task) => t.krId === kr.id);
            const completedLinked = linkedTasks.filter((t: Task) => t.status === 'done').length;
            const totalLinked = linkedTasks.length;
            const hasLinkedTasks = totalLinked > 0;
            return (
              <div key={kr.id} className={`border rounded p-2 space-y-2${!canEdit ? ' opacity-60 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-2">
                  <Checkbox checked={kr.selected} onCheckedChange={() => handleUpdateKR(kr.id, { selected: !kr.selected })} disabled={!canEdit} />
                  {editingKrId === kr.id ? (
                    <input className="flex-1 text-sm border border-input rounded px-1.5 py-0.5" value={krDraft.title || ''} onChange={e => setKrDraft({ ...krDraft, title: e.target.value })} onBlur={() => { handleUpdateKR(kr.id, { title: krDraft.title || kr.title }); setEditingKrId(null); }} onKeyDown={e => { if (e.key === 'Enter') { handleUpdateKR(kr.id, { title: krDraft.title || kr.title }); setEditingKrId(null); } }} autoFocus />
                  ) : (
                    <span className="flex-1 text-sm cursor-pointer hover:text-primary" onClick={() => { setEditingKrId(kr.id); setKrDraft({ title: kr.title }); }}>{kr.title}</span>
                  )}
                  <button className="p-0.5 hover:bg-destructive/10 rounded cursor-pointer" onClick={() => handleDeleteKR(kr.id)} aria-label="删除关键结果"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                </div>
                {hasLinkedTasks ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-medium">自动计算: {completedLinked}/{totalLinked} 任务完成</span>
                    <span className="ml-auto font-medium">{pct}%</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="number" className="w-16 border border-input rounded px-1.5 py-0.5 text-sm" value={kr.currentValue} onChange={e => handleUpdateKR(kr.id, { currentValue: Number(e.target.value) })} />
                    <span>/</span>
                    <input type="number" className="w-16 border border-input rounded px-1.5 py-0.5 text-sm" value={kr.targetValue} onChange={e => handleUpdateKR(kr.id, { targetValue: Number(e.target.value) })} />
                    <input type="text" className="w-10 border border-input rounded px-1.5 py-0.5 text-sm" value={kr.unit} onChange={e => handleUpdateKR(kr.id, { unit: e.target.value })} />
                    <span className="ml-auto font-medium">{pct}%</span>
                  </div>
                )}
                <Progress value={pct} className="h-1.5" />
                {hasLinkedTasks && (
                  <div className="space-y-0.5 pl-1">
                    {linkedTasks.map((t: Task) => (
                      <button
                        key={t.id}
                        className="w-full flex items-center gap-1.5 text-[11px] px-1.5 py-0.5 rounded hover:bg-accent text-left"
                        onClick={() => goToItem('task', t.id)}
                      >
                        {t.status === 'done' ? <CheckSquare className="w-3 h-3 text-green-500" /> : <Square className="w-3 h-3 text-muted-foreground" />}
                        <span className={cn('truncate flex-1', t.status === 'done' && 'line-through text-muted-foreground')}>{t.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                  <span>信心值</span>
                  {[1, 3, 5, 7, 9].map(v => {
                    const colorMap: Record<number, string> = { 1: 'bg-red-500 border-red-500', 3: 'bg-orange-500 border-orange-500', 5: 'bg-yellow-500 border-yellow-500', 7: 'bg-emerald-500 border-emerald-500', 9: 'bg-green-600 border-green-600' };
                    return <button key={v} onClick={() => handleUpdateKR(kr.id, { confidence: v })} className={`w-5 h-4 rounded-sm border transition-colors text-white text-[9px] font-medium ${kr.confidence === v ? colorMap[v] : 'border-border hover:border-primary/50'}`}>{v}</button>;
                  })}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1 flex-wrap">
                  <select className="border border-input rounded px-1 py-0.5 text-[10px] bg-card" value={kr.track || 'okr'} onChange={e => handleUpdateKR(kr.id, { track: e.target.value as KrTrack })}>
                    <option value="okr">OKR冲高</option>
                    <option value="kpi">KPI考核</option>
                    <option value="both">双轨</option>
                  </select>
                  {(kr.track === 'kpi' || kr.track === 'both') && (<>
                    <label className="flex items-center gap-0.5">权重<input type="number" className="w-10 border border-input rounded px-1 py-0.5 text-[10px]" value={kr.weight ?? 1} onChange={e => handleUpdateKR(kr.id, { weight: Number(e.target.value) || 1 })} /></label>
                    <label className="flex items-center gap-0.5">及格线<input type="number" className="w-12 border border-input rounded px-1 py-0.5 text-[10px]" value={kr.kpiBaseline ?? ''} placeholder="0" onChange={e => handleUpdateKR(kr.id, { kpiBaseline: e.target.value ? Number(e.target.value) : undefined })} /></label>
                    <label className="flex items-center gap-0.5">达标线<input type="number" className="w-12 border border-input rounded px-1 py-0.5 text-[10px]" value={kr.kpiTarget ?? ''} placeholder={String(kr.targetValue)} onChange={e => handleUpdateKR(kr.id, { kpiTarget: e.target.value ? Number(e.target.value) : undefined })} /></label>
                    {(() => { const { score, status } = calcKpiKrScore(kr); return <span className={cn('px-1.5 py-0.5 rounded border text-[9px] font-medium', getKpiStatusColor(status))}>{getKpiStatusLabel(status)} {score}分</span>; })()}
                  </>)}
                </div>
              </div>
            );
          })}
          {(goal.keyResults || []).length < 5 ? (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddKR} disabled={!canEdit}><Plus className="w-3.5 h-3.5" />添加关键结果</Button>
          ) : (
            <span className="text-xs text-muted-foreground">最多创建5个关键结果</span>
          )}
        </div>
      </Section>

      <Section title="关联项目" icon={<FolderKanban className="w-3.5 h-3.5" />} action={<button className="p-1 rounded hover:bg-accent cursor-pointer" onClick={() => setShowAddProject(v => !v)} aria-label="添加关联项目"><Plus className="w-3.5 h-3.5" /></button>}>
        <div className="space-y-1">
          {state.projects.filter(p => p.goalId === goal.id).map(p => (
            <div key={p.id} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-accent cursor-pointer">
              <FolderKanban className="w-3.5 h-3.5 text-orange-500" />
              <span className="flex-1 truncate">{p.title}</span>
              <span className={cn('px-1.5 py-0.5 rounded text-[10px]', STATUS_MAP[p.status]?.color)}>{STATUS_MAP[p.status]?.label}</span>
            </div>
          ))}
          {state.projects.filter(p => p.goalId === goal.id).length === 0 && <EmptyState title="暂无关联项目" compact />}
          {showAddProject && (
            <div className="flex gap-2 mt-2">
              <input className="flex-1 px-2 py-1 text-sm border rounded" placeholder="项目名称" value={newProjectTitle} onChange={e => setNewProjectTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddProject(); }} />
              <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded" onClick={handleAddProject}>创建</button>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}
