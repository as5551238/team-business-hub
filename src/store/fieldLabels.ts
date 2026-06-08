/**
 * S5-5: Unified field name → human-readable label map.
 * Shared across taskSlice, goalSlice, and projectSlice for undo descriptions and activity logs.
 * Individual slices no longer define their own maps — they import from here.
 */
export const fieldLabelMap: Record<string, string> = {
  // Common fields
  title: '标题',
  description: '描述',
  status: '状态',
  priority: '优先级',
  leaderId: '负责人',
  supporterIds: '协作人',
  tags: '标签',
  startDate: '开始日期',
  endDate: '结束日期',
  category: '分类',
  // Task-specific
  dueDate: '截止日期',
  projectId: '所属项目',
  parentId: '父级',
  blockedBy: '前置依赖',
  sprintId: '所属迭代',
  storyPoints: '故事点',
  reminderDate: '提醒日期',
  // Goal-specific
  goalId: '所属目标',
  type: '类型',
  seasonId: '所属赛季',
  strategyLevel: '战略层级',
};
