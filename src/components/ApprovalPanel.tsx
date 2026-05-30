import React, { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { GoalApprovalStatus } from '@/types';
import { shouldShowUpgrade } from '@/lib/featureGating';
import Paywall from '@/components/Paywall';
import { getTeamPlan } from '@/lib/featureGating';
import { Section } from './detail-shared';
import { Shield, CheckCircle2, XCircle, Clock, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ApprovalPanelProps {
  goalId: string;
  approvalStatus: GoalApprovalStatus;
  goalLeaderId: string;
}

const STATUS_BADGE: Record<GoalApprovalStatus, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: '草稿', color: 'bg-gray-100 text-gray-600', icon: <Shield className="w-3 h-3" /> },
  pending: { label: '审批中', color: 'bg-yellow-100 text-yellow-700', icon: <Clock className="w-3 h-3" /> },
  approved: { label: '已批准', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: '已驳回', color: 'bg-red-100 text-red-700', icon: <XCircle className="w-3 h-3" /> },
};

const ACTION_LABEL: Record<string, string> = {
  submit: '提交审批',
  approve: '批准',
  reject: '驳回',
  recall: '撤回',
};

export function ApprovalPanel({ goalId, approvalStatus, goalLeaderId }: ApprovalPanelProps) {
  const { state, dispatch } = useStore();
  const [comment, setComment] = useState('');
  const [paywallOpen, setPaywallOpen] = useState(false);

  const teamId = state.currentTeamId ?? '';
  const isGated = shouldShowUpgrade('approvalFlow', teamId, state.subscriptions);

  const currentUser = state.currentUser;
  const currentUserId = currentUser?.id ?? '';
  const currentRole = currentUser?.role;
  const isAdminOrManager = currentRole === 'admin' || currentRole === 'manager';
  const isLeader = goalLeaderId === currentUserId;

  const audits = useMemo(
    () => state.approvalAudits.filter(a => a.goalId === goalId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [state.approvalAudits, goalId],
  );

  if (isGated) {
    return (
      <Section title="审批" icon={<Shield className="w-3.5 h-3.5" />}>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">审批流功能需要升级到专业版</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPaywallOpen(true)}>了解详情</Button>
        </div>
        {paywallOpen && (
          <Paywall
            feature="审批流"
            currentTier={getTeamPlan(teamId, state.subscriptions)}
            onClose={() => setPaywallOpen(false)}
            onUpgrade={() => setPaywallOpen(false)}
          />
        )}
      </Section>
    );
  }

  const badge = STATUS_BADGE[approvalStatus];

  function handleSubmit() {
    dispatch({ type: 'SUBMIT_GOAL_APPROVAL', payload: goalId });
  }

  function handleApprove() {
    dispatch({ type: 'APPROVE_GOAL', payload: { id: goalId, comment } });
    setComment('');
  }

  function handleReject() {
    dispatch({ type: 'REJECT_GOAL', payload: { id: goalId, comment } });
    setComment('');
  }

  function handleRecall() {
    dispatch({ type: 'RECALL_GOAL_APPROVAL', payload: goalId });
  }

  return (
    <Section title="审批" icon={<Shield className="w-3.5 h-3.5" />}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>
            {badge.icon}
            {badge.label}
          </span>
        </div>

        {approvalStatus === 'draft' && (
          <Button size="sm" className="h-7 text-xs" onClick={handleSubmit}>
            <Send className="w-3 h-3 mr-1" />
            提交审批
          </Button>
        )}

        {approvalStatus === 'pending' && isAdminOrManager && (
          <div className="space-y-2">
            <textarea
              className="w-full text-xs border border-input rounded px-2 py-1 min-h-[40px] resize-none"
              placeholder="输入审批意见（可选）..."
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={handleApprove}>
                <CheckCircle2 className="w-3 h-3 mr-1" />
                批准
              </Button>
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleReject}>
                <XCircle className="w-3 h-3 mr-1" />
                驳回
              </Button>
            </div>
          </div>
        )}

        {approvalStatus === 'pending' && isLeader && !isAdminOrManager && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleRecall}>
            <RotateCcw className="w-3 h-3 mr-1" />
            撤回
          </Button>
        )}

        {audits.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">审批记录</p>
            <div className="space-y-1">
              {audits.map(a => {
                const actor = state.members.find(m => m.id === a.actorId);
                return (
                  <div key={a.id} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString('zh-CN')}
                    </span>
                    <span className="shrink-0 font-medium">{actor?.name ?? '未知'}</span>
                    <span className={a.action === 'approve' ? 'text-green-600' : a.action === 'reject' ? 'text-red-600' : a.action === 'recall' ? 'text-yellow-600' : 'text-blue-600'}>
                      {ACTION_LABEL[a.action] ?? a.action}
                    </span>
                    {a.comment && <span className="text-muted-foreground truncate">- {a.comment}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
