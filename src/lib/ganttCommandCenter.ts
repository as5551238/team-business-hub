/**
 * G6: 智能甘特指挥舱 — AI驱动的项目全局管理中枢
 *
 * 设计文档（中长期），当前阶段只定义数据结构和接口
 *
 * 核心能力：
 * 1. 实时风险热力图 — 基于CPM+延期预测+资源瓶颈的3D热力图
 * 2. 自动化缓冲区管理 — 关键路径自动插入安全缓冲
 * 3. 资源冲突预测 — 多项目共享资源时的冲突检测
 * 4. 一键排程优化 — AI基于多约束的NP-Hard排程求解
 */

// ===== 数据结构 =====

export interface ProjectRiskHeatmap {
  projectId: string;
  projectTitle: string;
  /** 风险得分 0-100 */
  riskScore: number;
  /** 风险级别 */
  riskLevel: 'safe' | 'watch' | 'danger' | 'critical';
  /** 风险分解 */
  breakdown: {
    scheduleRisk: number;  // 进度风险 (0-100)
    resourceRisk: number;  // 资源风险 (0-100)
    dependencyRisk: number; // 依赖风险 (0-100)
    qualityRisk: number;   // 质量风险 (0-100)
  };
  /** 关键洞察 */
  insights: string[];
}

export interface BufferSuggestion {
  taskId: string;
  taskTitle: string;
  /** 建议缓冲天数 */
  bufferDays: number;
  /** 原因 */
  reason: string;
  /** 缓冲类型 */
  type: 'safety' | 'resource' | 'dependency';
}

export interface ResourceConflict {
  memberId: string;
  memberName: string;
  /** 冲突时间段 */
  conflictingPeriods: Array<{
    start: string;
    end: string;
    taskCount: number;
    projectIds: string[];
  }>;
}

// ===== 核心接口（后续实现） =====

export interface GanttCommandCenter {
  /** 计算项目风险热力图 */
  calcRiskHeatmap(projectIds: string[]): ProjectRiskHeatmap[];
  /** 建议关键路径缓冲区 */
  suggestBuffers(projectId: string): BufferSuggestion[];
  /** 检测跨项目资源冲突 */
  detectResourceConflicts(): ResourceConflict[];
  /** 一键优化排程 */
  optimizeSchedule(projectId: string): Promise<{
    optimized: boolean;
    improvements: number;
    summary: string;
  }>;
}

/**
 * 当前实现状态：接口定义完成，核心算法待实现
 * 依赖：E2(延期预测) + E6(资源瓶颈) + G4(AI排程×CPM) 已完成
 * 下一步：集成以上三个模块到指挥舱 UI
 */
