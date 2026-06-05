import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { PerformanceReview, ReviewAnswer, ReviewRole } from '@/types';
import { Plus, X, CheckCircle, Clock, Users, Star, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { inputCls, primaryBtnCls, btnCls } from './constants';

const RATING_DIMENSIONS = ['执行力', '协作能力', '创新能力', '责任感', '学习成长'];

const ROLE_LABELS: Record<ReviewRole, string> = { self: '自评', peer: '同事评', manager: '上级评', direct_report: '下属评' };

const STATUS_LABELS: Record<string, string> = { pending: '待评估', in_progress: '评估中', completed: '已完成' };
const STATUS_COLORS: Record<string, string> = { pending: 'bg-gray-100 text-gray-700', in_progress: 'bg-blue-100 text-blue-700', completed: 'bg-emerald-100 text-emerald-700' };

export function PerformanceTab() {
  const { state, dispatch } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedReview, setSelectedReview] = useState<string | null>(null);
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState<'self' | 'peer' | 'manager' | 'direct_report' | null>(null);

  // Create form
  const [formRevieweeId, setFormRevieweeId] = useState('');
  const [formSeasonId, setFormSeasonId] = useState('');

  // Rating form
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');

  const reviews = state.performanceReviews;
  const members = state.members.filter(m => m.status === 'active');

  // Stats
  const completedCount = reviews.filter(r => r.status === 'completed').length;
  const avgScore = useMemo(() => {
    const scored = reviews.filter(r => r.finalScore != null);
    return scored.length > 0 ? scored.reduce((s, r) => s + (r.finalScore || 0), 0) / scored.length : 0;
  }, [reviews]);

  function handleCreate() {
    if (!formRevieweeId) return;
    dispatch({
      type: 'ADD_PERFORMANCE_REVIEW',
      payload: {
        seasonId: formSeasonId || null,
        revieweeId: formRevieweeId,
        status: 'pending',
        selfReview: null,
        peerReviews: [],
        managerReview: null,
        directReportReviews: [],
        aiSummary: null,
        finalScore: null,
        teamId: state.currentTeamId || '__default__',
        completedAt: null,
      },
    });
    setFormRevieweeId(''); setFormSeasonId(''); setShowCreate(false);
  }

  function handleSubmitReview(reviewId: string, role: ReviewRole) {
    const answer: ReviewAnswer = {
      reviewerId: state.currentUser?.id || '',
      role,
      ratings,
      strengths,
      improvements,
      submittedAt: new Date().toISOString(),
    };
    const review = reviews.find(r => r.id === reviewId);
    if (!review) return;
    const updates: Partial<PerformanceReview> = {};
    if (role === 'self') updates.selfReview = answer;
    else if (role === 'manager') updates.managerReview = answer;
    else if (role === 'peer') updates.peerReviews = [...review.peerReviews, answer];
    else updates.directReportReviews = [...review.directReportReviews, answer];
    // Auto-complete if all reviews done
    const hasSelf = role === 'self' ? true : !!review.selfReview;
    const hasMgr = role === 'manager' ? true : !!review.managerReview;
    if (hasSelf && hasMgr) updates.status = 'completed';
    else updates.status = 'in_progress';
    dispatch({ type: 'UPDATE_PERFORMANCE_REVIEW', payload: { id: reviewId, updates } });
    setRatings({}); setStrengths(''); setImprovements(''); setReviewMode(null);
  }

  function handleAISummary(reviewId: string) {
    const review = reviews.find(r => r.id === reviewId);
    if (!review) return;
    const allRatings: number[] = [];
    if (review.selfReview) Object.values(review.selfReview.ratings).forEach(v => allRatings.push(v));
    if (review.managerReview) Object.values(review.managerReview.ratings).forEach(v => allRatings.push(v));
    review.peerReviews.forEach(pr => Object.values(pr.ratings).forEach(v => allRatings.push(v)));
    const avg = allRatings.length > 0 ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : 0;
    const summary = `综合评分：${avg.toFixed(1)}/5。${avg >= 4 ? '表现优异' : avg >= 3 ? '表现良好' : '有待提升'}。`;
    dispatch({ type: 'UPDATE_PERFORMANCE_REVIEW', payload: { id: reviewId, updates: { aiSummary: summary, finalScore: Math.round(avg * 20) / 100 } } });
  }

  function handleDelete(id: string) {
    dispatch({ type: 'DELETE_PERFORMANCE_REVIEW', payload: id });
  }

  const selected = reviews.find(r => r.id === selectedReview);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground">总评估</div>
          <div className="text-lg font-bold">{reviews.length}</div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground">已完成</div>
          <div className="text-lg font-bold text-emerald-600">{completedCount}</div>
        </div>
        <div className="border rounded-lg p-3">
          <div className="text-[10px] text-muted-foreground">平均分</div>
          <div className="text-lg font-bold text-primary">{avgScore.toFixed(2)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setShowCreate(true)} className={primaryBtnCls}><Plus size={12} /> 发起评估</button>
      </div>

      {/* Review List */}
      {reviews.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-xs">暂无绩效评估</div>
      )}
      <div className="space-y-2">
        {reviews.map(review => {
          const reviewee = members.find(m => m.id === review.revieweeId);
          const isExpanded = expandedReview === review.id;
          const allRatings: number[] = [];
          if (review.selfReview) Object.values(review.selfReview.ratings).forEach(v => allRatings.push(v));
          if (review.managerReview) Object.values(review.managerReview.ratings).forEach(v => allRatings.push(v));
          const avgRating = allRatings.length > 0 ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : 0;
          return (
            <div key={review.id} className="border rounded-lg">
              <button className="w-full p-3 flex items-center gap-3 text-left hover:bg-muted/30" onClick={() => { setSelectedReview(review.id); setExpandedReview(isExpanded ? null : review.id); }}>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Users size={14} className="text-primary" />
                <span className="text-sm font-medium flex-1">{reviewee?.name || reviewee?.nickname || '未知'}</span>
                {avgRating > 0 && <span className="text-[11px] font-medium">{avgRating.toFixed(1)}/5</span>}
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${STATUS_COLORS[review.status]}`}>{STATUS_LABELS[review.status]}</span>
                <button onClick={e => { e.stopPropagation(); handleDelete(review.id); }} className="text-muted-foreground hover:text-destructive"><X size={12} /></button>
              </button>
              {isExpanded && (
                <div className="px-3 pb-3 space-y-3 animate-fade-in border-t pt-3">
                  {/* Completed reviews */}
                  {review.selfReview && (
                    <div className="border-l-2 border-blue-300 pl-3">
                      <div className="text-[11px] font-semibold text-blue-700 mb-1">自评</div>
                      <RatingsDisplay ratings={review.selfReview.ratings} />
                      {review.selfReview.strengths && <p className="text-[11px] mt-1"><span className="font-medium">优势：</span>{review.selfReview.strengths}</p>}
                      {review.selfReview.improvements && <p className="text-[11px]"><span className="font-medium">改进：</span>{review.selfReview.improvements}</p>}
                    </div>
                  )}
                  {review.managerReview && (
                    <div className="border-l-2 border-purple-300 pl-3">
                      <div className="text-[11px] font-semibold text-purple-700 mb-1">上级评</div>
                      <RatingsDisplay ratings={review.managerReview.ratings} />
                    </div>
                  )}
                  {review.peerReviews.map((pr, i) => (
                    <div key={i} className="border-l-2 border-emerald-300 pl-3">
                      <div className="text-[11px] font-semibold text-emerald-700 mb-1">同事评 #{i + 1}</div>
                      <RatingsDisplay ratings={pr.ratings} />
                    </div>
                  ))}
                  {/* AI Summary */}
                  {review.aiSummary && (
                    <div className="bg-primary/5 border border-primary/20 rounded p-2">
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-primary"><Sparkles size={10} /> AI总结</div>
                      <p className="text-[11px] mt-1">{review.aiSummary}</p>
                      {review.finalScore != null && <p className="text-[10px] text-muted-foreground">最终分数: {review.finalScore}</p>}
                    </div>
                  )}
                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {(!review.selfReview || !review.managerReview) && (
                      <>
                        {!review.selfReview && <button onClick={() => { setReviewMode('self'); setRatings({}); }} className={btnCls}>自评</button>}
                        {!review.managerReview && <button onClick={() => { setReviewMode('manager'); setRatings({}); }} className={btnCls}>上级评</button>}
                        <button onClick={() => { setReviewMode('peer'); setRatings({}); }} className={btnCls}>同事评</button>
                      </>
                    )}
                    {review.status === 'completed' && !review.aiSummary && (
                      <button onClick={() => handleAISummary(review.id)} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-primary/10 text-primary rounded hover:bg-primary/20">
                        <Sparkles size={10} /> AI总结
                      </button>
                    )}
                  </div>
                  {/* Rating form */}
                  {reviewMode && selectedReview === review.id && (
                    <RatingForm
                      ratings={ratings}
                      setRatings={setRatings}
                      strengths={strengths}
                      setStrengths={setStrengths}
                      improvements={improvements}
                      setImprovements={setImprovements}
                      onSubmit={() => handleSubmitReview(review.id, reviewMode!)}
                      onCancel={() => setReviewMode(null)}
                      role={reviewMode}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreate(false)} />
          <div className="relative bg-card rounded-xl shadow-xl border w-full max-w-md animate-slide-up">
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-sm">发起绩效评估</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-muted"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] font-medium block mb-1">被评人 *</label>
                <select className={inputCls} value={formRevieweeId} onChange={e => setFormRevieweeId(e.target.value)}>
                  <option value="">选择成员</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name || m.nickname}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium block mb-1">关联周期</label>
                <select className={inputCls} value={formSeasonId} onChange={e => setFormSeasonId(e.target.value)}>
                  <option value="">无</option>
                  {state.seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className={btnCls}>取消</button>
              <button onClick={handleCreate} disabled={!formRevieweeId} className={primaryBtnCls}>创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RatingsDisplay({ ratings }: { ratings: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(ratings).map(([dim, score]) => (
        <div key={dim} className="flex items-center gap-1 text-[10px]">
          <span className="text-muted-foreground">{dim}</span>
          <div className="flex">{[1,2,3,4,5].map(s => <Star key={s} size={8} className={s <= score ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} />)}</div>
        </div>
      ))}
    </div>
  );
}

function RatingForm({ ratings, setRatings, strengths, setStrengths, improvements, setImprovements, onSubmit, onCancel, role }: {
  ratings: Record<string, number>; setRatings: (r: Record<string, number>) => void;
  strengths: string; setStrengths: (s: string) => void;
  improvements: string; setImprovements: (s: string) => void;
  onSubmit: () => void; onCancel: () => void; role: ReviewRole;
}) {
  return (
    <div className="border rounded-lg p-3 space-y-2 animate-fade-in">
      <div className="text-[11px] font-semibold">{ROLE_LABELS[role]} — 评分</div>
      <div className="space-y-1">
        {RATING_DIMENSIONS.map(dim => (
          <div key={dim} className="flex items-center gap-2">
            <span className="text-[11px] w-16">{dim}</span>
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map(s => (
                <button key={s} onClick={() => setRatings({ ...ratings, [dim]: s })} className="p-0.5">
                  <Star size={14} className={s <= (ratings[dim] || 0) ? 'text-amber-400 fill-amber-400' : 'text-gray-300 hover:text-amber-300'} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <input className={inputCls} placeholder="优势..." value={strengths} onChange={e => setStrengths(e.target.value)} />
      <input className={inputCls} placeholder="改进建议..." value={improvements} onChange={e => setImprovements(e.target.value)} />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className={btnCls}>取消</button>
        <button onClick={onSubmit} disabled={Object.keys(ratings).length < 3} className={primaryBtnCls}>提交</button>
      </div>
    </div>
  );
}
