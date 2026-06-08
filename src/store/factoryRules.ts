import type { AutomationRule } from '@/types';

export function getFactoryRules(): AutomationRule[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'factory-due-remind',
      name: '任务到期提醒',
      enabled: true,
      itemType: 'task',
      trigger: 'due_arrive',
      condition: { field: 'status', operator: 'neq', value: 'done' },
      actions: [
        { type: 'notify', config: { title: '任务即将到期', message: '您有任务即将到期，请及时处理' } },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'factory-overdue-escalate',
      name: '任务逾期升级',
      enabled: true,
      itemType: 'task',
      trigger: 'overdue',
      condition: { field: 'status', operator: 'neq', value: 'done' },
      actions: [
        { type: 'escalation', config: { title: '任务逾期升级', message: '有任务已逾期，请关注' } },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'factory-kr-lag-alert',
      name: 'KR进度异常预警',
      enabled: true,
      itemType: 'goal',
      trigger: 'kr_lag',
      condition: { field: 'status', operator: 'eq', value: 'in_progress' },
      actions: [
        { type: 'notify', config: { title: 'KR进度滞后', message: '关键结果进度落后，请关注' } },
        { type: 'ai_action', config: { actionId: 'get_risk_items' } },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'factory-task-smart-assign',
      name: '新任务智能分配',
      enabled: true,
      itemType: 'task',
      trigger: 'item_created',
      condition: { field: 'leaderId', operator: 'empty', value: '' },
      actions: [
        { type: 'ai_action', config: { actionId: 'smart_assign', strategy: 'auto' } },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'factory-status-change-notify',
      name: '状态变更通知',
      enabled: true,
      itemType: 'task',
      trigger: 'status_change',
      condition: { field: 'status', operator: 'eq', value: 'done' },
      actions: [
        { type: 'notify', config: { title: '任务完成', message: '任务已标记为完成' } },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
}
