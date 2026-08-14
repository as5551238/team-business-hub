import type { KnowledgeStatus, KnowledgePriority, KnowledgeVisibility } from '@/types';

export const KNOWLEDGE_STATUSES: { value: KnowledgeStatus; label: string; cls: string }[] = [
  { value: 'active', label: '进行中', cls: 'bg-emerald-50 text-emerald-600' },
  { value: 'draft', label: '草稿', cls: 'bg-amber-50 text-amber-600' },
  { value: 'archived', label: '已归档', cls: 'bg-gray-100 text-gray-500' },
];

export const KNOWLEDGE_PRIORITIES: { value: KnowledgePriority; label: string; cls: string }[] = [
  { value: 'low', label: '低', cls: 'bg-gray-50 text-gray-500' },
  { value: 'medium', label: '中', cls: 'bg-blue-50 text-blue-600' },
  { value: 'high', label: '高', cls: 'bg-amber-50 text-amber-600' },
  { value: 'urgent', label: '紧急', cls: 'bg-red-50 text-red-600' },
];

export const KNOWLEDGE_VISIBILITIES: { value: KnowledgeVisibility; label: string; cls: string }[] = [
  { value: 'personal', label: '个人', cls: 'bg-purple-50 text-purple-600' },
  { value: 'team', label: '团队', cls: 'bg-sky-50 text-sky-600' },
  { value: 'team_editable', label: '团队可编辑', cls: 'bg-teal-50 text-teal-600' },
];

export function KnowledgeStatusBadge({ status }: { status?: KnowledgeStatus }) {
  const s = KNOWLEDGE_STATUSES.find(x => x.value === status) || KNOWLEDGE_STATUSES[0];
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${s.cls}`}>{s.label}</span>;
}

export function KnowledgePriorityBadge({ priority }: { priority?: KnowledgePriority }) {
  if (!priority || priority === 'medium') return null;
  const p = KNOWLEDGE_PRIORITIES.find(x => x.value === priority) || KNOWLEDGE_PRIORITIES[1];
  return <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${p.cls}`}>{p.label}</span>;
}