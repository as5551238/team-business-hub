import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { SkillRating, SkillDefinition } from '@/types';
import { Plus, X, AlertTriangle } from 'lucide-react';
import { inputCls, primaryBtnCls, btnCls } from './constants';

const DEFAULT_SKILLS: SkillDefinition[] = [
  { id: 'frontend', name: '前端开发', category: '技术', targetLevel: 4 },
  { id: 'backend', name: '后端开发', category: '技术', targetLevel: 3 },
  { id: 'product', name: '产品设计', category: '产品', targetLevel: 3 },
  { id: 'data', name: '数据分析', category: '数据', targetLevel: 3 },
  { id: 'pm', name: '项目管理', category: '管理', targetLevel: 4 },
  { id: 'comm', name: '沟通协作', category: '软技能', targetLevel: 4 },
  { id: 'ai', name: 'AI应用', category: '技术', targetLevel: 3 },
  { id: 'leadership', name: '领导力', category: '管理', targetLevel: 3 },
];

const LEVEL_COLORS = ['', 'bg-red-200', 'bg-orange-200', 'bg-yellow-200', 'bg-emerald-200', 'bg-blue-200'];
const LEVEL_LABELS = ['', '入门', '基础', '熟练', '精通', '专家'];

export function SkillMatrixTab() {
  const { state, dispatch } = useStore();
  const [skills] = useState<SkillDefinition[]>(DEFAULT_SKILLS);
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('技术');
  const [editingCell, setEditingCell] = useState<{ memberId: string; skillId: string } | null>(null);

  const members = state.members.filter(m => m.status === 'active');
  const ratings = state.skillRatings;

  // Matrix data
  const matrix = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const m of members) map[m.id] = {};
    for (const r of ratings) {
      if (map[r.memberId]) map[r.memberId][r.skillId] = r.level;
    }
    return map;
  }, [members, ratings]);

  // Gaps
  const gaps = useMemo(() => {
    const result: { memberId: string; memberName: string; skillId: string; skillName: string; current: number; target: number; gap: number }[] = [];
    for (const m of members) {
      for (const sk of skills) {
        const current = matrix[m.id]?.[sk.id] || 0;
        const gap = sk.targetLevel - current;
        if (gap > 0) result.push({ memberId: m.id, memberName: m.name || m.nickname || '', skillId: sk.id, skillName: sk.name, current, target: sk.targetLevel, gap });
      }
    }
    return result.sort((a, b) => b.gap - a.gap);
  }, [members, skills, matrix]);

  // Average skill level
  const avgBySkill = useMemo(() => {
    const map: Record<string, { sum: number; count: number }> = {};
    for (const sk of skills) map[sk.id] = { sum: 0, count: 0 };
    for (const m of members) {
      for (const sk of skills) {
        const level = matrix[m.id]?.[sk.id] || 0;
        if (level > 0) { map[sk.id].sum += level; map[sk.id].count++; }
      }
    }
    return map;
  }, [members, skills, matrix]);

  function handleRate(memberId: string, skillId: string, level: number) {
    dispatch({ type: 'ADD_SKILL_RATING', payload: { memberId, skillId, level, updatedAt: new Date().toISOString() } });
    setEditingCell(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">技能矩阵</h3>
        <button onClick={() => setShowAddSkill(true)} className={btnCls}><Plus size={12} /> 技能</button>
      </div>

      {/* Heatmap Matrix */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-2 py-1.5 font-medium sticky left-0 bg-muted/50 z-10 min-w-[60px]">成员</th>
              {skills.map(sk => (
                <th key={sk.id} className="text-center px-1 py-1.5 font-medium min-w-[50px]" title={`目标: L${sk.targetLevel}`}>
                  <div className="truncate">{sk.name}</div>
                  <div className="text-[8px] text-muted-foreground">L{sk.targetLevel}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id} className="border-t">
                <td className="px-2 py-1.5 font-medium sticky left-0 bg-card z-10 truncate">{m.name || m.nickname}</td>
                {skills.map(sk => {
                  const level = matrix[m.id]?.[sk.id] || 0;
                  const isEditing = editingCell?.memberId === m.id && editingCell?.skillId === sk.id;
                  const isGap = level > 0 && level < sk.targetLevel;
                  return (
                    <td key={sk.id} className="text-center px-1 py-1">
                      {isEditing ? (
                        <select
                          className="border rounded px-1 py-0.5 text-[10px] w-10"
                          value={level}
                          onChange={e => handleRate(m.id, sk.id, Number(e.target.value))}
                          onBlur={() => setEditingCell(null)}
                          autoFocus
                        >
                          {[0,1,2,3,4,5].map(l => <option key={l} value={l}>{l || '-'}</option>)}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingCell({ memberId: m.id, skillId: sk.id })}
                          className={`w-8 h-6 rounded text-[10px] font-medium ${level > 0 ? LEVEL_COLORS[level] : 'bg-gray-50 text-gray-400'} ${isGap ? 'ring-1 ring-amber-400' : ''} hover:opacity-80`}
                          title={level > 0 ? `${LEVEL_LABELS[level]} (L${level})` : '未评级'}
                        >
                          {level || '-'}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* Average row */}
            <tr className="border-t bg-muted/30 font-medium">
              <td className="px-2 py-1.5 sticky left-0 bg-muted/30 z-10">平均</td>
              {skills.map(sk => {
                const stat = avgBySkill[sk.id];
                const avg = stat.count > 0 ? stat.sum / stat.count : 0;
                return <td key={sk.id} className="text-center px-1 py-1.5 text-[10px]">{stat.count > 0 ? avg.toFixed(1) : '-'}</td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Skill Gaps */}
      {gaps.length > 0 && (
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-amber-500" />
            <span className="text-[11px] font-semibold">技能缺口 ({gaps.length})</span>
          </div>
          <div className="space-y-1">
            {gaps.slice(0, 10).map((g, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] px-2 py-1 rounded bg-amber-50">
                <span className="w-16 truncate font-medium">{g.memberName}</span>
                <span className="flex-1">{g.skillName}</span>
                <span className="text-amber-700">L{g.current} → L{g.target}</span>
                <span className="w-6 text-right font-bold text-red-600">-{g.gap}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Skill Dialog */}
      {showAddSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowAddSkill(false)} />
          <div className="relative bg-card rounded-xl shadow-xl border w-full max-w-xs animate-slide-up p-4 space-y-3">
            <h3 className="font-semibold text-sm">添加技能</h3>
            <input className={inputCls} placeholder="技能名称" value={newSkillName} onChange={e => setNewSkillName(e.target.value)} />
            <select className={inputCls} value={newSkillCategory} onChange={e => setNewSkillCategory(e.target.value)}>
              {['技术','产品','数据','管理','软技能'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddSkill(false)} className={btnCls}>取消</button>
              <button onClick={() => { if (!newSkillName.trim()) return; skills.push({ id: newSkillName.toLowerCase().replace(/\s+/g, '_'), name: newSkillName, category: newSkillCategory, targetLevel: 3 }); setNewSkillName(''); setShowAddSkill(false); }} className={primaryBtnCls}>添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
