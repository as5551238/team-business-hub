import { useState } from 'react';
import { REVIEW_MODELS, CATEGORY_LABELS, CATEGORY_COLORS } from '@/lib/reviewModelRegistry';
import type { ReviewModel, ReviewModelCategory } from '@/types';
import { BookOpen, Play, Clock, CheckCircle, ChevronRight, ChevronDown, Sparkles, Search } from 'lucide-react';

interface Props {
  onSelectModel: (model: ReviewModel) => void;
}

export function ReviewModelLibrary({ onSelectModel }: Props) {
  const [filterCategory, setFilterCategory] = useState<ReviewModelCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredModels = REVIEW_MODELS.filter(m => {
    if (filterCategory !== 'all' && m.category !== filterCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.nameEn.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[140px] max-w-[280px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full border border-input rounded-lg pl-8 pr-3 py-1.5 text-sm"
            placeholder="搜索复盘模型..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${filterCategory === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
          >
            全部
          </button>
          {(Object.entries(CATEGORY_LABELS) as [ReviewModelCategory, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilterCategory(key)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${filterCategory === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredModels.map(model => {
          const isExpanded = expandedId === model.id;
          return (
            <div
              key={model.id}
              className="border border-border rounded-lg p-3 bg-card hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <BookOpen size={14} className="text-primary shrink-0" />
                    <span className="text-sm font-medium truncate">{model.name}</span>
                    <span className="text-[10px] text-muted-foreground">{model.nameEn}</span>
                  </div>
                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded mt-1 ${CATEGORY_COLORS[model.category]}`}>
                    {CATEGORY_LABELS[model.category]}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => onSelectModel(model)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Play size={11} /> 开始
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{model.description}</p>

              {/* Steps preview */}
              <div className="mt-2">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : model.id)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                >
                  {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  {model.steps.length} 个步骤
                </button>
                {isExpanded && (
                  <div className="mt-1.5 space-y-1">
                    {model.steps.map(step => (
                      <div key={step.index} className="flex items-center gap-2 text-[10px]">
                        <span className="w-4 h-4 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-medium shrink-0">
                          {step.index}
                        </span>
                        <span className="truncate">{step.title}</span>
                        {step.aiAutoFill && (
                          <span className="text-primary flex items-center gap-0.5 shrink-0">
                            <Sparkles size={9} /> AI
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Scenarios */}
              <div className="mt-2 flex gap-1 flex-wrap">
                {model.applicableScenarios.slice(0, 3).map(s => (
                  <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {filteredModels.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">未找到匹配的复盘模型</div>
      )}
    </div>
  );
}
