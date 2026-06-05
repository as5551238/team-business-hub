import type { AppState, PerformanceReview, SkillRating, EffectivenessMetric, AISuggestion, ReviewKnowledge, OKRScore, CapacityPlan, DSTEPhase, BusinessValueEntry } from '@/types';
import type { Action } from './types';
import { supabaseInsert, supabaseUpdate, supabaseDelete } from './supabase';
import { genId } from './utils';
import { reducerCanDelete, needMutate, tsNow } from './shared';

export function performanceReducer(state: AppState, action: Action): AppState | null {
  switch (action.type) {
    case 'ADD_PERFORMANCE_REVIEW': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['performanceReviews']);
      const now = tsNow();
      const review: PerformanceReview = {
        ...action.payload,
        id: genId('prv'),
        createdAt: now,
      };
      s.performanceReviews.push(review);
      supabaseInsert('performance_reviews', {
        id: review.id, season_id: review.seasonId, reviewee_id: review.revieweeId,
        status: review.status, self_review: review.selfReview ? JSON.stringify(review.selfReview) : null,
        peer_reviews: JSON.stringify(review.peerReviews), manager_review: review.managerReview ? JSON.stringify(review.managerReview) : null,
        direct_report_reviews: JSON.stringify(review.directReportReviews),
        ai_summary: review.aiSummary, final_score: review.finalScore,
        team_id: review.teamId, created_at: now, completed_at: review.completedAt,
      });
      return s;
    }
    case 'UPDATE_PERFORMANCE_REVIEW': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['performanceReviews']);
      const idx = s.performanceReviews.findIndex(r => r.id === action.payload.id);
      if (idx !== -1) {
        s.performanceReviews[idx] = { ...s.performanceReviews[idx], ...action.payload.updates };
        const updates: Record<string, unknown> = { ...action.payload.updates };
        if (updates.selfReview) updates.self_review = JSON.stringify(updates.selfReview);
        if (updates.peerReviews) updates.peer_reviews = JSON.stringify(updates.peerReviews);
        if (updates.managerReview) updates.manager_review = JSON.stringify(updates.managerReview);
        if (updates.directReportReviews) updates.direct_report_reviews = JSON.stringify(updates.directReportReviews);
        supabaseUpdate('performance_reviews', action.payload.id, updates);
      }
      return s;
    }
    case 'DELETE_PERFORMANCE_REVIEW': {
      if (!reducerCanDelete(state, 'settings_manage')) return state;
      const s = needMutate(state, ['performanceReviews']);
      s.performanceReviews = s.performanceReviews.filter(r => r.id !== action.payload);
      supabaseDelete('performance_reviews', action.payload);
      return s;
    }
    case 'ADD_SKILL_RATING': {
      const s = needMutate(state, ['skillRatings']);
      const existing = s.skillRatings.findIndex(r => r.memberId === action.payload.memberId && r.skillId === action.payload.skillId);
      if (existing !== -1) {
        s.skillRatings[existing] = { ...action.payload, updatedAt: tsNow() };
      } else {
        s.skillRatings.push({ ...action.payload, updatedAt: tsNow() });
      }
      return s;
    }
    case 'UPDATE_SKILL_RATING': {
      const s = needMutate(state, ['skillRatings']);
      const idx = s.skillRatings.findIndex(r => r.memberId === action.payload.memberId && r.skillId === action.payload.skillId);
      if (idx !== -1) {
        s.skillRatings[idx] = { ...s.skillRatings[idx], ...action.payload.updates, updatedAt: tsNow() };
      }
      return s;
    }
    case 'ADD_EFFECTIVENESS_METRIC': {
      const s = needMutate(state, ['effectivenessMetrics']);
      const metric: EffectivenessMetric = { ...action.payload, id: genId('efm'), measuredAt: tsNow() };
      s.effectivenessMetrics.push(metric);
      return s;
    }
    case 'UPDATE_EFFECTIVENESS_METRIC': {
      const s = needMutate(state, ['effectivenessMetrics']);
      const idx = s.effectivenessMetrics.findIndex(m => m.id === action.payload.id);
      if (idx !== -1) s.effectivenessMetrics[idx] = { ...s.effectivenessMetrics[idx], ...action.payload.updates };
      return s;
    }
    case 'DELETE_EFFECTIVENESS_METRIC': {
      const s = needMutate(state, ['effectivenessMetrics']);
      s.effectivenessMetrics = s.effectivenessMetrics.filter(m => m.id !== action.payload);
      return s;
    }
    case 'ADD_AI_SUGGESTION': {
      const s = needMutate(state, ['aiSuggestions']);
      const suggestion: AISuggestion = { ...action.payload, id: genId('ais'), createdAt: tsNow() };
      s.aiSuggestions.push(suggestion);
      return s;
    }
    case 'UPDATE_AI_SUGGESTION': {
      const s = needMutate(state, ['aiSuggestions']);
      const idx = s.aiSuggestions.findIndex(a => a.id === action.payload.id);
      if (idx !== -1) s.aiSuggestions[idx] = { ...s.aiSuggestions[idx], ...action.payload.updates };
      return s;
    }
    case 'ADD_REVIEW_KNOWLEDGE': {
      const s = needMutate(state, ['reviewKnowledge']);
      const entry: ReviewKnowledge = { ...action.payload, id: genId('rkn'), createdAt: tsNow() };
      s.reviewKnowledge.push(entry);
      return s;
    }
    case 'ADD_OKR_SCORE': {
      const s = needMutate(state, ['okrScores']);
      const existing = s.okrScores.findIndex(o => o.goalId === action.payload.goalId && o.seasonId === action.payload.seasonId);
      if (existing !== -1) {
        s.okrScores[existing] = action.payload;
      } else {
        s.okrScores.push(action.payload);
      }
      return s;
    }
    case 'ADD_CAPACITY_PLAN': {
      const s = needMutate(state, ['capacityPlans']);
      const plan: CapacityPlan = { ...action.payload, id: genId('cap'), createdAt: tsNow() };
      s.capacityPlans.push(plan);
      return s;
    }
    case 'UPDATE_CAPACITY_PLAN': {
      const s = needMutate(state, ['capacityPlans']);
      const idx = s.capacityPlans.findIndex(p => p.id === action.payload.id);
      if (idx !== -1) s.capacityPlans[idx] = { ...s.capacityPlans[idx], ...action.payload.updates };
      return s;
    }
    case 'ADD_DSTE_PHASE': {
      const s = needMutate(state, ['dstePhases']);
      const phase: DSTEPhase = { ...action.payload, id: genId('dst') };
      s.dstePhases.push(phase);
      return s;
    }
    case 'UPDATE_DSTE_PHASE': {
      const s = needMutate(state, ['dstePhases']);
      const idx = s.dstePhases.findIndex(p => p.id === action.payload.id);
      if (idx !== -1) s.dstePhases[idx] = { ...s.dstePhases[idx], ...action.payload.updates };
      return s;
    }
    case 'ADD_BUSINESS_VALUE': {
      const s = needMutate(state, ['businessValues']);
      const entry: BusinessValueEntry = { ...action.payload, id: genId('bv') };
      s.businessValues.push(entry);
      return s;
    }
    case 'DELETE_BUSINESS_VALUE': {
      const s = needMutate(state, ['businessValues']);
      s.businessValues = s.businessValues.filter(b => b.id !== action.payload);
      return s;
    }
  }
  return null;
}
