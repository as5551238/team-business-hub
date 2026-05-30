export { collectSnapshot, getPeriodRange } from './dataCollector';
export type { PeriodSnapshot } from './dataCollector';
export { analyzeTeam, computeHealth, detectRisks, computeEfficiency } from './analysisEngine';
export { getAIInsights, generateLocalInsights, callLLM } from './llmService';
export type { AIInsight } from './types';
export { loadAIConfig, saveAIConfig, DEFAULT_AI_CONFIG, PROVIDER_PRESETS, PERIOD_LABELS, HEALTH_LEVEL_LABELS, HEALTH_LEVEL_COLORS, HEALTH_LEVEL_BG, RISK_SEVERITY_LABELS, RISK_SEVERITY_COLORS, RISK_TYPE_LABELS } from './types';
export type { AIConfig, AIModelProvider, AnalysisPeriod, HealthScore, RiskItem, EfficiencyMetrics, TeamAnalysis, MemberAnalysis, SuggestedAction } from './types';
// Phase 1: AI 上下文引擎 + 智能进展摘要 + 智能搜索
export { buildAIContext, extractFocusItems } from './aiContextEngine';
export type { ItemContext, AIProjectContext } from './aiContextEngine';
export { generateLocalSummary, generateDeepSummary } from './aiSummaryGenerator';
export type { ProgressSummary, SummaryPeriod } from './aiSummaryGenerator';
export { smartSearch, suggestRelated } from './aiSmartSearch';
export type { SearchResult, SmartSearchResults } from './aiSmartSearch';
// Phase 2: AI 目标拆解引擎
export { generateLocalDecomposition, generateDeepDecomposition } from './aiDecomposition';
export type { KRDraft, TaskDraft, DecompositionResult } from './aiDecomposition';
// Phase 2: AI 风险预测引擎
export { predictRisksLocal, predictRisksDeep } from './aiRiskPredictor';
export type { PredictedRisk, SchedulePrediction, ResourceBottleneck, RiskPredictionResult, RiskProbability, RiskTimeframe } from './aiRiskPredictor';
// Phase 2: AI 方法论推荐引擎
export { recommendMethodologyLocal, recommendMethodologyDeep } from './aiMethodology';
export type { MethodologyId, MethodologyRecommendation, MethodologyStep, TeamPattern, MethodologyResult } from './aiMethodology';
// Phase 2: AI 团队能力向量模型
export { buildTeamCapabilityLocal, buildTeamCapabilityDeep, DIMENSION_LABELS } from './aiTeamCapability';
export type { CapabilityVector, TeamCapabilityMap, CapabilityDimension } from './aiTeamCapability';
// Phase 2: AI 约束求解器
export { optimizeAssignmentsLocal, optimizeAssignmentsDeep } from './aiConstraintSolver';
export type { AssignmentSuggestion, OptimizationResult } from './aiConstraintSolver';
// Phase 3: AI 人-任务智能匹配
export { matchTasksLocal, matchTasksDeep } from './aiMatcher';
export type { TaskMatchResult, MemberTaskRecommendation, MatchResult, MatchExplanation } from './aiMatcher';
// Phase 3: AI 动态资源再分配
export { reallocateResourcesLocal, reallocateResourcesDeep } from './aiResourceReallocator';
export type { ReallocSuggestion, ReallocAction, ResourceImbalance, ReallocResult } from './aiResourceReallocator';
// Phase 3: AI 智能复盘 + OKR螺旋反馈
export { generateReviewLocal, generateReviewDeep } from './aiReviewGenerator';
export type { ReviewSection, OKRFeedback, ReviewResult } from './aiReviewGenerator';
// Phase 4: AI 愿景→策略→目标级联
export { cascadeVisionLocal, cascadeVisionDeep } from './aiVisionStrategy';
export type { StrategyDirection, VisionCascade } from './aiVisionStrategy';
// Phase 4: AI 能力缺口诊断
export { diagnoseCapabilityGapLocal, diagnoseCapabilityGapDeep } from './aiCapabilityGap';
export type { CapabilityGap, GapDiagnosisResult, GapSeverity, GapStrategy } from './aiCapabilityGap';
// Phase 4: AI 方法论自进化
export { evolveMethodologyLocal, evolveMethodologyDeep, recordMethodologyEffect } from './aiMethodologyEvolution';
export type { MethodologyEffectRecord, EvolutionEntry, MethodologyEvolutionResult } from './aiMethodologyEvolution';
// Phase 4: AI 全局最优资源分配
export { optimizeGlobalAllocationLocal, optimizeGlobalAllocationDeep } from './aiGlobalOptimizer';
export type { GlobalAllocation } from './aiGlobalOptimizer';
// Phase 5: AI 自动排程引擎
export { autoScheduleLocal, autoScheduleDeep } from './aiAutoScheduler';
export type { ScheduleSuggestion, AutoScheduleResult } from './aiAutoScheduler';
// Phase 5: 协作健康度评分
export { computeCollaborationHealth } from './aiCollaborationHealth';
export type { CollaborationHealth } from './aiCollaborationHealth';
